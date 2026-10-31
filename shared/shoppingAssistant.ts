import { z } from "zod";
export const shoppingSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  maxRecommendations: z.number().int().min(1).max(8).default(3),
  checkoutEnabled: z.boolean().default(false),
  allowedChannels: z.array(z.enum(["webchat", "whatsapp", "instagram", "facebook", "sms", "telegram"])).max(6).default(["webchat"]),
  handoffOnFailure: z.boolean().default(false),
}).strict();
export type ShoppingSettings = z.infer<typeof shoppingSettingsSchema>;
export function shoppingSettings(raw: unknown): ShoppingSettings {
  const parsed = shoppingSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : shoppingSettingsSchema.parse({});
}
export type ShoppingIntent = "retry" | "search" | "compare" | "variants" | "availability" | "select" | "confirm" | "cancel" | "restart" | "handoff" | "order" | "other";
export type ShoppingChoice = {
  productId: string; variantId: string; productTitle: string; variantTitle: string;
  options: Array<{ name: string; value: string }>; price: string; currency: string;
  verifiedAt: string;
  // Shopify's tracked inventory count, not a reservation or a sellable-online promise.
  inventoryQuantity?: number;
};
export type ShoppingState = {
  checkout?: { confirmationId: string; status: "ready" | "pending" | "expired" | "changed" | "unavailable" | "setup_required"; createdAt: string; requestKey?:string; installationId?:string };
  version: 1; sourceId: string; step: "discovering" | "selecting" | "confirming" | "confirmed" | "handoff" | "cancelled" | "pending";
  pending?: { action: "discover" | "select" | "confirm"; resumeStep: Exclude<ShoppingState["step"], "pending"> };
  intent: ShoppingIntent; choices: ShoppingChoice[]; selected?: ShoppingChoice;
  quantity: number; query?: string; maxPrice?: string; minPrice?: string; currency?: string;
  updatedAt: string; lastEventId: string; reply: string;
  // Bounded event IDs prevent a delayed retry from reverting a newer selection.
  consumedEventIds: string[];
};
export function shoppingIntent(text: string): ShoppingIntent {
  const t = text.toLowerCase().trim();
  if (/\b(?:human|agent|person|representative|humano|agente|persona)\b|נציג|אדם/.test(t)) return "handoff";
  if (/\b(?:cancel|stop|cancelar|cancela)\b|בטל|ביטול/.test(t)) return "cancel";
  if (/\b(?:restart|start over|otra búsqueda|empezar de nuevo)\b|מחדש/.test(t)) return "restart";
  if (/^(?:retry|try again|reintentar|intenta de nuevo|נסה שוב|נסו שוב)[.!\s]*$/iu.test(t)) return "retry";
  if (shoppingChoiceNumber(text) !== undefined) return "select";
  if (/\b(?:order|tracking|refund|pedido|seguimiento|reembolso)\b|הזמנה|משלוח|החזר/.test(t)) return "order";
  if (/^(?:yes(?:,?\s+confirm)?|confirm|confirmed|checkout|pay|sí|si|confirmo|pagar|כן|מאשר|לתשלום)[.!\s]*$/iu.test(t)) return "confirm";
  if (/\b(?:compare|comparison|comparar|compara)\b|השוו|השווא/.test(t)) return "compare";
  if (/\b(?:options|variants|sizes|colors|colours|opciones|variantes|tallas|colores)\b|אפשרויות|מידות|צבעים/.test(t)) return "variants";
  if (/\b(?:stock|available|availability|disponib\w*)\b|במלאי|זמין|זמינות/.test(t)) return "availability";
  if (/\b(?:take|choose|select|buy|purchase|quiero|comprar|elijo|llevo)\b|אבחר|אקח|לקנות|לרכוש/.test(t)) return "select";
  if (/\b(?:looking|search|find|show|recommend\w*|under|below|between|busco|buscar|muestra|recomiend\w*|menos|hasta)\b|מחפש|מחפשת|המלצ|ממליצ|מתחת|עד\s*\d/.test(t)) return "search";
  return "other";
}
/** Generic price/stock follow-up only. Unknown product words must never bind a
 * new request to the saved selection or silently choose an offered variant. */
