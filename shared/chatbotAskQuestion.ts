/**
 * Channel-neutral Chatbot Ask Question runtime.
 * Persist wait_for_input, validate replies, and map answers onto tenant-scoped contacts.
 */

export const CHATBOT_ASK_CHANNELS = [
  "facebook",
  "whatsapp",
  "instagram",
  "sms",
  "telegram",
  "webchat",
] as const;

export type ChatbotAskChannel = (typeof CHATBOT_ASK_CHANNELS)[number];

export const CHATBOT_ASK_TTL_MS = 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9\s().-]{6,22}$/;
const VAR_NAME_RE = /^[a-z][a-z0-9_]{0,39}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const YES_RE = /^(yes|y|yeah|yep|ok|okay|agree|i agree|accept|i accept|sure)$/i;
const NO_RE = /^(no|n|nope|nah|decline|i decline|disagree|i disagree|reject)$/i;

export type ChatbotPendingKind = "ask_question" | "consent_buttons";

export type ChatbotPendingAsk = {
  flowRunId: string;
  flowId: string;
  nodeId: string;
  variableName: string;
  nextNodeId: string;
  channel: string;
  userId: string;
  contactId: string;
  conversationId: string;
  kind: ChatbotPendingKind;
  promptText: string;
  consumedSourceEventIds: string[];
  expiresAt: number;
};

export type ChatbotAskContact = {
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  customFields?: unknown;
};

export type ChatbotAskVariableKind = "name" | "email" | "phone" | "email_or_phone" | "consent" | "custom";

export type ChatbotAskValidateOk = {
  ok: true;
  kind: ChatbotAskVariableKind;
  value: string;
  accepted?: boolean;
};

export type ChatbotAskValidateFail = {
  ok: false;
  reason: "empty" | "invalid_email" | "invalid_phone" | "invalid_email_or_phone" | "invalid_name" | "invalid_consent" | "invalid_custom";
  retryPrompt: string;
};

export type ChatbotAskContactPatch = {
  name?: string;
  email?: string;
  phone?: string;
  customFields: Record<string, unknown>;
};

const memoryPending = new Map<string, ChatbotPendingAsk>();
const inflightClaims = new Set<string>();

export function resetChatbotAskQuestionMemoryForTests(): void {
  memoryPending.clear();
  inflightClaims.clear();
}

export function isChatbotAskChannel(channel: string): channel is ChatbotAskChannel {
  return (CHATBOT_ASK_CHANNELS as readonly string[]).includes(channel);
}

export function sanitizeChatbotVariableName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const key = raw.trim().toLowerCase().replace(/[\s/-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!key || FORBIDDEN_KEYS.has(key) || !VAR_NAME_RE.test(key)) return "";
  return key.slice(0, 40);
}

export function classifyChatbotAskVariable(variableName: unknown): ChatbotAskVariableKind {
  const key = sanitizeChatbotVariableName(variableName);
  if (key === "name" || key === "full_name" || key === "customer_name") return "name";
  if (key === "email" || key === "email_address") return "email";
  if (key === "phone" || key === "phone_number" || key === "mobile") return "phone";
  if (
    key === "email_phone" ||
    key === "email_or_phone" ||
    key === "emailphone" ||
    key === "contact" ||
    key === "email_or_mobile"
  ) {
    return "email_or_phone";
  }
  if (key === "consent" || key === "opt_in" || key === "optin") return "consent";
  return "custom";
}

export function isVerifiedContactEmail(email: unknown): boolean {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  return EMAIL_RE.test(trimmed);
}

export function isVerifiedContactPhone(phone: unknown): boolean {
  if (typeof phone !== "string") return false;
  return PHONE_RE.test(phone.trim());
}

export function normalizeChatbotEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(v)) return null;
  return v;
}

export function normalizeChatbotPhone(raw: string): string | null {
  const v = raw.trim();
  if (!PHONE_RE.test(v)) return null;
  return v.replace(/\s+/g, " ").trim();
}

