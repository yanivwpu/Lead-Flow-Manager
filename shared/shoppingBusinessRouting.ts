/** Business-only questions belong to the workspace's existing AI Brain retrieval.
 * Mixed requests for product facts stay catalog guarded; this is not permission
 * for a general model to quote stock/prices or to execute an order operation.
 */
export function shoppingBusinessQuestion(raw: string): boolean {
  const text = raw.normalize("NFKC").toLowerCase();
  const business = /\b(?:return\s+policy|refund\s+policy|returns?|shipping|ship\s+internationally|delivery|discount\s+codes?|warrant(?:y|ies)|store\s+(?:located|location|address)|pol[ií]tica\s+de\s+devoluciones|devoluciones|env[ií]os?|entrega|c[oó]digos?\s+de\s+descuento|garant[ií]as?)\b|מדיניות\s+ה?(?:החזרות|החזרים)|משלוח|אחריות|קוד(?:י)?\s+הנחה|כתובת\s+(?:החנות|שלכם)/u.test(text);
  if (!business) return false;
  const productFacts = /\b(?:prices?|costs?|how\s+much|stock|inventory|availability|available|buy|purchase|add\b.{0,60}\bto\b.{0,20}\bcart|precios?|cu[aá]nto\s+cuesta|inventario|disponibles?|comprar)\b|מחיר|מלאי|זמין|לקנות|לרכוש/u.test(text);
  const orderAction = /\b(?:track|tracking|cancel|cancelar|seguimiento)\b|בטל|מעקב/u.test(text);
  const human = /\b(?:human|agent|person|representative|humano|agente|persona)\b|נציג|אדם/u.test(text);
  return !productFacts && !orderAction && !human;
}
