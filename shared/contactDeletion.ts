/** Max contact IDs accepted by POST /api/contacts/bulk-delete. */
export const CONTACTS_BULK_DELETE_MAX = 500;

export type ParseContactDeleteIdsResult =
  | { ok: true; ids: string[] }
  | { ok: false; code: "invalid" | "empty" | "over_limit"; count?: number };

/**
 * Dedupe, trim, and cap contact IDs for hard delete.
 * Max is applied to the unique set (duplicates do not count toward the limit).
 */
export function parseContactDeleteIds(
  input: unknown,
  max = CONTACTS_BULK_DELETE_MAX,
): ParseContactDeleteIdsResult {
  if (!Array.isArray(input)) return { ok: false, code: "invalid" };
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length === 0) return { ok: false, code: "empty" };
  if (ids.length > max) return { ok: false, code: "over_limit", count: ids.length };
  return { ok: true, ids };
}

export type ContactDeletionRiskFlags = {
  hasAppointments: boolean;
  hasActiveCampaignEnrollment: boolean;
  hasActiveFollowUp: boolean;
};

export function contactHasActiveFollowUp(contact: {
  followUpDate?: string | Date | null;
  followUp?: string | null;
}): boolean {
  if (contact.followUpDate) {
    const ms = new Date(contact.followUpDate).getTime();
    if (Number.isFinite(ms)) return true;
  }
  return typeof contact.followUp === "string" && contact.followUp.trim().length > 0;
}

/** One extra confirmation line when appointments / campaigns / follow-ups are present. */
export function describeContactDeletionExtraWarning(
  flags: ContactDeletionRiskFlags,
  mode: "single" | "bulk",
): string | null {
  const parts: string[] = [];
  if (flags.hasAppointments) parts.push("appointments");
  if (flags.hasActiveCampaignEnrollment) parts.push("an active campaign enrollment");
  if (flags.hasActiveFollowUp) parts.push("an active follow-up");
  if (parts.length === 0) return null;
  const list =
    parts.length === 1
      ? parts[0]
      : parts.length === 2
        ? `${parts[0]} and ${parts[1]}`
        : `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
  return mode === "single"
    ? `This contact also has ${list}.`
    : `Some of the selected contacts also have ${list}.`;
}
