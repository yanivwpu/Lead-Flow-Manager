import type { CurrentTurnPageAction } from "./webchatPageRuleAction";
import { normalizeWidgetStaticLocale } from "./webchatWidgetLocale";

export function isProspectAiMarketingPage(parentUrl: string | null | undefined): boolean {
  try {
    const url = new URL(parentUrl || "");
    return url.protocol === "https:" &&
      ["www.whachatcrm.com", "whachatcrm.com"].includes(url.hostname) &&
      /^\/(?:es\/|he\/)?prospect-ai\/?$/.test(url.pathname);
  } catch { return false; }
}

const FIND_LABELS = ["Help me find prospects", "Ayúdame a encontrar clientes potenciales", "עזרו לי למצוא לקוחות פוטנציאליים"];
const OUTREACH_LABELS = ["How does outreach work?", "¿Cómo funcionan las campañas de contacto?", "איך מתבצעת הפנייה לעסקים?"];
const REPLIES = {
  en: {
    find: "What type of businesses would you like to reach, and in which city or area?",
    outreach: "Start by discovering businesses by type and location. Send the prospects to Review, qualify and accept the ones that fit, then add them to a campaign. Review or edit each message before starting outreach; replies arrive in Unified Inbox for follow-up.\n\nStart free and plan your first search:\nhttps://www.whachatcrm.com/auth?redirect=%2Fapp%2Fprospect-ai",
  },
  es: {
    find: "¿Qué tipo de empresas te gustaría contactar y en qué ciudad o zona?",
    outreach: "Primero busca empresas por tipo y ubicación. Envía los resultados a Revisión, evalúa y acepta los que encajen y añádelos a una campaña. Revisa o edita cada mensaje antes de iniciar el envío; las respuestas llegan a Unified Inbox para el seguimiento.\n\nEmpieza gratis y prepara tu primera búsqueda:\nhttps://www.whachatcrm.com/auth?redirect=%2Fapp%2Fprospect-ai",
  },
  he: {
    find: "לאיזה סוג של עסקים תרצו לפנות, ובאיזו עיר או אזור?",
    outreach: "מתחילים בחיפוש עסקים לפי סוג ומיקום. מעבירים את התוצאות לבדיקה, מעריכים ומאשרים את העסקים המתאימים ומוסיפים אותם לקמפיין. בודקים או עורכים כל הודעה לפני תחילת השליחה; התשובות מגיעות ל-Unified Inbox להמשך טיפול.\n\nהתחילו בחינם ותכננו את החיפוש הראשון שלכם:\nhttps://www.whachatcrm.com/auth?redirect=%2Fapp%2Fprospect-ai",
  },
} as const;

/** Only server-validated actions for the current inbound on our product page. */
export function trustedProspectAiPageRuleReply(action: CurrentTurnPageAction, locale?: string | null): string | null {
  if (!action.trusted || !action.provenanceCurrentInbound || !isProspectAiMarketingPage(action.parentUrl)) return null;
  const label = String(action.label || "").trim();
  const copy = REPLIES[normalizeWidgetStaticLocale(locale)];
  if (FIND_LABELS.includes(label)) return copy.find;
  if (OUTREACH_LABELS.includes(label)) return copy.outreach;
  return null;
}

export const PROSPECT_AI_SEARCH_PLANNING_CONTEXT =
  "The visitor is on WhachatCRM's Prospect AI product page. Help plan a business prospect search by target business type and target city/area. Use details already provided; do not repeat answered questions or require team size/budget before helping. Once the target is clear, summarize the proposed search and offer https://www.whachatcrm.com/auth?redirect=%2Fapp%2Fprospect-ai to start free inside their account. This public chat cannot run a discovery search, send outreach, or produce live prospect results. Never claim that it did. Explain review/approval before campaign sending. Send the workspace-selected Calendly link when a demo is requested.";
