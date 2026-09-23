import type { TemplateEntitlement } from "@shared/schema";
import { storage } from "./storage";
import { getRgeOnboardingProgress, saveRgeOnboardingProgress } from "./rgeOnboardingProgress";
import { RGE_TEMPLATE_ID } from "@shared/rgePaths";
import { ensureGrowthEnginePurchasedTask } from "./growthEngineSetupService";
import type { UserLimits } from "./subscriptionService";

export const GROWTH_ENGINE_PROVISIONING_LOG = "[Growth Engine Provisioning]";
export const GROWTH_ENGINE_INSTALL_LOG = "[Growth Engine Install]";
export const GROWTH_ENGINE_LEGACY_WEBHOOK_LOG = "[Growth Engine Legacy Webhook]";

/**
 * Emit a best-effort, structured provisioning audit event. Observability must
 * never be allowed to change the outcome of an otherwise valid installation.
 */
export function logGrowthEngineProvisioningEvent(
  event: string,
  fields: Record<string, unknown>,
): void {
  try {
    console.info(
      GROWTH_ENGINE_PROVISIONING_LOG,
      JSON.stringify({ event, ...fields, loggedAt: new Date().toISOString() }),
    );
  } catch (error) {
    try {
      console.error(GROWTH_ENGINE_PROVISIONING_LOG, "audit event logging failed", error);
    } catch {
      // Logging is deliberately non-blocking, including when the logger itself fails.
    }
  }
}

export type ProvisionGrowthEngineResult = {
  entitlement: TemplateEntitlement;
  installCreated: boolean;
  progressInitialized: boolean;
  entitlementCreated: boolean;
};

/** Idempotently preserve the legacy entitlement row while creating an included Pro installation. */
export function shouldAutoGrantGrowthEngineViaAdminOverride(
  limits: Pick<
    UserLimits,
    "growthEngineEntitlementOverrideEnabled" | "growthEngineEntitlementOverrideGrant"
  >,
): boolean {
  return !!(
    limits.growthEngineEntitlementOverrideEnabled && limits.growthEngineEntitlementOverrideGrant
  );
}

/** Admin override can provision the same included installation without changing billing. */
export async function ensureAdminOverrideGrowthEngineEntitlement(
  userId: string,
  limits: Pick<
    UserLimits,
    "growthEngineEntitlementOverrideEnabled" | "growthEngineEntitlementOverrideGrant"
  >,
): Promise<TemplateEntitlement | undefined> {
  if (!shouldAutoGrantGrowthEngineViaAdminOverride(limits)) return undefined;

  const prior = await storage.getTemplateEntitlement(userId, RGE_TEMPLATE_ID);
  if (prior && prior.status !== "locked") return prior;

  const result = await provisionGrowthEngine(userId, { source: "admin_override" });
  logGrowthEngineProvisioningEvent("admin_override_entitlement_granted", {
    userId,
    templateId: RGE_TEMPLATE_ID,
    entitlementCreated: result.entitlementCreated,
    status: result.entitlement.status,
  });
  return result.entitlement;
}

export async function provisionGrowthEngine(
  userId: string,
  opts?: { source?: "admin_override" | "pro_included" },
): Promise<ProvisionGrowthEngineResult> {
  const prior = await storage.getTemplateEntitlement(userId, RGE_TEMPLATE_ID);
  const entitlementCreated = !prior || prior.status === "locked";

  const entitlement = await storage.upsertTemplateEntitlement(userId, RGE_TEMPLATE_ID, {
    status: "purchased",
    purchasedAt: prior?.purchasedAt ?? new Date(),
  });

  logGrowthEngineProvisioningEvent("entitlement_upserted", {
    userId,
    templateId: RGE_TEMPLATE_ID,
    source: opts?.source ?? "pro_included",
    entitlementCreated,
    status: entitlement.status,
  });

  let installCreated = false;
  const existingInstall = await storage.getTemplateInstall(userId, RGE_TEMPLATE_ID);
  if (!existingInstall) {
    await storage.createTemplateInstall({
      userId,
      templateId: RGE_TEMPLATE_ID,
      installStatus: "pending",
    });
    installCreated = true;
  }

  await ensureGrowthEnginePurchasedTask(userId).catch((e) =>
    console.error("[RGE] GE setup task after provisioning:", e),
  );

  const existingProgress = await getRgeOnboardingProgress(userId);
  let progressInitialized = false;
  if (!existingProgress) {
    await saveRgeOnboardingProgress(userId, { step: 1 }).catch((e) =>
      console.error("[RGE] onboarding progress init after provisioning:", e),
    );
    progressInitialized = true;
  }

  if (progressInitialized) {
    logGrowthEngineProvisioningEvent("onboarding_progress_initialized", {
      userId,
        source: opts?.source ?? "pro_included",
    });
  }

  return { entitlement, installCreated, progressInitialized, entitlementCreated };
}

/** After a partial reset, restore legacy entitlement state from install, progress, or ops task. */
export async function reconcileGrowthEngineEntitlement(userId: string): Promise<{
  entitlement: TemplateEntitlement | undefined;
  reconciled: boolean;
  priorStatus: string | null;
}> {
  const existing = await storage.getTemplateEntitlement(userId, RGE_TEMPLATE_ID);
  if (existing && existing.status !== "locked") {
    return { entitlement: existing, reconciled: false, priorStatus: existing.status };
  }

  const [install, progress, submission, setupTask] = await Promise.all([
    storage.getTemplateInstall(userId, RGE_TEMPLATE_ID),
    getRgeOnboardingProgress(userId),
    storage.getRealtorOnboardingSubmission(userId),
    storage.getGrowthEngineSetupTask(userId, RGE_TEMPLATE_ID),
  ]);

  const hasPartial = !!(install || progress || submission || setupTask);
  if (!hasPartial) {
    return { entitlement: existing, reconciled: false, priorStatus: existing?.status ?? null };
  }

  let status: "purchased" | "submitted" | "installed" = "purchased";
  if (submission) {
    status = install?.installStatus === "installed" ? "installed" : "submitted";
  } else if (existing?.status === "submitted" || existing?.status === "installed") {
    status = existing.status as "submitted" | "installed";
  }

  const ent = await storage.upsertTemplateEntitlement(userId, RGE_TEMPLATE_ID, {
    status,
    purchasedAt: existing?.purchasedAt ?? install?.createdAt ?? new Date(),
    onboardingSubmittedAt: submission?.submittedAt ?? existing?.onboardingSubmittedAt ?? undefined,
  });

  logGrowthEngineProvisioningEvent("entitlement_reconciled", {
    userId,
    priorStatus: existing?.status ?? null,
    nextStatus: status,
    hadInstall: !!install,
    hadProgress: !!progress,
    hadSubmission: !!submission,
    hadSetupTask: !!setupTask,
  });

  return { entitlement: ent, reconciled: true, priorStatus: existing?.status ?? null };
}
