/**
 * Per-contact (+ channel account) composer draft isolation.
 * Prevents AI/manual drafts from leaking across inbox contact switches.
 */

export type ComposerDraftSource =
  | "suggest_reply"
  | "auto_ai"
  | "manual"
  | "local_storage"
  | "websocket"
  | "copilot";

export type ComposerDraftMeta = {
  contactId?: string | null;
  conversationId?: string | null;
  source?: ComposerDraftSource;
};

export type ComposerDraftTraceEvent = "save" | "load" | "clear" | "ignore_stale";

const draftByScope = new Map<string, string>();

export function buildComposerDraftScopeKey(
  contactId: string,
  channelAccountId?: string | null,
  channel?: string | null,
): string {
  const account = (channelAccountId || channel || "default").trim() || "default";
  return `${contactId}::${account}`;
}

export function shouldApplyComposerDraft(params: {
  activeContactId: string | null | undefined;
  activeConversationId?: string | null;
  draftContactId?: string | null;
  draftConversationId?: string | null;
}): boolean {
  const activeContactId = params.activeContactId?.trim() || null;
  if (!activeContactId) return false;

  const draftContactId = params.draftContactId?.trim() || null;
  if (draftContactId && draftContactId !== activeContactId) return false;

  const activeConversationId = params.activeConversationId?.trim() || null;
  const draftConversationId = params.draftConversationId?.trim() || null;
  if (draftConversationId && activeConversationId && draftConversationId !== activeConversationId) {
    return false;
  }

  return true;
}

export function saveComposerDraft(scopeKey: string, text: string, source: ComposerDraftSource = "manual"): void {
  const trimmed = text.trim();
  if (!scopeKey) return;
  if (!trimmed) {
    draftByScope.delete(scopeKey);
    logComposerDraftTrace({
      event: "clear",
      activeContactId: scopeKey.split("::")[0] || null,
      draftContactId: scopeKey.split("::")[0] || null,
      source,
    });
    return;
  }
  draftByScope.set(scopeKey, text);
  logComposerDraftTrace({
    event: "save",
    activeContactId: scopeKey.split("::")[0] || null,
    draftContactId: scopeKey.split("::")[0] || null,
    source,
  });
}

export function loadComposerDraft(scopeKey: string): string {
  if (!scopeKey) return "";
  return draftByScope.get(scopeKey) ?? "";
}

export function clearComposerDraft(scopeKey: string, source: ComposerDraftSource = "manual"): void {
  if (!scopeKey) return;
  draftByScope.delete(scopeKey);
  logComposerDraftTrace({
    event: "clear",
    activeContactId: scopeKey.split("::")[0] || null,
    draftContactId: scopeKey.split("::")[0] || null,
    source,
  });
}

export function logComposerDraftTrace(params: {
  event: ComposerDraftTraceEvent;
  activeContactId?: string | null;
  draftContactId?: string | null;
  source?: ComposerDraftSource;
  conversationId?: string | null;
}): void {
  console.info(
    "[ComposerDraftTrace]",
    JSON.stringify({
      event: params.event,
      activeContactId: params.activeContactId ?? null,
      draftContactId: params.draftContactId ?? null,
      source: params.source ?? null,
      conversationId: params.conversationId ?? null,
      loggedAt: new Date().toISOString(),
    }),
  );
}

/** Test helper — reset in-memory draft store. */
export function resetComposerDraftStoreForTests(): void {
  draftByScope.clear();
}
