/**
 * Persist GHL Marketplace lifecycle events and revoke OAuth credentials on uninstall.
 * Does not mint OAuth tokens from webhooks.
 */

import {
  applyGhlMarketplaceLifecycleEvent,
  parseGhlLifecycleEvent,
  sanitizeGhlLifecyclePayloadForStorage,
  type GhlMarketplaceBillingState,
  type ParsedGhlLifecycleEvent,
} from "@shared/ghlMarketplaceLifecycle";
import { mergeGhlLifecycleRawPayload, selectMarketplaceRowForOAuthLink, stripGhlOAuthSecretsFromPayload } from "@shared/ghlConnectionState";
import { ghlMarketplacePlanConfigFromEnv } from "@shared/ghlMarketplacePlanIds";
import { storage } from "./storage";
import { logGhlOAuthDiagnostic } from "./ghlConnectionDiagnostics";
import { linkMarketplaceInstallToIntegration } from "./ghlMarketplaceService";
import { isActiveGhlMarketplaceProGrant, ghlUninstallIntegrationCredentialPatch } from "@shared/ghlMarketplaceBilling";
import { revokeGhlOAuthHandoffsForInstall } from "./ghlOAuthHandoff";
import {
  inferGhlUninstallCompanyId,
  isUnknownGhlCompanyId,
  resolvedGhlCompanyId,
  selectIntegrationsForUninstall,
  selectMarketplaceRowsForUninstall,
  type GhlUninstallMatchStrategy,
} from "@shared/ghlMarketplaceUninstallMatch";
import {
  getGhlLifecyclePersistence,
  type GhlLifecycleInstallPatch,
  type GhlMarketplaceInstallRecord,
} from "./ghlMarketplaceLifecycleStore";

export type GhlLifecycleUninstallDiagnostics = {
  matchStrategy: GhlUninstallMatchStrategy;
  installationCandidates: number;
  integrationCandidates: number;
  credentialsExisted: boolean;
  credentialsRevoked: boolean;
  alreadyRevoked: boolean;
  handoffsRevoked: number;
  inferredCompanyId: string | null;
};

export type GhlLifecyclePersistResult = {
  kind: "applied" | "duplicate" | "stale" | "ignored";
  grantsPro: boolean;
  warning: string | null;
  installId: string | null;
  uninstall?: GhlLifecycleUninstallDiagnostics;
};

