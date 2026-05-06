/**
 * Heuristics for Meta WhatsApp Cloud API phone numbers discovered during Embedded Signup.
 * Meta-generated test/sandbox lines often use fictional US 555 exchanges or "Test Number" labels.
 */

export type MetaWhatsAppPhoneKind = "production" | "test" | "unknown";

export interface MetaPhoneClassification {
  kind: MetaWhatsAppPhoneKind;
  reasons: string[];
}

export function classifyMetaWhatsAppPhone(input: {
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  qualityRating?: string | null;
}): MetaPhoneClassification {
  const reasons: string[] = [];
  const display = (input.displayPhoneNumber ?? "").trim();
  const verified = (input.verifiedName ?? "").trim();

  if (!display && !verified) {
    return { kind: "unknown", reasons: ["empty_display_and_verified"] };
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
  // US toll-free style patterns sometimes appear on sandbox lines — flag conservatively.
  if (digits.length >= 10) {
    const national =
      digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 ? digits : "";
    if (national.length === 10 && national.startsWith("555")) {
      reasons.push("nanp_555_exchange_often_meta_sample_or_fictional");
      return { kind: "test", reasons };
    }
  }

  if (!display) {
    return { kind: "unknown", reasons: ["missing_display_phone_number"] };
  }

  return { kind: "production", reasons: ["passed_heuristic_checks"] };
}
