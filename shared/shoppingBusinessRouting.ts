import { shoppingChoiceNumber, shoppingIntent } from "./shoppingAssistant";
import { catalogProductIntent } from "./shopperProductIntent";

/** Business-only questions belong to the workspace's existing AI Brain retrieval.
 * Mixed requests for product facts stay catalog guarded; this is not permission
 * for a general model to quote stock/prices or to execute an order operation.
 */
function shoppingBusinessIntent(raw: string): "business" | "mixed" | null {
  const text = raw.normalize("NFKC").toLowerCase();
  const business = /\b(?:return\s+policy|refund\s+policy|returns?|shipping|ship\s+internationally|delivery|discount\s+codes?|warrant(?:y|ies)|store\s+(?:located|location|address)|pol[ií]tica\s+de\s+devoluciones|devoluciones|env[ií]os?|entrega|c[oó]digos?\s+de\s+descuento|garant[ií]as?)\b|מדיניות\s+ה?(?:החזרות|החזרים)|משלוח|אחריות|קוד(?:י)?\s+הנחה|כתובת\s+(?:החנות|שלכם)/u.test(text);
  if (!business) return null;
  // Remove only explicit business-charge questions before inspecting product
  // predicates. Other price clauses (including named products) remain guarded.
  const factText = text
    .replace(/\bdo\s+you\s+have\s+(?:(?:free|international|express|overnight|standard)\s+)*(?:shipping|delivery)\b/gu," ")
    .replace(/\bis\s+(?:(?:free|international|express|overnight|standard)\s+)*(?:shipping|delivery)\s+available\b/gu," ")
    .replace(/\b(?:cu[aá]nto\s+(?:cuesta|vale)(?:\s+el)?\s+env[ií]o|(?:precio|costo|coste)\s+del\s+env[ií]o)\b|מה\s+(?:מחיר|עלות)\s+ה?משלוח|כמה\s+עולה\s+ה?משלוח/gu," ")
    .replace(/\bhow\s+much(?:\s+does)?\s+(?:shipping|delivery)(?:\s+cost)?\b/gu," ")
    .replace(/\b(?:prices?|costs?)\s+(?:of|for)\s+(?:shipping|delivery)\b|\b(?:shipping|delivery)\s+(?:prices?|costs?|fees?|charges?)\b/gu," ")
    .replace(/\bdo\s+you\s+have\s+(?:(?:a|an|any)\s+)?(?:warrant(?:y|ies)|discount\s+codes?|(?:a\s+)?return\s+policy)\b/gu," ");
  const clauses = factText.split(/[,;!?]|\b(?:and|but|y|pero)\b/u);
  const mutation = /(?:quantity|cantidad|כמות)\s*[:=]?\s*\d+/u.test(text) ||
    clauses.some(clause => shoppingChoiceNumber(clause.trim()) !== undefined);
  const productFacts = mutation || clauses.some(clause => {
    const intent = catalogProductIntent(clause);
    if (intent === "product") return true;
    if (intent === "setup" || intent === "plan") return false;
    // An offer exemption belongs to its own clause, never an independent
    // merchandise request before "and" or "but".
    const offer = /\b(?:packages?|plans?|subscriptions?|tiers?)\b/u.test(clause) &&
      !/\b(?:products?|items?|sku|stock|inventory|availability|productos?|inventario|disponibilidad)\b|מוצר|מלאי/u.test(clause);
    return !offer && /\b(?:prices?|costs?|how\s+much|stock|inventory|availability|available|buy|purchase|sell|carry|do\s+you\s+have|disponibles?|precios?|cu[aá]nto\s+(?:cuesta|vale))\b|מחיר/u.test(clause);
  });
  const orderAction = /\b(?:track|tracking|cancel|cancelar|seguimiento)\b|בטל|מעקב/u.test(text);
  const human = /\b(?:human|agent|person|representative|humano|agente|persona)\b|נציג|אדם/u.test(text);
  if (productFacts) return "mixed";
  const action = shoppingIntent(text);
  return !orderAction && !human && !["cancel","restart","handoff"].includes(action) ? "business" : null;
}

export function shoppingBusinessQuestion(raw: string): boolean {
  return shoppingBusinessIntent(raw) === "business";
}

/** A policy clause is never permission to replace product verification with prose. */
export function mixedShoppingBusinessQuestion(raw: string): boolean {
  return shoppingBusinessIntent(raw) === "mixed";
}