function rowToState(row: GhlMarketplaceInstallRecord): GhlMarketplaceBillingState {
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

function buildInstallPatch(
  existing: GhlMarketplaceInstallRecord | null,
  state: GhlMarketplaceBillingState,
  event: ParsedGhlLifecycleEvent,
  sanitized: Record<string, unknown>,
): GhlLifecycleInstallPatch {
  const now = new Date();
  const existingPayload =
    existing?.rawPayload && typeof existing.rawPayload === "object"
      ? (existing.rawPayload as Record<string, unknown>)
      : {};
  return {
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
    uninstallDate:
      state.uninstallDate instanceof Date
        ? state.uninstallDate
        : state.uninstallDate
          ? new Date(state.uninstallDate)
          : null,
    pricePlan: state.marketplacePlanId,
    billingStatus: state.paymentStatus,
    source: existing?.source ?? "webhook",
    rawPayload: mergeGhlLifecycleRawPayload(existingPayload, sanitized),
    lastSyncedAt: now,
    updatedAt: now,
    installDate: existing?.installDate ?? event.occurredAt ?? now,
  };
}

function logUninstallDiagnostics(
  event: ParsedGhlLifecycleEvent,
  diagnostics: GhlLifecycleUninstallDiagnostics,
): void {
  logGhlOAuthDiagnostic("webhook_uninstall_match", {
    eventType: event.type,
    appId: event.appId,
    versionId: event.versionId,
    companyId: isUnknownGhlCompanyId(event.companyId) ? diagnostics.inferredCompanyId : event.companyId,
    locationId: event.locationId,
    ghlUserId: event.ghlUserId,
    matchStrategy: diagnostics.matchStrategy,
    installationCandidates: diagnostics.installationCandidates,
    integrationCandidates: diagnostics.integrationCandidates,
    credentialsExisted: diagnostics.credentialsExisted,
    credentialsRevoked: diagnostics.credentialsRevoked,
    alreadyRevoked: diagnostics.alreadyRevoked,
    handoffsRevoked: diagnostics.handoffsRevoked,
  });

  if (diagnostics.credentialsRevoked) {
    logGhlOAuthDiagnostic("webhook_uninstall_credentials_revoked", {
      locationId: event.locationId,
      companyId: diagnostics.inferredCompanyId || (isUnknownGhlCompanyId(event.companyId) ? null : event.companyId),
      matchStrategy: diagnostics.matchStrategy,
      integrationCandidates: diagnostics.integrationCandidates,
      credentialsExisted: true,
    });
    return;
  }

  logGhlOAuthDiagnostic("webhook_uninstall_already_revoked", {
    locationId: event.locationId,
    companyId: diagnostics.inferredCompanyId || (isUnknownGhlCompanyId(event.companyId) ? null : event.companyId),
    matchStrategy: diagnostics.matchStrategy,
    installationCandidates: diagnostics.installationCandidates,
    integrationCandidates: diagnostics.integrationCandidates,
    credentialsExisted: diagnostics.credentialsExisted,
    alreadyRevoked: diagnostics.alreadyRevoked || !diagnostics.credentialsExisted,
  });
}

async function applyUninstallSideEffects(
  event: ParsedGhlLifecycleEvent,
  rows: GhlMarketplaceInstallRecord[],
): Promise<GhlLifecycleUninstallDiagnostics> {
  const persistence = getGhlLifecyclePersistence();
  const identity = {
    locationId: event.locationId,
    companyId: event.companyId,
    appId: event.appId,
  };
  const selected = selectMarketplaceRowsForUninstall(rows, identity);
  const inferredCompanyId =
    selected.inferredCompanyId || inferGhlUninstallCompanyId(identity, rows);
  const retainAgencyToken = selected.retainAgencyToken;

  const allGhl = await storage.getAllIntegrationsByType("gohighlevel");
  const matchedIntegrations = selectIntegrationsForUninstall(
    allGhl,
    identity,
    selected.matches,
    inferredCompanyId,
    { retainAgencyToken },
  );

  const patch = ghlUninstallIntegrationCredentialPatch();
  let credentialsExisted = false;
  let credentialsRevoked = false;
  for (const integration of matchedIntegrations) {
    if (integration.accessToken || integration.refreshToken) credentialsExisted = true;
    const needsRevoke = Boolean(
      integration.accessToken || integration.refreshToken || integration.isActive !== false,
    );
    if (!needsRevoke) continue;
    await storage.updateIntegration(integration.id, patch);
    credentialsRevoked = true;
  }

  const handoff = await revokeGhlOAuthHandoffsForInstall({
    locationId: event.locationId,
    companyId: inferredCompanyId,
  });

  const diagnostics: GhlLifecycleUninstallDiagnostics = {
    matchStrategy: selected.matchStrategy,
    installationCandidates: selected.installationCandidates,
    integrationCandidates: matchedIntegrations.length,
    credentialsExisted,
    credentialsRevoked,
    alreadyRevoked: matchedIntegrations.length > 0 && !credentialsRevoked,
    handoffsRevoked: handoff.revokedCount,
    inferredCompanyId,
  };

  logUninstallDiagnostics(event, diagnostics);
  return diagnostics;
}

export async function persistGhlMarketplaceLifecycleEvent(
  body: Record<string, unknown>,
): Promise<GhlLifecyclePersistResult> {
  const event = parseGhlLifecycleEvent(body);
  if (!event) {
    return { kind: "ignored", grantsPro: false, warning: null, installId: null };
  }

  const persistence = getGhlLifecyclePersistence();
  const config = ghlMarketplacePlanConfigFromEnv();
  const rows = await persistence.listInstalls();
  const isDuplicateDelivery = await persistence.findDedup(event.webhookId);

  if (event.type === "UNINSTALL") {
    const selected = selectMarketplaceRowsForUninstall(rows, {
      locationId: event.locationId,
      companyId: event.companyId,
      appId: event.appId,
    });
    const inferredCompanyId = selected.inferredCompanyId;
    const sanitized = stripGhlOAuthSecretsFromPayload(sanitizeGhlLifecyclePayloadForStorage(body));

    const targets = selected.rowsToMarkUninstalled;
    let savedId: string | null = targets[0]?.id ?? null;
    let kind: GhlLifecyclePersistResult["kind"] = isDuplicateDelivery ? "duplicate" : "applied";
    let warning: string | null = null;
    let grantsPro = false;

    if (targets.length > 0) {
      for (const existing of targets) {
        const current = rowToState(existing);
        const result = applyGhlMarketplaceLifecycleEvent(current, event, config);
        if (result.kind === "stale") kind = "stale";
        if (result.kind === "duplicate" && kind === "applied") kind = "duplicate";
        warning = result.warning;
        grantsPro = result.grantsPro;
        if (result.kind === "stale" || result.kind === "duplicate") continue;
        const next = {
          ...result.next,
          companyId: resolvedGhlCompanyId(result.next.companyId, existing.companyId),
          locationId: (existing.locationId || "").trim()
            ? result.next.locationId
            : existing.locationId ?? null,
        };
        const patch = buildInstallPatch(existing, next, event, sanitized);
        await persistence.updateInstall(existing.id, patch);
        savedId = existing.id;
      }
    } else if (!isDuplicateDelivery) {
      const result = applyGhlMarketplaceLifecycleEvent(null, event, config);
      kind = result.kind;
      warning = result.warning;
      grantsPro = result.grantsPro;
      if (result.kind === "applied") {
        const companyId = inferredCompanyId || result.next.companyId;
        const patch = buildInstallPatch(null, { ...result.next, companyId }, event, sanitized);
        const created = await persistence.insertInstall({
          ...patch,
          integrationId: null,
          whachatUserId: null,
        });
        savedId = created.id || null;
      }
    }

    if (!isDuplicateDelivery) {
      await persistence.insertDedup({
        webhookId: event.webhookId,
        eventType: event.type,
        companyId: inferredCompanyId || (isUnknownGhlCompanyId(event.companyId) ? "unknown" : event.companyId),
        locationId: event.locationId,
        occurredAt: event.occurredAt,
      });
    }

    const skipSideEffects = kind === "stale";
    const latestRows = await persistence.listInstalls();
    const uninstall = skipSideEffects
      ? undefined
      : await applyUninstallSideEffects(event, latestRows);

    if (skipSideEffects) {
      logGhlOAuthDiagnostic("webhook_lifecycle_ignored", {
        eventType: event.type,
        locationId: event.locationId,
        companyId: inferredCompanyId,
        reason: "stale_uninstall",
      });
    }

    if (warning) {
      logGhlOAuthDiagnostic("webhook_lifecycle_warning", {
        eventType: event.type,
        locationId: event.locationId,
        companyId: inferredCompanyId,
        warning,
      });
    }

    return { kind, grantsPro, warning, installId: savedId, uninstall };
  }

  const existing = selectMarketplaceRowForOAuthLink(rows, event.locationId, event.companyId) ?? null;

  if (isDuplicateDelivery) {
    return {
      kind: "duplicate",
      grantsPro: existing ? isActiveGhlMarketplaceProGrant(rowToState(existing), config) : false,
      warning: existing?.unknownPlanWarning ?? null,
      installId: existing?.id ?? null,
    };
  }

  const current = existing ? rowToState(existing) : null;
  const result = applyGhlMarketplaceLifecycleEvent(current, event, config);

  if (result.kind === "duplicate" || result.kind === "stale") {
    await persistence.insertDedup({
      webhookId: event.webhookId,
      eventType: event.type,
      companyId: event.companyId,
      locationId: event.locationId,
      occurredAt: event.occurredAt,
    });
    return {
      kind: result.kind,
      grantsPro: result.grantsPro,
      warning: result.warning,
      installId: existing?.id ?? null,
    };
  }

  const sanitized = stripGhlOAuthSecretsFromPayload(sanitizeGhlLifecyclePayloadForStorage(body));
  const patch = buildInstallPatch(existing, result.next, event, sanitized);

  let savedId: string | null = existing?.id ?? null;
  if (existing) {
    await persistence.updateInstall(existing.id, patch);
  } else {
    const created = await persistence.insertInstall({
      ...patch,
      integrationId: null,
      whachatUserId: null,
    });
    savedId = created.id || null;
  }

  await persistence.insertDedup({
    webhookId: event.webhookId,
    eventType: event.type,
    companyId: event.companyId,
    locationId: event.locationId,
    occurredAt: event.occurredAt,
  });

  if (result.warning) {
    logGhlOAuthDiagnostic("webhook_lifecycle_warning", {
      eventType: event.type,
      locationId: event.locationId,
      companyId: event.companyId,
      warning: result.warning,
    });
  }

  if (event.type === "INSTALL" && event.locationId && process.env.GHL_WEBHOOK_ROUTE_TEST !== "1") {
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
