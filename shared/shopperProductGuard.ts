import { shoppingLocale } from "./shoppingAssistant";
import { shoppingBusinessQuestion, mixedShoppingBusinessQuestion } from "./shoppingBusinessRouting";

/** Conservative, multilingual intent guard. General CRM/plan enquiries stay with AI Brain. */
export function explicitStoreProductQuestion(raw: string): boolean {
  if (shoppingBusinessQuestion(raw)) return false;
  if (mixedShoppingBusinessQuestion(raw)) return true;
  const t = raw.normalize("NFKC").toLowerCase();
  if (/\b(?:free|pro|enterprise)\s+(?:plan|subscription|tier|pricing)\b|\bwhachatcrm\s+(?:price|plan|subscription)\b/.test(t)) return false;
  const productReference = /\b(?:products?|items?|sku|productos?|art[ií]culos?)\b|מוצר(?:ים)?/u.test(t);
  const stockQuestion = /\b(?:inventory|stock|availability|in\s+stock|out\s+of\s+stock|inventario|disponibilidad)\b|במלאי|מלאי/u.test(t);
  const buyingQuestion = /\b(?:prices?|costs?|how\s+much|available|buy|purchase|sell|carry|do\s+you\s+have|show\s+me|find\s+me|recommend\w*|add\b.{0,60}?\bto\s+(?:my\s+|the\s+)?cart|precios?|comprar|disponibles?|cu[aá]nto)\b|מחיר(?:ים)?|לקנות|זמין/u.test(t);
  // Explicit facts about an item/SKU take priority over general setup wording.
  // "Can I add SKU X to my cart; is it in stock?" must not bypass verification.
  const itemFactQuestion = productReference && (stockQuestion || buyingQuestion);
  // Shopify setup, CRM integration and checkout-policy questions belong to AI Brain.
  // Only exempt them if no specific item price/stock/purchase fact is being asked.
  const setupQuestion = /\b(?:how\s+(?:do|can)\s+i|how\s+to|can\s+i|does\s+shopify)\s+(?:connect|configure|integrate|enable|set\s*up|add|use|manage|edit|sync|import|track|support)\b|\b(?:connect|configure|integrate|set\s*up|enable)\s+shopify\b|\bdiscount\s+codes?\s+at\s+checkout\b/.test(t);
  if (setupQuestion && !itemFactQuestion) return false;
  if (stockQuestion) return true;
  if (itemFactQuestion) return true;
  const productSearch = /\b(?:looking\s+for|search\s+for|find\s+me|busco|buscar|מחפש(?:ת)?)\b|מחפשת?/u.test(t);
  return productSearch && buyingQuestion;
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
