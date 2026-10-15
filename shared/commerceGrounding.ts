import type { GroundingCheck } from "./factGrounding";
/** Product facts never authorize checkout, numeric stock promises, or invented URLs. */
export function validateCommerceDraft(input: {
  draft: string;
  productUrls: string[];
  inventoryUnverified: boolean;
}): GroundingCheck {
  const draft = input.draft;
  const unsafe =
    /\b(?:checkout|payment link|card number|cvv|guaranteed shipping)\b/i.test(
      draft,
    ) ||
    /\b\d+\s+(?:units|left|in stock|unidades)\b/i.test(draft) ||
    (input.inventoryUnverified &&
      /\b(?:in stock|available now|ready to ship|en stock|disponible ahora)\b|במלאי|זמין עכשיו/i.test(
        draft,
      )) ||
    (draft.match(/https?:\/\/[^\s<>]+/g) ?? []).some(
      (url) => !input.productUrls.includes(url.replace(/[.,)]+$/, "")),
    );
  return unsafe
    ? {
        ok: false,
        violations: [
          {
            kind: "grounding_fallback_requires_review",
            detail: "Product claim needs current provider verification",
          },
        ],
      }
    : { ok: true, violations: [] };
}
