/**
 * MLS / RESO public-display compliance — persisted on sync, used for attribution gating.
 */
import { z } from "zod";
import type { InventoryProvider } from "./inventoryProviderSchema";

export const inventoryListingComplianceSchema = z.object({
  /** RESO InternetEntireListingDisplayYN */
  internetEntireListingDisplay: z.boolean().nullable().optional(),
  /** RESO InternetDisplayYN (legacy / some feeds) */
  internetDisplay: z.boolean().nullable().optional(),
  /** RESO InternetAddressDisplayYN */
  internetAddressDisplay: z.boolean().nullable().optional(),
  /** MLS Grid MlgCanView */
  mlgCanView: z.boolean().nullable().optional(),
  listOfficeName: z.string().nullable().optional(),
  listAgentName: z.string().nullable().optional(),
  /** OriginatingSystemName or connector config label */
  mlsSourceName: z.string().nullable().optional(),
  /** MLS listing id (ListingId / provider listing id) */
  mlsListingId: z.string().nullable().optional(),
  provider: z.string().optional(),
  extractedAt: z.string().datetime().optional(),
});

export type InventoryListingCompliance = z.infer<typeof inventoryListingComplianceSchema>;

export type ResoComplianceFieldKey =
  | "InternetEntireListingDisplayYN"
  | "InternetDisplayYN"
  | "InternetAddressDisplayYN"
  | "MlgCanView"
  | "ListOfficeName"
  | "ListAgentFullName"
  | "ListAgentFirstName"
  | "ListAgentLastName"
  | "OriginatingSystemName"
  | "ListingId";

/** Which RESO keys each provider is expected to supply (audit reference). */
export const PROVIDER_COMPLIANCE_FIELD_MATRIX: Record<
  InventoryProvider,
  { fields: ResoComplianceFieldKey[]; notes: string }
> = {
  mls_grid: {
    fields: [
      "MlgCanView",
      "InternetEntireListingDisplayYN",
      "InternetDisplayYN",
      "InternetAddressDisplayYN",
      "ListOfficeName",
      "ListAgentFullName",
      "OriginatingSystemName",
      "ListingId",
    ],
    notes: "MlgCanView is MLS Grid-specific; other fields depend on originating MLS RESO profile.",
  },
  bridge_interactive: {
    fields: [
      "InternetEntireListingDisplayYN",
      "InternetDisplayYN",
      "InternetAddressDisplayYN",
      "ListOfficeName",
      "ListAgentFullName",
      "OriginatingSystemName",
      "ListingId",
    ],
    notes: "Bridge dataset RESO coverage varies by MLS; MlgCanView not applicable.",
  },
  trestle: {
    fields: [
      "InternetEntireListingDisplayYN",
      "InternetDisplayYN",
      "InternetAddressDisplayYN",
      "ListOfficeName",
      "ListAgentFullName",
      "OriginatingSystemName",
      "ListingId",
    ],
    notes: "Trestle/Cotality feeds mirror RESO; field population depends on originating system.",
  },
  showcase_idx: { fields: [], notes: "Lead-only stub — no listing sync." },
  idx_broker: { fields: [], notes: "Not implemented." },
  ihomefinder: { fields: [], notes: "Not implemented." },
  reso: {
    fields: [
      "InternetEntireListingDisplayYN",
      "InternetDisplayYN",
      "InternetAddressDisplayYN",
      "ListOfficeName",
      "ListAgentFullName",
      "OriginatingSystemName",
      "ListingId",
    ],
    notes: "Generic RESO adapter — same as Bridge/Trestle when wired.",
  },
  csv: { fields: [], notes: "Manual import — compliance must be supplied or defaulted." },
};

function resoYesNoNullable(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "y" || s === "yes" || s === "true") return true;
  if (s === "n" || s === "no" || s === "false") return false;
  return null;
}

function resoString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function resolveListAgentName(row: Record<string, unknown>): string | null {
  const full = resoString(row.ListAgentFullName);
  if (full) return full;
  const first = resoString(row.ListAgentFirstName);
  const last = resoString(row.ListAgentLastName);
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || null;
}

