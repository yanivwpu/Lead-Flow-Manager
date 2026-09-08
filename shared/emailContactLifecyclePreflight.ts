import { isCrmListedContact, isEmailInboxIdentitySource } from "./contactCrmVisibility";
import { normalizeEmailAddress } from "./emailChannel";

export type EmailContactPreflightRow = {
  userId: string;
  source?: string | null;
  email?: string | null;
  tag?: string | null;
  pipelineStage?: string | null;
  notes?: string | null;
  assignedTo?: string | null;
  leadScore?: number | null;
  sourceDetails?: unknown;
  hasConversation?: boolean;
  hasContactNotes?: boolean;
  hasAppointment?: boolean;
  hasCampaignEnrollment?: boolean;
};

function isEmailSourced(row: EmailContactPreflightRow): boolean {
  const source = String(row.source || "");
  return source === "email" || source === "email_inbox";
}

function hasMeaningfulCrmActivity(row: EmailContactPreflightRow): boolean {
  const tag = String(row.tag || "").trim();
  const stage = String(row.pipelineStage || "").trim();
  const notes = String(row.notes || "").trim();
  return (
    (tag !== "" && tag !== "New") ||
    (stage !== "" && stage !== "Lead") ||
    notes.length > 0 ||
    Boolean(row.assignedTo) ||
    row.leadScore != null ||
    Boolean(row.hasContactNotes) ||
    Boolean(row.hasAppointment) ||
    Boolean(row.hasCampaignEnrollment)
  );
}

export function aggregateEmailContactLifecyclePreflight(rows: EmailContactPreflightRow[]): {
  totalContacts: number;
  emailSourcedContacts: number;
  inboxOnlyIdentities: number;
  crmListedEmailContacts: number;
  autoCreatedUntouchedEmailContacts: number;
  emailContactsWithCrmActivity: number;
  emailContactsWithActiveConversations: number;
  intraTenantDuplicateEmailGroups: number;
  intraTenantDuplicateEmailExtraRows: number;
  crossTenantDuplicateAddresses: number;
  safeInboxOnlyCandidates: number;
  ambiguousRequiresReview: number;
} {
  const emailRows = rows.filter(isEmailSourced);
  const inboxOnly = emailRows.filter((row) => !isCrmListedContact(row) || isEmailInboxIdentitySource(row.source));
  const crmEmail = emailRows.filter((row) => isCrmListedContact(row) && !isEmailInboxIdentitySource(row.source));

  let untouched = 0;
  let withActivity = 0;
  let withConversation = 0;
  for (const row of crmEmail) {
    const activity = hasMeaningfulCrmActivity(row);
    if (activity) withActivity += 1;
    else untouched += 1;
    if (row.hasConversation) withConversation += 1;
  }
  for (const row of inboxOnly) {
    if (row.hasConversation) withConversation += 1;
  }

  const byTenantEmail = new Map<string, number>();
  const emailTenants = new Map<string, Set<string>>();
  for (const row of emailRows) {
    const norm = normalizeEmailAddress(row.email || "");
    if (!norm) continue;
    const tenantKey = `${row.userId}\0${norm}`;
    byTenantEmail.set(tenantKey, (byTenantEmail.get(tenantKey) || 0) + 1);
    const tenants = emailTenants.get(norm) || new Set<string>();
    tenants.add(row.userId);
    emailTenants.set(norm, tenants);
  }

  let intraGroups = 0;
  let intraExtra = 0;
  for (const count of byTenantEmail.values()) {
    if (count > 1) {
      intraGroups += 1;
      intraExtra += count - 1;
    }
  }

  let crossTenant = 0;
  for (const tenants of emailTenants.values()) {
    if (tenants.size > 1) crossTenant += 1;
  }

  const safeCandidates = crmEmail.filter((row) => !hasMeaningfulCrmActivity(row)).length;
  const ambiguous = crmEmail.filter((row) => hasMeaningfulCrmActivity(row)).length + intraGroups;

  return {
    totalContacts: rows.length,
    emailSourcedContacts: emailRows.length,
    inboxOnlyIdentities: inboxOnly.length,
    crmListedEmailContacts: crmEmail.length,
    autoCreatedUntouchedEmailContacts: untouched,
    emailContactsWithCrmActivity: withActivity,
    emailContactsWithActiveConversations: withConversation,
    intraTenantDuplicateEmailGroups: intraGroups,
    intraTenantDuplicateEmailExtraRows: intraExtra,
    crossTenantDuplicateAddresses: crossTenant,
    safeInboxOnlyCandidates: safeCandidates,
    ambiguousRequiresReview: ambiguous,
  };
}
