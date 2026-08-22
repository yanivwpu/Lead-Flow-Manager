/**
 * WhatsApp Coexistence Business App outbound echoes (`smb_message_echoes`).
 *
 * Meta delivers these when a Coexistence-onboarded business sends (or edits/revokes)
 * a message from the WhatsApp Business app or a linked companion device.
 * Cloud API / Standard Embedded Signup numbers do not use this field.
 *
 * WABA `POST /{waba-id}/subscribed_apps` only attaches the app to the WABA.
 * Field delivery is controlled in Meta App Dashboard → WhatsApp → Configuration.
 *
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes
 */

export const SMB_MESSAGE_ECHOES_FIELD = "smb_message_echoes";

/**
 * Coexistence onboarding expects these WhatsApp product webhook fields
 * in addition to whatever Standard Cloud API already uses (`messages`, statuses).
 */
export const COEXISTENCE_WHATSAPP_WEBHOOK_FIELDS = [
  "messages",
  "smb_message_echoes",
  "smb_app_state_sync",
  "history",
] as const;

export type CoexistenceWhatsAppWebhookField =
  (typeof COEXISTENCE_WHATSAPP_WEBHOOK_FIELDS)[number];

export type SmbEchoAction = "create" | "edit" | "revoke" | "skip";

export type ParsedSmbMessageEcho = {
  id: string;
  /** Business display phone (echo `from`). */
  from: string;
  /** Customer WhatsApp number (echo `to`). */
  to: string;
  timestamp: string;
  type: string;
  action: SmbEchoAction;
  content: string;
  contentType: string;
  mediaId?: string;
  mediaFilename?: string;
  caption?: string;
  originalMessageId?: string;
  skipReason?: string;
};

export type ParsedSmbMessageEchoesWebhook = {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  echoCount: number;
  echoes: ParsedSmbMessageEcho[];
};

export type WhatsAppSmbEchoPersistOutcome =
  | "persisted"
  | "deduped"
  | "skipped"
  | "edited"
  | "revoked";

