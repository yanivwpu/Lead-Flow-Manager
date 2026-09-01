/**
 * Pure GHL Marketplace lifecycle reducer.
 * INSTALL / UPDATE / PLAN_CHANGE / APP_PAYMENT_STATUS / UNINSTALL
 * with idempotency and out-of-order protection. No OAuth token creation.
 */

import { createHash } from "node:crypto";
import {
  isActiveGhlMarketplaceProGrant,
  normalizeGhlMarketplacePaymentStatus,
  type GhlMarketplaceGrantSnapshot,
} from "./ghlMarketplaceBilling";
import {
  classifyGhlMarketplacePlanId,
  type GhlMarketplacePlanConfig,
} from "./ghlMarketplacePlanIds";
import { stripGhlOAuthSecretsFromPayload } from "./ghlConnectionState";

export const GHL_LIFECYCLE_EVENT_TYPES = [
  "INSTALL",
  "UPDATE",
  "PLAN_CHANGE",
  "APP_PAYMENT_STATUS",
  "UNINSTALL",
] as const;

export type GhlLifecycleEventType = (typeof GHL_LIFECYCLE_EVENT_TYPES)[number];

export type GhlMarketplaceBillingState = GhlMarketplaceGrantSnapshot & {
  appId: string | null;
  companyId: string;
  locationId: string | null;
  ghlUserId: string | null;
  previousVersionId: string | null;
  versionId: string | null;
  ghlTrialOnTrial: boolean | null;
  ghlTrialDuration: number | null;
  ghlTrialStartDate: Date | null;
  lastWebhookId: string | null;
  lastEventOccurredAt: Date | null;
  lastEventType: string | null;
  unknownPlanWarning: string | null;
};

export type ParsedGhlLifecycleEvent = {
  type: GhlLifecycleEventType;
  webhookId: string;
  occurredAt: Date | null;
  appId: string | null;
  companyId: string;
  locationId: string | null;
  ghlUserId: string | null;
  planId: string | null;
  currentPlanId: string | null;
  newPlanId: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  previousVersionId: string | null;
  versionId: string | null;
  trial: {
    onTrial: boolean | null;
    trialDuration: number | null;
    trialStartDate: Date | null;
  };
};

export type LifecycleApplyResult = {
  kind: "applied" | "duplicate" | "stale" | "ignored";
  next: GhlMarketplaceBillingState;
  warning: string | null;
  grantsPro: boolean;
};

const ALIASES: Record<string, GhlLifecycleEventType> = {
  INSTALL: "INSTALL",
  APPINSTALL: "INSTALL",
  UPDATE: "UPDATE",
  APPUPDATE: "UPDATE",
  PLAN_CHANGE: "PLAN_CHANGE",
  PLANCHANGE: "PLAN_CHANGE",
  APP_PAYMENT_STATUS: "APP_PAYMENT_STATUS",
  APPPAYMENTSTATUS: "APP_PAYMENT_STATUS",
  UNINSTALL: "UNINSTALL",
  APPUNINSTALL: "UNINSTALL",
};

