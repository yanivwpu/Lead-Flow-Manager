/**
 * Persist GHL Marketplace lifecycle events and revoke OAuth credentials on uninstall.
 * Does not mint OAuth tokens from webhooks.
 */

import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { ghlMarketplaceInstalls, ghlMarketplaceWebhookDedup } from "@shared/schema";
import {
  applyGhlMarketplaceLifecycleEvent,
  parseGhlLifecycleEvent,
  sanitizeGhlLifecyclePayloadForStorage,
  type GhlMarketplaceBillingState,
} from "@shared/ghlMarketplaceLifecycle";
import { mergeGhlLifecycleRawPayload, selectMarketplaceRowForOAuthLink, stripGhlOAuthSecretsFromPayload } from "@shared/ghlConnectionState";
import { ghlMarketplacePlanConfigFromEnv } from "@shared/ghlMarketplacePlanIds";
import { storage } from "./storage";
import { logGhlOAuthDiagnostic } from "./ghlConnectionDiagnostics";
import { linkMarketplaceInstallToIntegration } from "./ghlMarketplaceService";
import { isActiveGhlMarketplaceProGrant, ghlUninstallIntegrationCredentialPatch } from "@shared/ghlMarketplaceBilling";
import { revokeGhlOAuthHandoffsForInstall } from "./ghlOAuthHandoff";

export type GhlLifecyclePersistResult = {
  kind: "applied" | "duplicate" | "stale" | "ignored";
  grantsPro: boolean;
  warning: string | null;
  installId: string | null;
};

function rowToState(row: typeof ghlMarketplaceInstalls.$inferSelect): GhlMarketplaceBillingState {
  return {
    appId: row.appId ?? null,
    companyId: row.companyId,
    locationId: row.locationId ?? null,
    ghlUserId: row.ghlUserId ?? null,
    marketplacePlanId: row.marketplacePlanId ?? null,
    paymentStatus: row.paymentStatus ?? null,
    installationStatus: row.installationStatus ?? "Active",
    uninstallDate: row.uninstallDate ?? null,
    whachatUserId: row.whachatUserId ?? null,
    previousVersionId: row.previousVersionId ?? null,
    versionId: row.versionId ?? null,
    ghlTrialOnTrial: row.ghlTrialOnTrial ?? null,
    ghlTrialDuration: row.ghlTrialDuration ?? null,
    ghlTrialStartDate: row.ghlTrialStartDate ?? null,
    lastWebhookId: row.lastWebhookId ?? null,
    lastEventOccurredAt: row.lastEventOccurredAt ?? null,
    lastEventType: row.lastEventType ?? null,
    unknownPlanWarning: row.unknownPlanWarning ?? null,
  };
}

async function findInstall(companyId: string, locationId: string | null) {
  const rows = await db.select().from(ghlMarketplaceInstalls);
  return selectMarketplaceRowForOAuthLink(rows, locationId, companyId) ?? null;
}

async function deactivateLinkedGhlIntegrations(locationId: string | null, companyId: string): Promise<void> {
  const allGhl = await storage.getAllIntegrationsByType("gohighlevel");
  const patch = ghlUninstallIntegrationCredentialPatch();
  for (const integration of allGhl) {
    const cfg = (integration.config || {}) as Record<string, unknown>;
    const loc = String(cfg.locationId || "").trim();
    const company = String(cfg.companyId || "").trim();
    const matchesLocation = locationId && loc === locationId;
    const matchesCompany = !locationId && company && company === companyId;
    if (!matchesLocation && !matchesCompany) continue;
    await storage.updateIntegration(integration.id, patch);
    logGhlOAuthDiagnostic("webhook_uninstall_credentials_revoked", {
      integrationId: integration.id,
      locationId: loc || null,
      note: "Access and refresh tokens cleared; integration deactivated",
    });
  }
}