const SUPPORTED_CREATE_TYPES = new Set([
  "text",
  "image",
  "video",
  "audio",
  "document",
  "sticker",
  "location",
  "contacts",
]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function mediaPreview(type: string): string {
  switch (type) {
    case "image":
      return "Photo";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "document":
      return "Document";
    case "sticker":
      return "Sticker";
    case "location":
      return "Location";
    case "contacts":
      return "Contact card";
    default:
      return "Media";
  }
}

function parseCreateEcho(raw: Record<string, unknown>, type: string): ParsedSmbMessageEcho {
  const id = asString(raw.id);
  const from = asString(raw.from);
  const to = asString(raw.to);
  const timestamp = asString(raw.timestamp);
  const base = { id, from, to, timestamp, type };

  if (!id || !from || !to) {
    return {
      ...base,
      action: "skip",
      content: "",
      contentType: "text",
      skipReason: "missing_echo_identity",
    };
  }

  if (!SUPPORTED_CREATE_TYPES.has(type)) {
    return {
      ...base,
      action: "skip",
      content: "",
      contentType: "text",
      skipReason: `unsupported_echo_type:${type || "unknown"}`,
    };
  }

  if (type === "text") {
    const text = asRecord(raw.text);
    const body = asString(text?.body);
    return {
      ...base,
      action: "create",
      content: body,
      contentType: "text",
    };
  }

  if (type === "image" || type === "video" || type === "audio" || type === "document" || type === "sticker") {
    const obj = asRecord(raw[type]);
    const caption = asString(obj?.caption);
    const mediaId = asString(obj?.id);
    const mediaFilename = asString(obj?.filename) || undefined;
    return {
      ...base,
      action: "create",
      content: caption || mediaPreview(type),
      contentType: type,
      mediaId: mediaId || undefined,
      mediaFilename,
      caption: caption || undefined,
    };
  }

  if (type === "location") {
    const loc = asRecord(raw.location);
    const name = asString(loc?.name);
    const address = asString(loc?.address);
    const lat = loc?.latitude;
    const lng = loc?.longitude;
    const coords =
      typeof lat === "number" && typeof lng === "number" ? `${lat}, ${lng}` : "";
    const content = [name, address].filter(Boolean).join(" — ") || coords || mediaPreview("location");
    return {
      ...base,
      action: "create",
      content,
      contentType: "location",
    };
  }

  const contacts = Array.isArray(raw.contacts) ? raw.contacts : [];
  const first = asRecord(contacts[0]);
  const nameObj = asRecord(first?.name);
  const formatted = asString(nameObj?.formatted_name);
  return {
    ...base,
    action: "create",
    content: formatted || mediaPreview("contacts"),
    contentType: "text",
  };
}

function parseSpecialEcho(raw: Record<string, unknown>, type: "edit" | "revoke"): ParsedSmbMessageEcho {
  const id = asString(raw.id);
  const from = asString(raw.from);
  const to = asString(raw.to);
  const timestamp = asString(raw.timestamp);
  const spec = asRecord(raw[type]);
  const originalMessageId = asString(spec?.original_message_id);
  if (!originalMessageId) {
    return {
      id,
      from,
      to,
      timestamp,
      type,
      action: "skip",
      content: "",
      contentType: "text",
      skipReason: `missing_${type}_original_message_id`,
    };
  }

  if (type === "revoke") {
    return {
      id,
      from,
      to,
      timestamp,
      type,
      action: "revoke",
      content: "[Message deleted]",
      contentType: "text",
      originalMessageId,
    };
  }

  const nested = asRecord(spec?.message);
  const nestedType = asString(nested?.type) || "text";
  const nestedParsed = nested
    ? parseCreateEcho(
        {
          id: originalMessageId,
          from,
          to,
          timestamp,
          type: nestedType,
          ...nested,
        },
        nestedType,
      )
    : null;
  if (!nestedParsed || nestedParsed.action === "skip") {
    return {
      id,
      from,
      to,
      timestamp,
      type,
      action: "skip",
      content: "",
      contentType: "text",
      originalMessageId,
      skipReason: nestedParsed?.skipReason || "unsupported_edit_payload",
    };
  }
  return {
    ...nestedParsed,
    id,
    from,
    to,
    timestamp,
    type: "edit",
    action: "edit",
    originalMessageId,
  };
}

function parseEchoItem(rawUnknown: unknown): ParsedSmbMessageEcho | null {
  const raw = asRecord(rawUnknown);
  if (!raw) return null;
  const type = asString(raw.type).toLowerCase();
  if (type === "edit" || type === "revoke") {
    return parseSpecialEcho(raw, type);
  }
  return parseCreateEcho(raw, type || "unknown");
}

/**
 * Extract Coexistence Business App echoes from a Meta webhook body.
 * Returns null when the payload is not an `smb_message_echoes` event.
 */
export function parseSmbMessageEchoesWebhook(body: unknown): ParsedSmbMessageEchoesWebhook | null {
  const root = asRecord(body);
  if (!root) return null;
  if (root.object !== "whatsapp_business_account") return null;
  const entries = Array.isArray(root.entry) ? root.entry : [];
  const echoes: ParsedSmbMessageEcho[] = [];
  let phoneNumberId = "";
  let displayPhoneNumber: string | null = null;
  let wabaId: string | null = null;
  let sawEchoField = false;

  for (const ent of entries) {
    const entry = asRecord(ent);
    if (!entry) continue;
    if (!wabaId && typeof entry.id === "string" && entry.id.trim()) {
      wabaId = entry.id.trim();
    }
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const ch of changes) {
      const change = asRecord(ch);
      if (!change) continue;
      const field = asString(change.field);
      const value = asRecord(change.value) || {};
      const hasEchoes = Array.isArray(value.message_echoes);
      if (field !== SMB_MESSAGE_ECHOES_FIELD && !hasEchoes) continue;
      sawEchoField = true;
      const meta = asRecord(value.metadata);
      const pid = asString(meta?.phone_number_id);
      if (pid && !phoneNumberId) phoneNumberId = pid;
      const display = asString(meta?.display_phone_number);
      if (display && !displayPhoneNumber) displayPhoneNumber = display;
      const list = hasEchoes ? (value.message_echoes as unknown[]) : [];
      for (const item of list) {
        const parsed = parseEchoItem(item);
        if (parsed) echoes.push(parsed);
      }
    }
  }

  if (!sawEchoField) return null;
  return {
    phoneNumberId,
    displayPhoneNumber,
    wabaId,
    echoCount: echoes.length,
    echoes,
  };
}

/** Unix seconds (or ms) from Meta echo timestamp → Date, else now. */
export function smbEchoTimestampToDate(timestamp: string | number | undefined): Date {
  const n = typeof timestamp === "number" ? timestamp : Number(String(timestamp || "").trim());
  if (!Number.isFinite(n) || n <= 0) return new Date();
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function isCoexistenceMetaConnection(type: string | null | undefined): boolean {
  return String(type || "").trim() === "coexistence";
}
