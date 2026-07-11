import type { ProspectImportContactFilter } from "@shared/prospectImport";
import { normalizeGhlContactName, type GhlRawContact } from "./ghlApiClient";

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function maskEmail(value: string | undefined): string | undefined {
  const email = String(value || "").trim();
  if (!email || !email.includes("@")) return email || undefined;
  const [local, domain] = email.split("@");
  const maskedLocal = local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
}

function maskPhone(value: string | undefined): string | undefined {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 4) return value?.trim() || undefined;
  return `***${digits.slice(-4)}`;
}

export function sanitizeGhlContactForDiagnostics(c: GhlRawContact): Record<string, unknown> {
  return {
    externalId: c.id,
    name: normalizeGhlContactName(c),
    company: c.companyName || undefined,
    email: maskEmail(c.email),
    phone: maskPhone(c.phone),
    tags: c.tags ?? [],
    source: c.source || undefined,
    assignedTo: c.assignedTo || undefined,
    dateAdded: c.dateAdded || undefined,
    dateUpdated: c.dateUpdated || undefined,
    lastActivity: c.lastActivity || undefined,
  };
}

/** Returns the first failing filter reason, or null when the contact passes all filters. */
export function explainGhlContactFilterRejection(
  c: GhlRawContact,
  filters: ProspectImportContactFilter,
): string | null {
  const tags = (c.tags ?? []).map((t) => t.toLowerCase());
  if (filters.tags?.length) {
    const wanted = filters.tags.map((t) => t.toLowerCase());
    if (!wanted.some((t) => tags.includes(t))) {
      const contactTags = (c.tags ?? []).join(", ") || "(none)";
      return `Missing required tag. Need one of [${filters.tags.join(", ")}]; contact has [${contactTags}]`;
    }
  }

  if (filters.contactSource?.trim()) {
    const src = String(c.source || "").toLowerCase();
    const wanted = filters.contactSource.trim().toLowerCase();
    if (!src.includes(wanted)) {
      return `Contact source "${c.source || "(empty)"}" does not include "${filters.contactSource.trim()}"`;
    }
  }

  if (filters.assignedUserId?.trim() && c.assignedTo !== filters.assignedUserId.trim()) {
    return `Assigned user is "${c.assignedTo || "(unassigned)"}"; filter requires "${filters.assignedUserId.trim()}"`;
  }

  const created = parseDate(c.dateAdded);
  if (filters.createdAfter && created) {
    const after = new Date(filters.createdAfter);
    if (created < after) {
      return `Created ${c.dateAdded} is before filter createdAfter ${filters.createdAfter}`;
    }
  }
  if (filters.createdBefore && created) {
    const before = new Date(filters.createdBefore);
    if (created > before) {
      return `Created ${c.dateAdded} is after filter createdBefore ${filters.createdBefore}`;
    }
  }

  if (filters.lastActivityDays) {
    const activity = parseDate(c.lastActivity || c.dateUpdated || c.dateAdded);
    if (activity) {
      const cutoff = Date.now() - filters.lastActivityDays * 24 * 60 * 60 * 1000;
      if (activity.getTime() < cutoff) {
        const activityAt = c.lastActivity || c.dateUpdated || c.dateAdded;
        return `Last activity ${activityAt} is older than ${filters.lastActivityDays} days`;
      }
    }
  }

  const hasEmail = Boolean(String(c.email || "").trim());
  const hasPhone = Boolean(String(c.phone || "").replace(/\D/g, "").length >= 7);
  if (filters.hasBoth && !(hasEmail && hasPhone)) {
    return `Requires both email and phone; hasEmail=${hasEmail}, hasPhone=${hasPhone}`;
  }
  if (filters.hasEmail && !hasEmail) {
    return "Requires email; contact has no email";
  }
  if (filters.hasPhone && !hasPhone) {
    return "Requires phone; contact has no phone";
  }

  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    const hay = [
      normalizeGhlContactName(c),
      c.companyName,
      c.email,
      c.phone,
      ...(c.tags ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) {
      return `Search text "${filters.search.trim()}" not found in name/company/email/phone/tags`;
    }
  }

  return null;
}

export function contactPassesFilters(
  c: GhlRawContact,
  filters: ProspectImportContactFilter,
): boolean {
  return explainGhlContactFilterRejection(c, filters) === null;
}