export function shoppingVerificationFollowup(text: string, selected?: Pick<ShoppingChoice,"productTitle">): boolean {
  const productWords = new Set(selected?.productTitle.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const normalized = text.toLowerCase()
    // A product noun is a reference only when it names the persisted selection.
    // Never add arbitrary catalog words to the generic follow-up allowlist.
    .replace(/\bselected\s+([\p{L}\p{N}]+)['’]s\b/gu, (reference, noun: string) =>
      productWords.has(noun) ? "selected variant" : reference)
    .replace(/\b(variant|option|product)['’]s\b/gu, "$1")
    .replace(/['’]/g, "");
  const words = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const allowed = new Set("verify recheck check please the current latest price and available availability inventory for that this exact selected variant product option its their it they is are what whats how many much units in stock now right of my can you tell me about remaining quantity still again levels against shopify".split(" "));
  return /\b(?:price|inventory|stock|availability|available)\b/.test(normalized) &&
    words.length > 0 && words.every(word => allowed.has(word)) && !/\d/.test(text);
}
export function shoppingFilters(text: string, defaultCurrency: string): {currency:string;query:string;maxPrice?:string;minPrice?:string} {
  const explicit = text.match(/\b(USD|EUR|GBP|ILS|CAD|AUD)\b/i)?.[1]?.toUpperCase();
  const symbol = text.match(/[$€£₪]/)?.[0];
  const currency = explicit || ({"$": defaultCurrency, "€":"EUR", "£":"GBP", "₪":"ILS"} as Record<string,string>)[symbol || ""] || defaultCurrency;
  const max = text.match(/(?:under|below|less than|hasta|menos de|מתחת ל?|עד)\s*[$€£₪]?\s*(\d{1,12}(?:\.\d{1,6})?)/iu);
  const range = text.match(/(?:between|entre|בין)\s*[$€£₪]?\s*(\d{1,12}(?:\.\d{1,6})?)\s*(?:and|y|ל|ו|-)\s*[$€£₪]?\s*(\d{1,12}(?:\.\d{1,6})?)/iu);
  // Keep the product request separate from generic follow-up questions. Otherwise
  // indexed discovery ANDs words such as "right now/current price/verify Shopify"
  // into the product name and returns no candidates before live verification.
  // Require a sentence boundary + a generic question; preserve decimal prices,
  // dotted product names, variant descriptors and all full-message budget filters.
  const productRequest = text.replace(/[.!?]\s+(?=(?:(?:is|are|do|does|can)\s+(?:you\s+(?:have|check|confirm)\s+)?(?:it|this|that|they|these|those|you)\b|what(?:['’]s|\s+is)\s+(?:its|their|the)\b|how\s+(?:many|much)\b|please\s+(?:verify|check)\b))[\s\S]*$/iu, "");
  const query = productRequest.replace(/(?:under|below|less than|hasta|menos de|מתחת ל?|עד)\s*[$€£₪]?\s*\d+(?:\.\d+)?/giu," ")
    .replace(/(?:between|entre|בין)\s*[$€£₪]?\s*\d+(?:\.\d+)?\s*(?:and|y|ל|ו|-)\s*[$€£₪]?\s*\d+(?:\.\d+)?/giu," ")
    .replace(/\b(?:i'm|im|looking|look|search|find|show|recommend\w*|options|variants|compare|comparison|with|some|different|for|the|an|a|busco|buscar|muestra|recomiend\w*|opciones|variantes|comparar|por|favor|USD|EUR|GBP|ILS|CAD|AUD)\b|מחפשת?|אפשרויות|המלצה|ממליצים|בבקשה/giu," ")
    .replace(/[^\p{L}\p{N}\s-]/gu," ").trim().slice(0,200);
  return { currency, ...(range ? {minPrice:range[1],maxPrice:range[2]} : max ? {maxPrice:max[1]} : {}), query };
}
/** Compare provider decimal strings without floating point conversion. */
export function compareMoney(a: string, b: string): number {
  const [aw, af=""] = a.split("."), [bw, bf=""] = b.split(".");
  const x=aw.replace(/^0+(?=\d)/,""), y=bw.replace(/^0+(?=\d)/,"");
  if(x.length!==y.length) return x.length<y.length?-1:1;
  if(x!==y) return x<y?-1:1;
  const n=Math.max(af.length,bf.length), p=af.padEnd(n,"0"),q=bf.padEnd(n,"0");
  return p===q?0:p<q?-1:1;
}
/** A list reference, not a catalog query. Resolve only against the saved offered order. */
export function shoppingChoiceNumber(text: string): number | undefined {
  if (/[$€£₪]|\b(?:USD|EUR|GBP|ILS|CAD|AUD)\b/iu.test(text)) return undefined;
  const normalized = text.toLocaleLowerCase().replace(/[’']/gu, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/gu, " ").trim();
  const reference = normalized
    .replace(/^(?:ill take|i will take|i choose|i select|take|choose|select|quiero|elijo|escojo|me llevo|me quedo con|voy a elegir|אקח|אבחר|אני בוחר|אני בוחרת|אני רוצה|אני אקח|אני אבחר)\s+/u, "")
    .replace(/^(?:the|la|el|את)\s+/u, "")
    .replace(/\s+(?:please|por favor|בבקשה)$/u, "");
  const numbered = reference.match(/^(?:(?:option(?: number)?|number|opción(?: número)?|opcion(?: numero)?|número|numero|אפשרות(?: מספר)?|באפשרות(?: מספר)?|מספר)\s*)?(\d+)$/u);
  if (numbered) return Number(numbered[1]);
  const ordinal = reference.replace(/^(?:option|opción|opcion|אפשרות|האפשרות|באפשרות)\s+/u, "").replace(/\s+(?:one|option|opción|opcion)$/u, "");
  const ordinals = [
    ["first", "primera", "primero", "primer", "הראשון", "הראשונה", "ראשון", "ראשונה"],
    ["second", "segunda", "segundo", "השני", "השנייה", "השניה", "שני", "שנייה", "שניה"],
    ["third", "tercera", "tercero", "tercer", "השלישי", "השלישית", "שלישי", "שלישית"],
    ["fourth", "cuarta", "cuarto", "הרביעי", "הרביעית"],
    ["fifth", "quinta", "quinto", "החמישי", "החמישית"],
    ["sixth", "sexta", "sexto", "השישי", "השישית"],
    ["seventh", "séptima", "séptimo", "septima", "septimo", "השביעי", "השביעית"],
    ["eighth", "octava", "octavo", "השמיני", "השמינית"],
  ];
  const index = ordinals.findIndex(words => words.includes(ordinal));
  return index < 0 ? undefined : index + 1;
}
export function matchShoppingChoice(text: string, choices: ShoppingChoice[]): ShoppingChoice | undefined {
  const t=text.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim();
  const number = shoppingChoiceNumber(text);
  if (number !== undefined) return choices[number-1];
  const matches=choices.filter(c=>[`${c.productTitle} ${c.variantTitle}`,c.variantTitle,...c.options.map(o=>o.value)]
    .some(label=> {const l=label.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim(); return l && l!=="default title" && (` ${t} `).includes(` ${l} `);}));
  return matches.length===1?matches[0]:undefined;
}
export type ShoppingLocale = "en"|"es"|"he";
export function shoppingLocale(locale?: string): ShoppingLocale {return locale?.startsWith("he")?"he":locale?.startsWith("es")?"es":"en";}
export const shoppingCopy = {
 en: {selectedRetained:"Your exact selection is saved. Ask me to recheck its price and stock, choose another offered option, or start a new search.",verifiedStock:"Tracked stock checked: {quantity} units; not reserved.",chooseBeforeVerify:"Choose an option by name or number first so I can recheck that exact variant’s current price and inventory.",checkoutReady:"Continue to Shopify checkout using this secure link. Payment has not been confirmed.",checkoutPending:"Your selection is saved. Checkout could not be prepared yet. Reply “retry” later or ask a team member for help.",checkoutFallback:"Your selection is saved. A team member can help you continue checkout. Payment has not been confirmed.",checkoutPreview:"Private preview: your exact selection reached the checkout handoff. No Shopify cart or checkout link was created.",repeatSearch:"I no longer have those product options. Please repeat your product search and budget.", busy:"This shopping request is still being checked. Price and availability are not verified yet. Please repeat your latest request shortly; your existing shopping state has not been cancelled.", pending:"I haven't been able to recheck price and availability yet. Your shopping selection is saved, but it is not confirmed or reserved. Reply ‘retry’ to check again, or change your selection.", choose:"Choose an option by name or number. Availability was just checked; it is not reserved.", confirm:"Please confirm this exact selection before checkout.", unavailable:"I couldn't verify a matching option right now. Please try again or ask for a person.", changed:"The price or options changed. Please review and confirm the updated selection.", disabled:"Your selection is confirmed. Secure checkout assistance is not available yet. A team member can help you continue.", cancel:"Shopping cancelled. You can start a new search whenever you're ready.", handoff:"A team member needs to help with this conversation.", clarify:"What product are you looking for, and what is your budget?", options:"Which product or option would you like?", currency:"I can't verify this currency. Please use the store currency or ask a team member.", order:"A team member can help with your order. Please don't send payment card details here."},
 es: {selectedRetained:"Tu selección exacta sigue guardada. Pídeme verificar su precio y existencias, elige otra opción ofrecida o inicia una nueva búsqueda.",verifiedStock:"Existencias verificadas: {quantity} unidades; no están reservadas.",chooseBeforeVerify:"Primero elige una opción por nombre o número para verificar su precio e inventario actuales.",checkoutReady:"Continúa al pago en Shopify con este enlace seguro. El pago no está confirmado.",checkoutPending:"Tu selección está guardada. Aún no se pudo preparar el pago. Responde “reintentar” más tarde o pide ayuda.",checkoutFallback:"Tu selección está guardada. Una persona del equipo puede ayudarte con el pago. El pago no está confirmado.",checkoutPreview:"Vista previa privada: tu selección exacta llegó al paso de pago. No se creó ningún carrito ni enlace de Shopify.",repeatSearch:"Ya no tengo esas opciones de producto. Repite tu búsqueda y presupuesto.", busy:"Esta solicitud aún se está comprobando. El precio y la disponibilidad no están verificados. Repite tu última solicitud más tarde; no se ha cancelado tu estado de compra.", pending:"Aún no he podido verificar de nuevo el precio y la disponibilidad. Tu selección está guardada, pero no confirmada ni reservada. Responde ‘reintentar’ para comprobar otra vez o cambia tu selección.", choose:"Elige una opción por nombre o número. Acabo de verificar la disponibilidad; no está reservada.", confirm:"Confirma esta selección exacta antes de continuar al pago.", unavailable:"No pude verificar una opción ahora. Inténtalo de nuevo o pide ayuda humana.", changed:"El precio o las opciones cambiaron. Revisa y confirma la selección actualizada.", disabled:"Tu selección está confirmada. La asistencia de pago seguro aún no está disponible. Una persona del equipo puede ayudarte.", cancel:"Compra cancelada. Puedes iniciar otra búsqueda cuando quieras.", handoff:"Una persona del equipo debe ayudarte con esta conversación.", clarify:"¿Qué producto buscas y cuál es tu presupuesto?", options:"¿Qué producto u opción prefieres?", currency:"No puedo verificar esta moneda. Usa la moneda de la tienda o pide ayuda.", order:"Una persona del equipo puede ayudarte con tu pedido. No envíes datos de tarjetas aquí."},
 he: {selectedRetained:"הבחירה המדויקת שלכם נשמרה. אפשר לבקש בדיקה חוזרת של המחיר והמלאי, לבחור אפשרות אחרת שהוצעה או להתחיל חיפוש חדש.",verifiedStock:"המלאי המנוהל נבדק: {quantity} יחידות; אינן שמורות.",chooseBeforeVerify:"בחרו תחילה אפשרות לפי שם או מספר כדי שאוכל לבדוק שוב את המחיר והמלאי שלה.",checkoutReady:"אפשר להמשיך לתשלום ב-Shopify בקישור המאובטח. התשלום לא אושר.",checkoutPending:"הבחירה נשמרה. עדיין לא ניתן להכין את התשלום. כתבו ׳נסו שוב׳ בהמשך או בקשו עזרה מנציג.",checkoutFallback:"הבחירה נשמרה. נציג יכול לעזור בהמשך התשלום. התשלום לא אושר.",checkoutPreview:"תצוגה מקדימה פרטית: הבחירה המדויקת הגיעה לשלב התשלום. לא נוצרו עגלה או קישור ב-Shopify.",repeatSearch:"אפשרויות המוצר הקודמות אינן זמינות בשיחה. חזרו על חיפוש המוצר והתקציב.", busy:"בקשת הקנייה עדיין בבדיקה. המחיר והזמינות טרם אומתו. חזרו על הבקשה האחרונה בהמשך; מצב הקנייה הקיים לא בוטל.", pending:"עדיין לא הצלחתי לבדוק שוב מחיר וזמינות. הבחירה נשמרה אך אינה מאושרת או שמורה במלאי. כתבו ׳נסו שוב׳ לבדיקה חוזרת או שנו את הבחירה.", choose:"בחרו אפשרות לפי שם או מספר. הזמינות נבדקה עכשיו; המוצר אינו שמור.", confirm:"נא לאשר את הבחירה המדויקת לפני מעבר לתשלום.", unavailable:"לא ניתן לאמת אפשרות מתאימה כרגע. נסו שוב או בקשו נציג.", changed:"המחיר או האפשרויות השתנו. נא לבדוק ולאשר את הבחירה המעודכנת.", disabled:"הבחירה אושרה. סיוע בתשלום מאובטח עדיין אינו זמין. נציג יוכל לעזור להמשיך.", cancel:"הקנייה בוטלה. אפשר להתחיל חיפוש חדש בכל עת.", handoff:"נציג צריך לעזור בשיחה זו.", clarify:"איזה מוצר אתם מחפשים ומה התקציב?", options:"איזה מוצר או אפשרות תרצו?", currency:"לא ניתן לאמת מטבע זה. השתמשו במטבע החנות או בקשו נציג.", order:"נציג יוכל לעזור עם ההזמנה. אין לשלוח כאן פרטי כרטיס אשראי."},
} as const;
