/**
 * Production-safe helpers for one-time GHL Marketplace raw_payload sanitation.
 * Never logs secret values — only row ids and sensitive key names.
 */

import {
  collectGhlSensitivePayloadKeyNames,
  sanitizeGhlMarketplaceRawPayload,
} from "./ghlConnectionState";

export const SANITIZE_GHL_RAW_PAYLOAD_CONFIRM = "SANITIZE_GHL_RAW_PAYLOAD";

export type GhlMarketplaceRawPayloadRepairRow = {
  id: string;
  source: string | null;
  installationStatus: string | null;
  lastEventType?: string | null;
  rawPayload: unknown;
};

export type GhlMarketplaceRawPayloadRepairPlan = {
  id: string;
  source: string | null;
  installationStatus: string | null;
  lastEventType: string | null;
  sensitiveKeyNames: string[];
  needsUpdate: boolean;
};

export function parseSanitizeGhlRawPayloadCli(
  argv: string[],
  env: NodeJS.Dict<string> = process.env,
): {
  apply: boolean;
  confirm: string | null;
  authorized: boolean;
} {
  const apply = argv.includes("--apply");
  const confirmArg = argv.find((arg) => arg.startsWith("--confirm="));
  const confirm = confirmArg ? confirmArg.slice("--confirm=".length) : null;
  const envConfirm = env.SANITIZE_GHL_RAW_PAYLOAD_CONFIRM === SANITIZE_GHL_RAW_PAYLOAD_CONFIRM;
  return {
    apply,
    confirm,
    authorized: apply && (confirm === SANITIZE_GHL_RAW_PAYLOAD_CONFIRM || envConfirm),
  };
}

export function planGhlMarketplaceRawPayloadSanitation(
  row: GhlMarketplaceRawPayloadRepairRow,
): GhlMarketplaceRawPayloadRepairPlan {
  const sensitiveKeyNames = collectGhlSensitivePayloadKeyNames(row.rawPayload);
  const sanitized = sanitizeGhlMarketplaceRawPayload(row.rawPayload ?? {});
  const before = JSON.stringify(row.rawPayload ?? {});
  const after = JSON.stringify(sanitized);
  return {
    id: row.id,
    source: row.source,
    installationStatus: row.installationStatus,
    lastEventType: row.lastEventType ?? null,
    sensitiveKeyNames,
    needsUpdate: before !== after,
  };
}

export function sanitizedGhlMarketplaceRawPayloadForRepair(rawPayload: unknown): Record<string, unknown> {
  const sanitized = sanitizeGhlMarketplaceRawPayload(rawPayload ?? {});
  if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
    return sanitized as Record<string, unknown>;
  }
  return {};
}

export function formatGhlMarketplaceRawPayloadRepairReport(
  plans: GhlMarketplaceRawPayloadRepairPlan[],
  mode: "dry-run" | "apply",
): string {
  const affected = plans.filter((p) => p.needsUpdate);
  const lines = [
    `mode=${mode}`,
    `scanned=${plans.length}`,
    `affected=${affected.length}`,
    ...affected.map(
      (p) =>
        `row id=${p.id} source=${p.source ?? "unknown"} installationStatus=${p.installationStatus ?? "unknown"} lastEventType=${p.lastEventType ?? "unknown"} keys=${p.sensitiveKeyNames.join(",") || "(shape-only)"}`,
    ),
  ];
  return lines.join("\n");
}

export function reportContainsSecretValues(
  report: string,
  payloads: unknown[],
): boolean {
  for (const payload of payloads) {
    if (!payload || typeof payload !== "object") continue;
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (typeof value !== "string" || value.length < 8) continue;
      if (report.includes(value)) return true;
      void key;
    }
  }
  return false;
}