export type ResoComplianceFieldAvailability = Record<ResoComplianceFieldKey, boolean>;

/** True when the raw RESO row contained a non-empty value for each tracked field. */
export function auditResoComplianceFieldAvailability(
  row: Record<string, unknown>,
): ResoComplianceFieldAvailability {
  const keys: ResoComplianceFieldKey[] = [
    "InternetEntireListingDisplayYN",
    "InternetDisplayYN",
    "InternetAddressDisplayYN",
    "MlgCanView",
    "ListOfficeName",
    "ListAgentFullName",
    "ListAgentFirstName",
    "ListAgentLastName",
    "OriginatingSystemName",
    "ListingId",
  ];
  const out = {} as ResoComplianceFieldAvailability;
  for (const key of keys) {
    const val = row[key];
    if (key === "ListAgentFullName") {
      out[key] = resolveListAgentName(row) != null;
      continue;
    }
    if (key === "ListAgentFirstName" || key === "ListAgentLastName") {
      out[key] = resoString(val) != null;
      continue;
    }
    if (
      key === "InternetEntireListingDisplayYN" ||
      key === "InternetDisplayYN" ||
      key === "InternetAddressDisplayYN" ||
      key === "MlgCanView"
    ) {
      out[key] = val != null && String(val).trim() !== "";
      continue;
    }
    out[key] = resoString(val) != null;
  }
  return out;
}

export type ExtractResoListingComplianceInput = {
  provider: InventoryProvider;
  providerListingId: string;
  sourceMlsName?: string | null;
};

/** Extract compliance snapshot from a RESO Property row at sync time. */
export function extractResoListingCompliance(
  raw: unknown,
  input: ExtractResoListingComplianceInput,
): InventoryListingCompliance {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mlsSourceName =
    resoString(row.OriginatingSystemName) ||
    resoString(input.sourceMlsName) ||
    null;

  return inventoryListingComplianceSchema.parse({
    internetEntireListingDisplay: resoYesNoNullable(row.InternetEntireListingDisplayYN),
    internetDisplay: resoYesNoNullable(row.InternetDisplayYN),
    internetAddressDisplay: resoYesNoNullable(row.InternetAddressDisplayYN),
    mlgCanView: resoYesNoNullable(row.MlgCanView),
    listOfficeName: resoString(row.ListOfficeName),
    listAgentName: resolveListAgentName(row),
    mlsSourceName,
    mlsListingId: resoString(row.ListingId) || input.providerListingId,
    provider: input.provider,
    extractedAt: new Date().toISOString(),
  });
}

export function normalizeListingCompliance(
  raw: unknown,
): InventoryListingCompliance {
  const parsed = inventoryListingComplianceSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

/** Minimum IDX-style attribution: list office + MLS# + data source (no agent name required). */
export function canRenderPublicListingAttribution(
  compliance: InventoryListingCompliance | null | undefined,
): boolean {
  if (!compliance) return false;
  const office = (compliance.listOfficeName?.trim().length ?? 0) > 0;
  const mls = (compliance.mlsSourceName?.trim().length ?? 0) > 0;
  const id = (compliance.mlsListingId?.trim().length ?? 0) > 0;
  return office && mls && id;
}

export type PublicListingAttributionInput = {
  compliance: InventoryListingCompliance;
  /** Workspace brokerage from business profile — shown when present, not a substitute for list office. */
  presentingBrokerageName?: string | null;
};

export function buildPublicListingAttributionLines(
  input: PublicListingAttributionInput,
): string[] {
  const { compliance } = input;
  const lines: string[] = [];

  const office = compliance.listOfficeName?.trim();
  const mlsId = compliance.mlsListingId?.trim();
  const mls = compliance.mlsSourceName?.trim();

  if (office) lines.push(`Listed By: ${office}`);
  if (mlsId) lines.push(`MLS#: ${mlsId}`);
  if (mls) lines.push(`Data Source: ${mls}`);

  return lines;
}