function retryFor(kind: ChatbotAskVariableKind): ChatbotAskValidateFail {
  switch (kind) {
    case "email":
      return { ok: false, reason: "invalid_email", retryPrompt: "Please send a valid email address." };
    case "phone":
      return { ok: false, reason: "invalid_phone", retryPrompt: "Please send a valid phone number." };
    case "email_or_phone":
      return {
        ok: false,
        reason: "invalid_email_or_phone",
        retryPrompt: "Please send a valid email address or phone number.",
      };
    case "name":
      return { ok: false, reason: "invalid_name", retryPrompt: "Please send your name." };
    case "consent":
      return { ok: false, reason: "invalid_consent", retryPrompt: "Please reply Yes or No." };
    default:
      return { ok: false, reason: "invalid_custom", retryPrompt: "Please send a valid answer." };
  }
}

export function validateChatbotAskAnswer(
  variableName: unknown,
  rawMessage: unknown,
  _existing?: ChatbotAskContact,
): ChatbotAskValidateOk | ChatbotAskValidateFail {
  const kind = classifyChatbotAskVariable(variableName);
  const text = typeof rawMessage === "string" ? rawMessage.trim() : "";
  if (!text) return { ok: false, reason: "empty", retryPrompt: retryFor(kind).retryPrompt };

  if (kind === "name") {
    if (text.length < 2 || EMAIL_RE.test(text) || PHONE_RE.test(text)) return retryFor("name");
    return { ok: true, kind, value: text.slice(0, 120) };
  }
  if (kind === "email") {
    const email = normalizeChatbotEmail(text);
    if (!email) return retryFor("email");
    return { ok: true, kind, value: email };
  }
  if (kind === "phone") {
    const phone = normalizeChatbotPhone(text);
    if (!phone) return retryFor("phone");
    return { ok: true, kind, value: phone };
  }
  if (kind === "email_or_phone") {
    const email = normalizeChatbotEmail(text);
    if (email) return { ok: true, kind: "email", value: email };
    const phone = normalizeChatbotPhone(text);
    if (phone) return { ok: true, kind: "phone", value: phone };
    return retryFor("email_or_phone");
  }
  if (kind === "consent") {
    if (YES_RE.test(text)) return { ok: true, kind, value: "yes", accepted: true };
    if (NO_RE.test(text)) return { ok: true, kind, value: "no", accepted: false };
    return retryFor("consent");
  }
  if (text.length > 500 || /[<>]|javascript:/i.test(text)) return retryFor("custom");
  return { ok: true, kind, value: text.slice(0, 500) };
}

export function mergeChatbotCustomVariable(
  existing: unknown,
  variableName: string,
  value: string,
  savedAt: string,
): Record<string, unknown> {
  const customFields =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const key = sanitizeChatbotVariableName(variableName);
  if (!key) return customFields;
  const prior =
    customFields.chatbotVars && typeof customFields.chatbotVars === "object" && !Array.isArray(customFields.chatbotVars)
      ? { ...(customFields.chatbotVars as Record<string, unknown>) }
      : {};
  prior[key] = { value, savedAt };
  customFields.chatbotVars = prior;
  return customFields;
}

export function mergeChatbotConsent(
  existing: unknown,
  input: { accepted: boolean; channel: string; acceptedAt: string; conversationId: string; flowRunId: string },
): Record<string, unknown> {
  const customFields =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  customFields.chatbotConsent = {
    accepted: input.accepted === true,
    channel: String(input.channel || "").slice(0, 40),
    acceptedAt: input.acceptedAt,
    conversationId: input.conversationId,
    flowRunId: input.flowRunId,
    source: "chatbot_buttons",
  };
  return customFields;
}

/**
 * Map a validated answer onto contact fields. Never writes invalid email/phone
 * over an existing verified value — callers must retry instead of applying.
 */