export async function persistGhlMarketplaceLifecycleEvent(
  body: Record<string, unknown>,
): Promise<GhlLifecyclePersistResult> {
  const event = parseGhlLifecycleEvent(body);
  if (!event) {
    return { kind: "ignored", grantsPro: false, warning: null, installId: null };
  }

  const config = ghlMarketplacePlanConfigFromEnv();
  const existingDedup = await db
    .select({ webhookId: ghlMarketplaceWebhookDedup.webhookId })
    .from(ghlMarketplaceWebhookDedup)
    .where(eq(ghlMarketplaceWebhookDedup.webhookId, event.webhookId))
    .limit(1);
  if (existingDedup[0]) {
    const existing = await findInstall(event.companyId, event.locationId);
    return {
      kind: "duplicate",
      grantsPro: existing ? isActiveGhlMarketplaceProGrant(rowToState(existing), config) : false,
      warning: existing?.unknownPlanWarning ?? null,
      installId: existing?.id ?? null,
    };
  }

  const existing = await findInstall(event.companyId, event.locationId);
  const current = existing ? rowToState(existing) : null;
  const result = applyGhlMarketplaceLifecycleEvent(current, event, config);

  if (result.kind === "duplicate" || result.kind === "stale") {
    await db
      .insert(ghlMarketplaceWebhookDedup)
      .values({
        webhookId: event.webhookId,
        eventType: event.type,
        companyId: event.companyId,
        locationId: event.locationId,
        occurredAt: event.occurredAt,
      })
      .onConflictDoNothing();
    return {
      kind: result.kind,
      grantsPro: result.grantsPro,
      warning: result.warning,
      installId: existing?.id ?? null,
    };
  }

  const state = result.next;
  const now = new Date();
  const sanitized = stripGhlOAuthSecretsFromPayload(sanitizeGhlLifecyclePayloadForStorage(body));
  const existingPayload =
    existing?.rawPayload && typeof existing.rawPayload === "object"
      ? (existing.rawPayload as Record<string, unknown>)
      : {};
  const patch = {
    agency: existing?.agency ?? null,
    companyId: state.companyId,
    locationId: state.locationId || existing?.locationId || null,
    appId: state.appId,
    marketplacePlanId: state.marketplacePlanId,
    paymentStatus: state.paymentStatus,
    ghlUserId: state.ghlUserId,
    previousVersionId: state.previousVersionId,
    versionId: state.versionId,
    ghlTrialOnTrial: state.ghlTrialOnTrial,
    ghlTrialDuration: state.ghlTrialDuration,
    ghlTrialStartDate: state.ghlTrialStartDate,
    lastWebhookId: state.lastWebhookId,
    lastEventOccurredAt: state.lastEventOccurredAt,
    lastEventType: state.lastEventType,
    unknownPlanWarning: state.unknownPlanWarning,
    installationStatus: state.installationStatus,
    uninstallDate: state.uninstallDate instanceof Date ? state.uninstallDate : state.uninstallDate ? new Date(state.uninstallDate) : null,
    pricePlan: state.marketplacePlanId,
    billingStatus: state.paymentStatus,
    source: existing?.source ?? "webhook",
    rawPayload: mergeGhlLifecycleRawPayload(existingPayload, sanitized),
    lastSyncedAt: now,
    updatedAt: now,
    installDate: existing?.installDate ?? event.occurredAt ?? now,
  };

  let savedId: string | null = existing?.id ?? null;
  if (existing) {
    await db.update(ghlMarketplaceInstalls).set(patch).where(eq(ghlMarketplaceInstalls.id, existing.id));
  } else {
    const [created] = await db
      .insert(ghlMarketplaceInstalls)
      .values({
        ...patch,
        integrationId: null,
        whachatUserId: null,
      })
      .returning({ id: ghlMarketplaceInstalls.id });
    savedId = created?.id ?? null;
  }

  await db
    .insert(ghlMarketplaceWebhookDedup)
    .values({
      webhookId: event.webhookId,
      eventType: event.type,
      companyId: event.companyId,
      locationId: event.locationId,
      occurredAt: event.occurredAt,
    })
    .onConflictDoNothing();

  if (result.warning) {
    logGhlOAuthDiagnostic("webhook_lifecycle_warning", {
      eventType: event.type,
      locationId: event.locationId,
      companyId: event.companyId,
      warning: result.warning,
    });
  }

  if (event.type === "UNINSTALL") {
    await deactivateLinkedGhlIntegrations(event.locationId, event.companyId);
    await revokeGhlOAuthHandoffsForInstall({
      locationId: event.locationId,
      companyId: event.companyId,
    });
  } else if (event.type === "INSTALL" && event.locationId) {
    const allGhl = await storage.getAllIntegrationsByType("gohighlevel");
    const matched = allGhl.find((i) => {
      const cfg = (i.config || {}) as Record<string, unknown>;
      return cfg.locationId === event.locationId;
    });
    if (matched) {
      await linkMarketplaceInstallToIntegration(event.locationId, event.companyId, matched);
    } else {
      logGhlOAuthDiagnostic("webhook_install_no_integration", {
        locationId: event.locationId,
        companyId: event.companyId,
        note: "Install persisted before OAuth — will reconcile when callback completes",
      });
    }
  }

  return {
    kind: result.kind,
    grantsPro: result.grantsPro,
    warning: result.warning,
    installId: savedId,
  };
}
