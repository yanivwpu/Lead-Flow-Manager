import { catalogProductQuestion } from "./shopperProductIntent";
import { shoppingLocale } from "./shoppingAssistant";
import { shoppingBusinessQuestion, mixedShoppingBusinessQuestion } from "./shoppingBusinessRouting";

/** Conservative, multilingual intent guard. General CRM/plan enquiries stay with AI Brain. */
export function explicitStoreProductQuestion(raw: string): boolean {
  if (shoppingBusinessQuestion(raw)) return false;
  if (mixedShoppingBusinessQuestion(raw)) return true;
  return catalogProductQuestion(raw);
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