export function applyChatbotAskAnswer(params: {
  contact: ChatbotAskContact;
  expectedUserId: string;
  variableName: unknown;
  validated: ChatbotAskValidateOk;
  channel: string;
  conversationId: string;
  flowRunId: string;
  savedAt?: string;
}): { ok: true; patch: ChatbotAskContactPatch } | { ok: false; reason: "tenant_mismatch" } {
  if (params.contact.userId && params.contact.userId !== params.expectedUserId) {
    return { ok: false, reason: "tenant_mismatch" };
  }
  const savedAt = params.savedAt || new Date().toISOString();
  let customFields =
    params.contact.customFields && typeof params.contact.customFields === "object"
      ? { ...(params.contact.customFields as Record<string, unknown>) }
      : {};
  const patch: ChatbotAskContactPatch = { customFields };

  if (params.validated.kind === "name") {
    patch.name = params.validated.value;
  } else if (params.validated.kind === "email") {
    patch.email = params.validated.value;
  } else if (params.validated.kind === "phone") {
    patch.phone = params.validated.value;
  } else if (params.validated.kind === "consent") {
    customFields = mergeChatbotConsent(customFields, {
      accepted: params.validated.accepted === true,
      channel: params.channel,
      acceptedAt: savedAt,
      conversationId: params.conversationId,
      flowRunId: params.flowRunId,
    });
    patch.customFields = customFields;
  } else {
    customFields = mergeChatbotCustomVariable(
      customFields,
      sanitizeChatbotVariableName(params.variableName) || "answer",
      params.validated.value,
      savedAt,
    );
    patch.customFields = customFields;
  }
  return { ok: true, patch };
}

export function parseChatbotPendingAsk(raw: unknown): ChatbotPendingAsk | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const flowRunId = typeof o.flowRunId === "string" ? o.flowRunId.trim() : "";
  const flowId = typeof o.flowId === "string" ? o.flowId.trim() : "";
  const nodeId = typeof o.nodeId === "string" ? o.nodeId.trim() : "";
  const conversationId = typeof o.conversationId === "string" ? o.conversationId.trim() : "";
  const userId = typeof o.userId === "string" ? o.userId.trim() : "";
  const contactId = typeof o.contactId === "string" ? o.contactId.trim() : "";
  const channel = typeof o.channel === "string" ? o.channel.trim() : "";
  if (!flowRunId || !flowId || !nodeId || !conversationId || !userId || !contactId || !channel) return null;
  const expiresAt = typeof o.expiresAt === "number" && Number.isFinite(o.expiresAt) ? o.expiresAt : 0;
  if (expiresAt && Date.now() > expiresAt) return null;
  const consumed = Array.isArray(o.consumedSourceEventIds)
    ? o.consumedSourceEventIds.filter((x): x is string => typeof x === "string" && x.length > 0).slice(-40)
    : [];
  const kind: ChatbotPendingKind = o.kind === "consent_buttons" ? "consent_buttons" : "ask_question";
  return {
    flowRunId,
    flowId,
    nodeId,
    variableName: typeof o.variableName === "string" ? o.variableName : "",
    nextNodeId: typeof o.nextNodeId === "string" ? o.nextNodeId : "",
    channel,
    userId,
    contactId,
    conversationId,
    kind,
    promptText: typeof o.promptText === "string" ? o.promptText.slice(0, 500) : "",
    consumedSourceEventIds: consumed,
    expiresAt: expiresAt || Date.now() + CHATBOT_ASK_TTL_MS,
  };
}

export function createChatbotPendingAsk(input: {
  flowRunId: string;
  flowId: string;
  nodeId: string;
  variableName?: unknown;
  nextNodeId: string;
  channel: string;
  userId: string;
  contactId: string;
  conversationId: string;
  kind?: ChatbotPendingKind;
  promptText?: string;
  consumedSourceEventIds?: string[];
  now?: number;
}): ChatbotPendingAsk {
  const now = input.now ?? Date.now();
  return {
    flowRunId: input.flowRunId,
    flowId: input.flowId,
    nodeId: input.nodeId,
    variableName: sanitizeChatbotVariableName(input.variableName),
    nextNodeId: String(input.nextNodeId || ""),
    channel: input.channel,
    userId: input.userId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    kind: input.kind || "ask_question",
    promptText: String(input.promptText || "").slice(0, 500),
    consumedSourceEventIds: (input.consumedSourceEventIds || []).slice(-40),
    expiresAt: now + CHATBOT_ASK_TTL_MS,
  };
}

