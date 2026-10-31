import { shoppingLocale } from "./shoppingAssistant";

/** Conservative, multilingual intent guard. General CRM/plan enquiries stay with AI Brain. */
export function explicitStoreProductQuestion(raw: string): boolean {
  const t = raw.normalize("NFKC").toLowerCase();
  if (/\b(?:free|pro|enterprise)\s+(?:plan|subscription|tier|pricing)\b|\bwhachatcrm\s+(?:price|plan|subscription)\b/.test(t)) return false;
  if (/\b(?:shopify|product|sku|inventory|stock|shopping\s+cart|checkout|item\s+(?:available|in stock)|productos?|inventario|disponibilidad)\b|במלאי|מלאי|מוצר/u.test(t)) return true;
  return /\b(?:looking\s+for|search\s+for|find\s+me|busco|buscar|מחפש(?:ת)?)\b|מחפשת?/u.test(t) &&
    /\b(?:available|availability|price|cost|how\s+much|buy|purchase|disponible|precio|comprar)\b|זמין|מחיר|לקנות/u.test(t);
}

export function unverifiedProductReply(locale?: string): string {
  const messages = {
    en: "I can't verify this product's current price or availability right now. Please try again or ask a team member for help.",
    es: "No puedo verificar el precio ni la disponibilidad actual de este producto. Vuelve a intentarlo o solicita ayuda del equipo.",
    he: "אין באפשרותי לאמת כרגע את המחיר או הזמינות של המוצר. אפשר לנסות שוב או לבקש עזרה מנציג.",
  } as const;
  return messages[shoppingLocale(locale)];
}

/** A failed/disabled catalog lookup can never be replaced by unrelated company-plan claims. */
export async function guardedProductFallback(
  text: string, locale: string | undefined,
  hasShopifySource: () => Promise<boolean>,
): Promise<string | null> {
  if (!explicitStoreProductQuestion(text)) return null;
  try { return await hasShopifySource() ? unverifiedProductReply(locale) : null; }
  catch { return unverifiedProductReply(locale); } // Provider errors are UNKNOWN, not stock/price evidence.
}
