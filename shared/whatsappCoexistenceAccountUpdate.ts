/**
 * Safe parsing of WhatsApp Cloud API account_update webhook changes
 * that indicate a Coexistence companion may no longer be operational.
 *
 * Only maps clearly documented / commonly observed event labels.
 * Unknown shapes return null — callers must not guess.
 */

export type MetaWhatsappAccountUpdateEvent = {
  wabaId: string | null;
  phoneNumberId: string | null;
  /** Raw Meta event string when present (sanitized length). */
  event: string | null;
  /**
   * Supported actionable kinds only.
   * Unknown Meta payloads stay unsupported (manual / polling recovery).
   */
  kind: "partner_removed" | "account_violation" | "disabled_update";
};

const PARTNER_REMOVED = new Set([
  "PARTNER_REMOVED",
  "PARTNER_APP_UNINSTALLED",
  "APP_UNINSTALLED",
]);

const ACCOUNT_VIOLATION = new Set([
  "ACCOUNT_VIOLATION",
  "ACCOUNT_DELETED",
  "DISABLED_UPDATE",
]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickEventLabel(value: Record<string, unknown>): string | null {
  const direct = value.event ?? value.event_type ?? value.type;
  if (typeof direct === "string" && direct.trim()) return direct.trim().slice(0, 80);
  const ban = asRecord(value.ban_info);
  if (ban && typeof ban.waba_ban_state === "string") return ban.waba_ban_state.trim().slice(0, 80);
  return null;
}

function classifyEvent(label: string | null): MetaWhatsappAccountUpdateEvent["kind"] | null {
  if (!label) return null;
  const upper = label.toUpperCase();
  if (PARTNER_REMOVED.has(upper) || /PARTNER.?REMOVED|APP.?UNINSTALL/i.test(upper)) {
    return "partner_removed";
  }
  if (ACCOUNT_VIOLATION.has(upper) || /ACCOUNT_VIOLATION|ACCOUNT_DELETED|DISABLED/i.test(upper)) {
    return "account_violation";
  }
  if (/DISABLE/i.test(upper)) return "disabled_update";
  return null;
}

/**
 * Extract the first actionable WhatsApp account_update from a Meta webhook body.
 * Returns null when the payload is not a supported offboarding/invalidation signal.
 */
export function parseMetaWhatsappAccountUpdate(body: unknown): MetaWhatsappAccountUpdateEvent | null {
  const root = asRecord(body);
  if (!root) return null;
  if (root.object !== "whatsapp_business_account") return null;
  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const ent of entries) {
    const entry = asRecord(ent);
    if (!entry) continue;
    const wabaId = typeof entry.id === "string" ? entry.id.trim() : null;
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const ch of changes) {
      const change = asRecord(ch);
      if (!change) continue;
      if (String(change.field || "") !== "account_update") continue;
      const value = asRecord(change.value) || {};
      const event = pickEventLabel(value);
      const kind = classifyEvent(event);
      if (!kind) continue;
      const phoneNumberId =
        typeof value.phone_number_id === "string"
          ? value.phone_number_id.trim()
          : typeof asRecord(value.metadata)?.phone_number_id === "string"
            ? String(asRecord(value.metadata)!.phone_number_id).trim()
            : null;
      return {
        wabaId,
        phoneNumberId: phoneNumberId || null,
        event,
        kind,
      };
    }
  }
  return null;
}