export function normalizeGhlLifecycleEventType(
  type: string | null | undefined,
): GhlLifecycleEventType | null {
  if (!type) return null;
  const key = String(type).trim().toUpperCase().replace(/[\s-]+/g, "_");
  return ALIASES[key] ?? ALIASES[key.replace(/_/g, "")] ?? null;
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function asDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return null;
  const s = String(value).toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function ghlLifecycleDedupKey(parts: {
  type: string;
  appId: string | null;
  locationId: string | null;
  companyId: string;
  planId: string | null;
  newPlanId: string | null;
  newStatus: string | null;
  occurredAtIso: string | null;
  webhookId: string | null;
}): string {
  if (parts.webhookId) return `wh:${parts.webhookId}`;
  const material = [
    parts.type,
    parts.appId ?? "",
    parts.locationId ?? "",
    parts.companyId,
    parts.planId ?? "",
    parts.newPlanId ?? "",
    parts.newStatus ?? "",
    parts.occurredAtIso ?? "",
  ].join("|");
  return `h:${createHash("sha256").update(material).digest("hex")}`;
}

export function parseGhlLifecycleEvent(
  body: Record<string, unknown>,
): ParsedGhlLifecycleEvent | null {
  const type = normalizeGhlLifecycleEventType(asString(body.type));
  if (!type) return null;

  const companyId =
    asString(body.companyId) ||
    asString(body.company_id) ||
    asString((body.company as Record<string, unknown> | undefined)?.id);
  const locationId =
    asString(body.locationId) ||
    asString(body.location_id) ||
    asString((body.location as Record<string, unknown> | undefined)?.id);
  if (!companyId && !locationId) return null;

  const trialRaw = (body.trial as Record<string, unknown> | undefined) || {};
  const occurredAt =
    asDate(body.timestamp) ||
    asDate(body.occurredAt) ||
    asDate(body.eventTime) ||
    asDate(body.installDate);

  const webhookIdRaw =
    asString(body.webhookId) || asString(body.webhook_id) || asString(body.eventId) || asString(body.id);

  const planId = asString(body.planId) || asString(body.plan_id);
  const currentPlanId = asString(body.currentPlanId) || asString(body.current_plan_id);
  const newPlanId = asString(body.newPlanId) || asString(body.new_plan_id);
  const newStatus = asString(body.newStatus) || asString(body.new_status);

  const webhookId = ghlLifecycleDedupKey({
    type,
    appId: asString(body.appId),
    locationId: locationId ?? null,
    companyId: companyId || "unknown",
    planId,
    newPlanId,
    newStatus,
    occurredAtIso: occurredAt?.toISOString() ?? null,
    webhookId: webhookIdRaw,
  });

  return {
    type,
    webhookId,
    occurredAt,
    appId: asString(body.appId) || asString(body.app_id),
    companyId: companyId || "unknown",
    locationId: locationId ?? null,
    ghlUserId: asString(body.userId) || asString(body.user_id),
    planId,
    currentPlanId,
    newPlanId,
    previousStatus: asString(body.previousStatus) || asString(body.previous_status),
    newStatus,
    previousVersionId: asString(body.previousVersionId) || asString(body.previous_version_id),
    versionId: asString(body.versionId) || asString(body.version_id),
    trial: {
      onTrial: asBool(trialRaw.onTrial),
      trialDuration: asNumber(trialRaw.trialDuration),
      trialStartDate: asDate(trialRaw.trialStartDate),
    },
  };
}

export function emptyGhlMarketplaceBillingState(
  event: ParsedGhlLifecycleEvent,
): GhlMarketplaceBillingState {
  return {
    appId: event.appId,
    companyId: event.companyId,
    locationId: event.locationId,
    ghlUserId: event.ghlUserId,
    marketplacePlanId: null,
    paymentStatus: null,
    installationStatus: "Active",
    uninstallDate: null,
    whachatUserId: null,
    previousVersionId: null,
    versionId: null,
    ghlTrialOnTrial: null,
    ghlTrialDuration: null,
    ghlTrialStartDate: null,
    lastWebhookId: null,
    lastEventOccurredAt: null,
    lastEventType: null,
    unknownPlanWarning: null,
  };
}

function planWarning(
  planId: string | null,
  config: GhlMarketplacePlanConfig,
): string | null {
  if (!config.configured) {
    return "ghl_marketplace_plan_ids_unconfigured";
  }
  if (!planId) return null;
  if (classifyGhlMarketplacePlanId(planId, config) === "unknown") {
    return "ghl_marketplace_unknown_plan_id";
  }
  return null;
}

function grantsPro(state: GhlMarketplaceBillingState, config: GhlMarketplacePlanConfig): boolean {
  return isActiveGhlMarketplaceProGrant(state, config);
}

export function applyGhlMarketplaceLifecycleEvent(
  current: GhlMarketplaceBillingState | null,
  event: ParsedGhlLifecycleEvent,
  config: GhlMarketplacePlanConfig,
): LifecycleApplyResult {
  const base = current ? { ...current } : emptyGhlMarketplaceBillingState(event);

  if (current?.lastWebhookId && event.webhookId === current.lastWebhookId) {
    return {
      kind: "duplicate",
      next: current,
      warning: current.unknownPlanWarning,
      grantsPro: grantsPro(current, config),
    };
  }

  if (
    current?.lastEventOccurredAt &&
    event.occurredAt &&
    event.occurredAt.getTime() < current.lastEventOccurredAt.getTime()
  ) {
    return {
      kind: "stale",
      next: current,
      warning: current.unknownPlanWarning,
      grantsPro: grantsPro(current, config),
    };
  }

  const next: GhlMarketplaceBillingState = {
    ...base,
    appId: event.appId ?? base.appId,
    companyId: event.companyId || base.companyId,
    locationId: event.locationId ?? base.locationId,
    ghlUserId: event.ghlUserId ?? base.ghlUserId,
    lastWebhookId: event.webhookId,
    lastEventOccurredAt: event.occurredAt ?? base.lastEventOccurredAt ?? new Date(),
    lastEventType: event.type,
  };

  let warning: string | null = base.unknownPlanWarning;

  switch (event.type) {
    case "INSTALL": {
      next.installationStatus = "Active";
      next.uninstallDate = null;
      next.marketplacePlanId = event.planId ?? base.marketplacePlanId;
      next.versionId = event.versionId ?? base.versionId;
      next.ghlTrialOnTrial = event.trial.onTrial;
      next.ghlTrialDuration = event.trial.trialDuration;
      next.ghlTrialStartDate = event.trial.trialStartDate;
      next.paymentStatus = base.paymentStatus;
      warning = planWarning(next.marketplacePlanId, config);
      next.unknownPlanWarning = warning;
      break;
    }
    case "UPDATE": {
      next.installationStatus = base.installationStatus === "Uninstalled" ? "Active" : base.installationStatus || "Active";
      if (next.installationStatus === "Active") next.uninstallDate = null;
      next.marketplacePlanId = event.planId ?? base.marketplacePlanId;
      next.previousVersionId = event.previousVersionId ?? base.previousVersionId;
      next.versionId = event.versionId ?? base.versionId;
      warning = planWarning(next.marketplacePlanId, config);
      next.unknownPlanWarning = warning;
      break;
    }
    case "PLAN_CHANGE": {
      const incoming = event.newPlanId ?? event.planId;
      next.marketplacePlanId = incoming ?? base.marketplacePlanId;
      next.installationStatus = "Active";
      next.uninstallDate = null;
      warning = planWarning(incoming, config);
      next.unknownPlanWarning = warning;
      if (classifyGhlMarketplacePlanId(incoming, config) === "free") {
        if (normalizeGhlMarketplacePaymentStatus(next.paymentStatus) === "FAILED") {
          // Keep FAILED so the Free plan cannot be treated as a recovered Pro payment.
        }
      }
      break;
    }
    case "APP_PAYMENT_STATUS": {
      const status = normalizeGhlMarketplacePaymentStatus(event.newStatus);
      if (status === "unknown" || status === null) {
        next.paymentStatus = event.newStatus;
        warning = "ghl_marketplace_unknown_payment_status";
        next.unknownPlanWarning = warning;
      } else {
        next.paymentStatus = status;
      }
      break;
    }
    case "UNINSTALL": {
      next.installationStatus = "Uninstalled";
      next.uninstallDate = event.occurredAt ?? new Date();
      break;
    }
  }

  return {
    kind: "applied",
    next,
    warning,
    grantsPro: grantsPro(next, config),
  };
}

/** Fields safe to persist — no tokens, signatures, or raw authorization. */
export function sanitizeGhlLifecyclePayloadForStorage(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const keys = [
    "type",
    "appId",
    "companyId",
    "locationId",
    "userId",
    "planId",
    "currentPlanId",
    "newPlanId",
    "previousStatus",
    "newStatus",
    "previousVersionId",
    "versionId",
    "webhookId",
    "timestamp",
    "trial",
    "installType",
  ];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in body) out[key] = body[key];
  }
  return stripGhlOAuthSecretsFromPayload(out);
}
