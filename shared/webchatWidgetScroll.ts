/**
 * WidgetFrame conversation scrolling: polls must not yank a reading visitor,
 * and a newly arrived structured form must show its title first.
 *
 * Message identity (ordered IDs) is separate from visitor data refresh
 * (signed mediaUrl, status, caption, buttons, form definition).
 */

export const WEBCHAT_NEAR_BOTTOM_PX = 80;

export type WebchatScrollMessage = {
  id: string;
  contentType?: string | null;
  mediaUrl?: string | null;
  status?: string | null;
  content?: string | null;
  createdAt?: string | Date | null;
  templateVariables?: unknown;
};

export type WebchatScrollAction = "preserve" | "bottom" | "form-start" | "confirmation";

export type WebchatScrollDecision = {
  action: WebchatScrollAction;
  messageId?: string;
};

export function webchatDistanceFromBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  return scrollHeight - scrollTop - clientHeight;
}

export function webchatIsNearBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  thresholdPx = WEBCHAT_NEAR_BOTTOM_PX,
): boolean {
  return webchatDistanceFromBottom(scrollTop, scrollHeight, clientHeight) <= thresholdPx;
}

export function webchatMessageIds(messages: Array<{ id?: unknown }>): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    if (typeof message?.id === "string" && message.id.length > 0) ids.push(message.id);
  }
  return ids;
}

export function webchatMessageIdsKey(messages: Array<{ id?: unknown }>): string {
  return webchatMessageIds(messages).join("\n");
}

export function webchatIdsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

function visitorTemplateVarsKey(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  return JSON.stringify({
    buttons: o.chatbotButtons ?? null,
    form: o.webchatForm ?? null,
  });
}

/** Accept a newly signed proxy URL; never keep an expired signature once the poll omitted or replaced it. */
export function refreshWebchatVisitorMediaUrl(
  previous: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const prev = typeof previous === "string" && previous.trim() ? previous : null;
  const next = typeof incoming === "string" && incoming.trim() ? incoming : null;
  if (next) return next;
  if (prev && prev.startsWith("blob:")) return prev;
  return null;
}

function sameCreatedAt(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  const ta = a instanceof Date ? a.getTime() : Date.parse(String(a ?? ""));
  const tb = b instanceof Date ? b.getTime() : Date.parse(String(b ?? ""));
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb;
  return String(a ?? "") === String(b ?? "");
}

export function patchWebchatPolledMessage<T extends WebchatScrollMessage>(prev: T, incoming: T): T {
  const mediaUrl = refreshWebchatVisitorMediaUrl(prev.mediaUrl, incoming.mediaUrl);
  const status = incoming.status !== undefined ? incoming.status : prev.status;
  const content = incoming.content !== undefined ? incoming.content : prev.content;
  const contentType =
    incoming.contentType !== undefined && incoming.contentType !== null
      ? incoming.contentType
      : prev.contentType;
  const templateVariables =
    incoming.templateVariables !== undefined ? incoming.templateVariables : prev.templateVariables;
  const createdAt = incoming.createdAt !== undefined ? incoming.createdAt : prev.createdAt;
  if (
    mediaUrl === (prev.mediaUrl ?? null) &&
    status === prev.status &&
    content === prev.content &&
    (contentType || "text") === (prev.contentType || "text") &&
    visitorTemplateVarsKey(templateVariables) === visitorTemplateVarsKey(prev.templateVariables) &&
    sameCreatedAt(createdAt, prev.createdAt)
  ) {
    return prev;
  }
  return {
    ...prev,
    mediaUrl,
    status,
    content,
    contentType,
    templateVariables,
    createdAt,
  };
}

/**
 * Same ordered IDs: not new conversation activity. Still patch mutable visitor
 * fields (including a freshly signed mediaUrl) onto existing rows.
 * Unchanged signatures keep the previous row object so the <img> does not reload.
 */
export function mergeWebchatPolledMessages<T extends WebchatScrollMessage>(prev: T[], next: T[]): T[] {
  const prevIds = webchatMessageIds(prev);
  const nextIds = webchatMessageIds(next);
  if (!webchatIdsEqual(prevIds, nextIds)) return next;
  let changed = false;
  const merged = prev.map((row, i) => {
    const patched = patchWebchatPolledMessage(row, next[i]!);
    if (patched !== row) changed = true;
    return patched;
  });
  return changed ? merged : prev;
}

export function decideWebchatScrollAction(input: {
  prevIds: readonly string[];
  nextMessages: WebchatScrollMessage[];
  nearBottom: boolean;
  userInitiated: boolean;
  alreadyRevealedFormIds: ReadonlySet<string>;
  expectConfirmation: boolean;
}): WebchatScrollDecision {
  const nextIds = webchatMessageIds(input.nextMessages);
  const prevSet = new Set(input.prevIds);
  const newIds = new Set(nextIds.filter((id) => !prevSet.has(id)));
  const idsUnchanged = webchatIdsEqual(input.prevIds, nextIds);

  if (input.expectConfirmation) {
    for (let i = input.nextMessages.length - 1; i >= 0; i--) {
      const row = input.nextMessages[i]!;
      if (row.contentType === "form_result" && newIds.has(row.id)) {
        return { action: "confirmation", messageId: row.id };
      }
    }
  }

  if (idsUnchanged) return { action: "preserve" };

  const newForm = input.nextMessages.find(
    (row) =>
      row.contentType === "form" &&
      newIds.has(row.id) &&
      !input.alreadyRevealedFormIds.has(row.id),
  );
  if (newForm) return { action: "form-start", messageId: newForm.id };

  if (input.userInitiated || input.nearBottom) return { action: "bottom" };
  return { action: "preserve" };
}
