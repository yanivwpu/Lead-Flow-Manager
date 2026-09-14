/**
 * When and how to present a page-rule engagement without restarting the thread.
 */

export const WEBCHAT_HUMAN_TAKEOVER_HEADER = "X-Webchat-Human-Takeover";
export const WEBCHAT_SHOWN_PAGE_RULES_STORAGE_PREFIX = "wcw-pr-shown";

export type PageRuleEngagementPresentation = "empty" | "card" | "none";

export type PageRuleEngagementMessage = {
  direction: "inbound" | "outbound";
  contentType?: string | null;
  templateVariables?: { chatbotButtons?: unknown; webchatForm?: unknown } | null;
};

export function transcriptHasPendingVisitorInput(messages: PageRuleEngagementMessage[]): boolean {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  let lastOutboundWithInput = -1;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.direction !== "outbound") continue;
    const buttons = msg.templateVariables?.chatbotButtons;
    const form = msg.templateVariables?.webchatForm;
    const isButtons = msg.contentType === "buttons" && Array.isArray(buttons) && buttons.length > 0;
    const isForm = msg.contentType === "form" && !!form;
    if (isButtons || isForm) lastOutboundWithInput = i;
  }
  if (lastOutboundWithInput < 0) return false;
  return !messages.slice(lastOutboundWithInput + 1).some((msg) => msg.direction === "inbound");
}

export function shownPageRulesStorageKey(widgetId: string, visitorId: string): string {
  return `${WEBCHAT_SHOWN_PAGE_RULES_STORAGE_PREFIX}:${String(widgetId || "").trim()}:${String(visitorId || "").trim()}`;
}

export function readShownPageRuleKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && !!item.trim() && !item.includes("://"))
      .map((item) => item.trim().slice(0, 220))
      .slice(0, 30);
  } catch {
    return [];
  }
}

export function writeShownPageRuleKeys(existing: string[], nextKey: string): string[] {
  const key = String(nextKey || "").trim().slice(0, 220);
  if (!key || key.includes("://")) return existing.slice(0, 30);
  if (existing.includes(key)) return existing.slice(0, 30);
  return [...existing, key].slice(0, 30);
}

export function shouldApplyPageRulePrefill(input: {
  transcriptCount: number;
  composerDirty: boolean;
  alreadyApplied: boolean;
  prefill: string;
}): boolean {
  if (!input.prefill.trim()) return false;
  if (input.alreadyApplied || input.composerDirty || input.transcriptCount > 0) return false;
  return true;
}

export function decidePageRuleEngagement(input: {
  hasMatch: boolean;
  ruleKey?: string | null;
  alreadyShown: boolean;
  activeThisMount?: boolean;
  dismissed?: boolean;
  transcriptCount: number;
  humanTakeover: boolean;
  pendingVisitorInput: boolean;
}): PageRuleEngagementPresentation {
  if (!input.hasMatch || !input.ruleKey || input.dismissed) return "none";
  if (input.alreadyShown && !input.activeThisMount) return "none";
  if (input.humanTakeover || input.pendingVisitorInput) return "none";
  return input.transcriptCount === 0 ? "empty" : "card";
}
