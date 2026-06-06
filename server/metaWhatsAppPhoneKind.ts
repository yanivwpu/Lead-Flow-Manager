/**
 * Classify Meta WhatsApp Cloud API phone numbers discovered during Embedded Signup.
 * Uses Graph metadata when available, plus display/verified-name heuristics.
 */

export type MetaWhatsAppPhoneKind = "production" | "test" | "unknown";

export interface MetaPhoneClassification {
  kind: MetaWhatsAppPhoneKind;
  reasons: string[];
}

export interface MetaWhatsAppPhoneClassificationInput {
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  qualityRating?: string | null;
  platformType?: string | null;
  accountMode?: string | null;
  status?: string | null;
  codeVerificationStatus?: string | null;
}

export function classifyMetaWhatsAppPhone(input: MetaWhatsAppPhoneClassificationInput): MetaPhoneClassification {
  const reasons: string[] = [];
  const display = (input.displayPhoneNumber ?? "").trim();
  const verified = (input.verifiedName ?? "").trim();

  const platformType = String(input.platformType ?? "").trim().toUpperCase();
  const accountMode = String(input.accountMode ?? "").trim().toUpperCase();
  const status = String(input.status ?? "").trim().toUpperCase();
  const codeVerification = String(input.codeVerificationStatus ?? "").trim().toUpperCase();

  if (accountMode.includes("SANDBOX") || accountMode === "SANDBOX") {
    reasons.push("graph_account_mode_sandbox");
    return { kind: "test", reasons };
  }
  if (platformType.includes("SANDBOX")) {
    reasons.push("graph_platform_type_sandbox");
    return { kind: "test", reasons };
  }

  if (!display && !verified && !platformType && !accountMode && !status && !codeVerification) {
    return { kind: "unknown", reasons: ["empty_graph_and_display_fields"] };
  }

  const vLower = verified.toLowerCase();
  if (/\btest\b/.test(vLower)) {
    reasons.push("verified_name_contains_test");
    return { kind: "test", reasons };
  }
  if (/test\s*number/i.test(verified)) {
    reasons.push("verified_name_test_number_pattern");
    return { kind: "test", reasons };
  }

  const digits = display.replace(/\D/g, "");
  if (digits.length >= 10) {
    const national =
      digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 ? digits : "";
    if (national.length === 10 && national.startsWith("555")) {
      reasons.push("nanp_555_exchange_often_meta_sample_or_fictional");
      return { kind: "test", reasons };
    }
  }

  if (!display) {
    if (status || codeVerification || platformType || accountMode) {
      reasons.push("missing_display_phone_number_with_partial_graph_metadata");
    } else {
      reasons.push("missing_display_phone_number");
    }
    return { kind: "unknown", reasons };
  }

  return { kind: "production", reasons: ["passed_heuristic_and_graph_checks"] };
}

/** Merge persisted user fields with optional Graph phone snapshot for classification. */
export function buildMetaWhatsAppPhoneClassificationInput(
  user: {
    metaDisplayPhoneNumber?: string | null;
    metaVerifiedName?: string | null;
  },
  phoneGraphSnapshot?: Record<string, unknown> | null,
): MetaWhatsAppPhoneClassificationInput {
  const inner =
    phoneGraphSnapshot?.data && typeof phoneGraphSnapshot.data === "object"
      ? (phoneGraphSnapshot.data as Record<string, unknown>)
      : phoneGraphSnapshot;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    displayPhoneNumber: user.metaDisplayPhoneNumber ?? str(inner?.display_phone_number),
    verifiedName: user.metaVerifiedName ?? str(inner?.verified_name),
    qualityRating: str(inner?.quality_rating),
    platformType: str(inner?.platform_type),
    accountMode: str(inner?.account_mode),
    status: str(inner?.status),
    codeVerificationStatus: str(inner?.code_verification_status),
  };
}

/** Graph `phone_numbers` field sets — try richest first. */
export const META_WABA_PHONE_DISCOVERY_FIELD_SETS = [
  "id,display_phone_number,verified_name,quality_rating,code_verification_status,status,platform_type,account_mode",
  "id,display_phone_number,verified_name,quality_rating,code_verification_status,status,platform_type",
  "id,display_phone_number,verified_name,quality_rating,code_verification_status,status",
  "id,display_phone_number,verified_name,quality_rating",
] as const;

export function mapGraphPhoneRowToDiscoveryFields(row: Record<string, unknown>): {
  id: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  platformType?: string;
  accountMode?: string;
  status?: string;
  codeVerificationStatus?: string;
} {
  return {
    id: String(row?.id ?? "").trim(),
    displayPhoneNumber:
      typeof row.display_phone_number === "string" ? row.display_phone_number : undefined,
    verifiedName: typeof row.verified_name === "string" ? row.verified_name : undefined,
    qualityRating: typeof row.quality_rating === "string" ? row.quality_rating : undefined,
    platformType: typeof row.platform_type === "string" ? row.platform_type : undefined,
    accountMode: typeof row.account_mode === "string" ? row.account_mode : undefined,
    status: typeof row.status === "string" ? row.status : undefined,
    codeVerificationStatus:
      typeof row.code_verification_status === "string" ? row.code_verification_status : undefined,
  };
}