export function rememberChatbotPendingAsk(pending: ChatbotPendingAsk): void {
  memoryPending.set(pending.conversationId, pending);
}

export function peekChatbotPendingAsk(conversationId: string): ChatbotPendingAsk | null {
  const pending = memoryPending.get(conversationId);
  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    memoryPending.delete(conversationId);
    return null;
  }
  return pending;
}

export function clearChatbotPendingAsk(conversationId: string): void {
  memoryPending.delete(conversationId);
}

export function mergeChatbotPendingIntoAiControl(
  raw: unknown,
  pending: ChatbotPendingAsk | null,
): Record<string, unknown> {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  if (pending) o.chatbotPendingInput = pending;
  else delete o.chatbotPendingInput;
  return o;
}

export function pendingAskFromAiControl(raw: unknown): ChatbotPendingAsk | null {
  if (!raw || typeof raw !== "object") return null;
  return parseChatbotPendingAsk((raw as Record<string, unknown>).chatbotPendingInput);
}

function claimKey(conversationId: string, sourceEventId: string): string {
  return `${conversationId}:${sourceEventId}`;
}

export type ClaimPendingAskResult =
  | { ok: true; pending: ChatbotPendingAsk }
  | { ok: false; reason: "missing" | "tenant_mismatch" | "duplicate" | "inflight" };

export function claimChatbotPendingAsk(params: {
  conversationId: string;
  userId: string;
  sourceEventId?: string | null;
  pending?: ChatbotPendingAsk | null;
}): ClaimPendingAskResult {
  const pending = params.pending || peekChatbotPendingAsk(params.conversationId);
  if (!pending) return { ok: false, reason: "missing" };
  if (pending.userId !== params.userId || pending.conversationId !== params.conversationId) {
    return { ok: false, reason: "tenant_mismatch" };
  }
  const eventId = typeof params.sourceEventId === "string" ? params.sourceEventId.trim() : "";
  if (eventId && pending.consumedSourceEventIds.includes(eventId)) {
    return { ok: false, reason: "duplicate" };
  }
  if (eventId) {
    const key = claimKey(params.conversationId, eventId);
    if (inflightClaims.has(key)) return { ok: false, reason: "duplicate" };
    inflightClaims.add(key);
  }
  return { ok: true, pending };
}

export function releaseChatbotPendingClaim(conversationId: string, sourceEventId?: string | null): void {
  const eventId = typeof sourceEventId === "string" ? sourceEventId.trim() : "";
  if (eventId) inflightClaims.delete(claimKey(conversationId, eventId));
}

export function markChatbotPendingConsumed(pending: ChatbotPendingAsk, sourceEventId?: string | null): ChatbotPendingAsk {
  const eventId = typeof sourceEventId === "string" ? sourceEventId.trim() : "";
  const consumed = eventId
    ? [...pending.consumedSourceEventIds.filter((id) => id !== eventId), eventId].slice(-40)
    : pending.consumedSourceEventIds;
  const next = { ...pending, consumedSourceEventIds: consumed };
  rememberChatbotPendingAsk(next);
  return next;
}

export function isConsentYesNoButtons(
  buttons: Array<{ label?: string; value?: string }>,
  variableName?: unknown,
): boolean {
  if (classifyChatbotAskVariable(variableName) === "consent") return true;
  if (buttons.length < 2 || buttons.length > 3) return false;
  const tokens = buttons.map((b) => `${b.label || ""} ${b.value || ""}`.trim());
  const hasYes = tokens.some((t) => YES_RE.test(t) || /\byes\b/i.test(t));
  const hasNo = tokens.some((t) => NO_RE.test(t) || /\bno\b/i.test(t));
  return hasYes && hasNo;
}

export function consentAcceptedFromButton(label: string, value: string): boolean | null {
  const blob = `${label} ${value}`.trim();
  if (YES_RE.test(blob) || /\byes\b/i.test(blob)) return true;
  if (NO_RE.test(blob) || /\bno\b/i.test(blob)) return false;
  return null;
}
