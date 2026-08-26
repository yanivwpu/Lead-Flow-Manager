/**
 * Guarded one-time cleanup of the retired CRM Demo Agent workspace.
 * Evaluates a snapshot — never infers the target from name or email domain.
 */
import {
  RETIRED_CRM_DEMO_EMAIL,
  isRetiredCrmDemoEmail,
  normalizeRetiredCrmDemoEmail,
} from "./retiredCrmDemoAgent";
import { isAdminAccountDeletionUserId } from "./adminAccountDeletion";

/** Exact leftover workspace id. Cleanup must require this UUID; never look up by email alone. */
export const RETIRED_CRM_DEMO_USER_ID = "3ddbdb72-4097-4337-b583-c7080d055e85";

export const RETIRED_CRM_DEMO_DISPLAY_NAME = "Demo Agent";

export const RETIRED_CRM_DEMO_FIXTURE_CONTACT_NAMES = [
  "Sarah Johnson",
  "Michael Chen",
  "Emma Williams",
  "David Martinez",
  "Lisa Thompson",
  "James Wilson",
  "Rachel Green",
] as const;

export const RETIRED_CRM_DEMO_FIXTURE_CHAT_NAMES = [
  "Sarah Johnson",
  "Lisa Thompson",
  "David Martinez",
] as const;

export const RETIRED_CRM_DEMO_EXPECTED_COUNTS = {
  contacts: 7,
  conversations: 8,
  messages: 33,
  chats: 3,
  messagesWithExternalId: 0,
} as const;

export const RETIRED_CRM_DEMO_CLEANUP_EXECUTE_ENV = "RETIRED_CRM_DEMO_CLEANUP_EXECUTE";

export type RetiredCrmDemoCleanupBlockerCode =
  | "missing_cli_identity"
  | "cli_identity_mismatch"
  | "not_found"
  | "email_mismatch"
  | "name_mismatch"
  | "stripe_present"
  | "shopify_present"
  | "connected_channels"
  | "mailbox"
  | "team"
  | "sales_or_partner"
  | "unexpected_workspace"
  | "fixture_mismatch"
  | "execute_not_confirmed";

export type RetiredCrmDemoCleanupBlocker = {
  code: RetiredCrmDemoCleanupBlockerCode;
  label: string;
};

export type RetiredCrmDemoCleanupSnapshot = {
  found: boolean;
  userId: string;
  name: string;
  email: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  shopifyShop: string | null;
  shopifyInstalledAt: Date | string | null;
  shopifyAccessToken: boolean;
  shopifyChargeId: boolean;
  shopifySubscriptionStatus: string | null;
  partnerId: string | null;
  metaConnected: boolean;
  twilioConnected: boolean;
  connectedChannelCount: number;
  integrationCount: number;
  mailboxCount: number;
  gmailWatchCount: number;
  ownedTeamMemberCount: number;
  memberOfTeamCount: number;
  contactCount: number;
  conversationCount: number;
  messageCount: number;
  chatCount: number;
  messagesWithExternalId: number;
  contactNames: string[];
  chatNames: string[];
  conversionCount: number;
  commissionCount: number;
  workflowCount: number;
  reminderCount: number;
  campaignEnrollmentCount: number;
  presetCampaignCount: number;
  dripCampaignCount: number;
  chatbotFlowCount: number;
  automationTemplateCount: number;
  growthEngineTaskCount: number;
  supportTicketCount: number;
  registeredPhoneCount: number;
  appointmentCount: number;
  inventorySourceCount: number;
  prospectImportJobCount: number;
  knowledgeCount: number;
  webhookCount: number;
  templateEntitlementCount: number;
  workspaceOfferCount: number;
  extraWorkspaceRowCount: number;
};

export type RetiredCrmDemoCleanupPreflight = {
  allowed: boolean;
  userId: string | null;
  email: string | null;
  blockers: RetiredCrmDemoCleanupBlocker[];
  counts: {
    contacts: number;
    conversations: number;
    messages: number;
    chats: number;
    messagesWithExternalId: number;
  } | null;
};

export type RetiredCrmDemoCleanupCli = {
  userId: string | null;
  email: string | null;
  execute: boolean;
  errors: string[];
};

function blocker(code: RetiredCrmDemoCleanupBlockerCode, label: string): RetiredCrmDemoCleanupBlocker {
  return { code, label };
}

function sortedUnique(names: string[]): string[] {
  return [...new Set(names.map((n) => String(n || "").trim()).filter(Boolean))].sort();
}

function sameNameSet(actual: string[], expected: readonly string[]): boolean {
  const a = sortedUnique(actual);
  const e = [...expected].sort();
  if (a.length !== e.length) return false;
  return a.every((name, i) => name === e[i]);
}

export function parseRetiredCrmDemoCleanupCli(argv: string[]): RetiredCrmDemoCleanupCli {
  const errors: string[] = [];
  let userId: string | null = null;
  let email: string | null = null;
  let execute = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--execute") {
      execute = true;
      continue;
    }
    if (arg === "--user-id" && argv[i + 1]) {
      userId = String(argv[++i]).trim();
      continue;
    }
    if (arg.startsWith("--user-id=")) {
      userId = arg.slice("--user-id=".length).trim();
      continue;
    }
    if (arg === "--email" && argv[i + 1]) {
      email = String(argv[++i]).trim();
      continue;
    }
    if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length).trim();
      continue;
    }
  }

  if (!userId || !email) {
    errors.push("Both --user-id and --email are required. Never select by name or email alone.");
  }
  if (userId && !isAdminAccountDeletionUserId(userId)) {
    errors.push("user-id must be an exact UUID.");
  }
  if (userId && userId !== RETIRED_CRM_DEMO_USER_ID) {
    errors.push("user-id does not match the retired CRM Demo Agent workspace.");
  }
  if (email && !isRetiredCrmDemoEmail(email)) {
    errors.push("email does not match the retired CRM Demo Agent identity.");
  }

  return { userId, email: email ? normalizeRetiredCrmDemoEmail(email) : null, execute, errors };
}

export function executeCleanupConfirmed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[RETIRED_CRM_DEMO_CLEANUP_EXECUTE_ENV] === "1";
}

export function emptyRetiredCrmDemoCleanupSnapshot(
  overrides: Partial<RetiredCrmDemoCleanupSnapshot> &
    Pick<RetiredCrmDemoCleanupSnapshot, "userId" | "email" | "name">,
): RetiredCrmDemoCleanupSnapshot {
  return {
    found: true,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    shopifyShop: null,
    shopifyInstalledAt: null,
    shopifyAccessToken: false,
    shopifyChargeId: false,
    shopifySubscriptionStatus: null,
    partnerId: null,
    metaConnected: false,
    twilioConnected: false,
    connectedChannelCount: 0,
    integrationCount: 0,
    mailboxCount: 0,
    gmailWatchCount: 0,
    ownedTeamMemberCount: 0,
    memberOfTeamCount: 0,
    contactCount: 0,
    conversationCount: 0,
    messageCount: 0,
    chatCount: 0,
    messagesWithExternalId: 0,
    contactNames: [],
    chatNames: [],
    conversionCount: 0,
    commissionCount: 0,
    workflowCount: 0,
    reminderCount: 0,
    campaignEnrollmentCount: 0,
    presetCampaignCount: 0,
    dripCampaignCount: 0,
    chatbotFlowCount: 0,
    automationTemplateCount: 0,
    growthEngineTaskCount: 0,
    supportTicketCount: 0,
    registeredPhoneCount: 0,
    appointmentCount: 0,
    inventorySourceCount: 0,
    prospectImportJobCount: 0,
    knowledgeCount: 0,
    webhookCount: 0,
    templateEntitlementCount: 0,
    workspaceOfferCount: 0,
    extraWorkspaceRowCount: 0,
    ...overrides,
  };
}

function qualifyingFixtureSnapshot(snapshot: RetiredCrmDemoCleanupSnapshot): boolean {
  if (snapshot.userId !== RETIRED_CRM_DEMO_USER_ID) return false;
  if (!isRetiredCrmDemoEmail(snapshot.email)) return false;
  if (String(snapshot.name || "").trim() !== RETIRED_CRM_DEMO_DISPLAY_NAME) return false;
  if (snapshot.contactCount !== RETIRED_CRM_DEMO_EXPECTED_COUNTS.contacts) return false;
  if (snapshot.conversationCount !== RETIRED_CRM_DEMO_EXPECTED_COUNTS.conversations) return false;
  if (snapshot.messageCount !== RETIRED_CRM_DEMO_EXPECTED_COUNTS.messages) return false;
  if (snapshot.chatCount !== RETIRED_CRM_DEMO_EXPECTED_COUNTS.chats) return false;
  if (snapshot.messagesWithExternalId !== RETIRED_CRM_DEMO_EXPECTED_COUNTS.messagesWithExternalId) {
    return false;
  }
  if (!sameNameSet(snapshot.contactNames, RETIRED_CRM_DEMO_FIXTURE_CONTACT_NAMES)) return false;
  if (!sameNameSet(snapshot.chatNames, RETIRED_CRM_DEMO_FIXTURE_CHAT_NAMES)) return false;
  return true;
}

export function evaluateRetiredCrmDemoCleanupPreflight(
  snapshot: RetiredCrmDemoCleanupSnapshot | null,
  opts?: { emailConfirmation?: string | null },
): RetiredCrmDemoCleanupPreflight {
  if (!snapshot || !snapshot.found) {
    return {
      allowed: false,
      userId: snapshot?.userId ?? null,
      email: null,
      blockers: [blocker("not_found", "Retired CRM Demo Agent account was not found")],
      counts: null,
    };
  }

  const blockers: RetiredCrmDemoCleanupBlocker[] = [];
  const confirmation = opts?.emailConfirmation;

  if (snapshot.userId !== RETIRED_CRM_DEMO_USER_ID) {
    blockers.push(blocker("cli_identity_mismatch", "User id is not the retired CRM Demo Agent workspace"));
  }
  if (confirmation != null && normalizeRetiredCrmDemoEmail(confirmation) !== RETIRED_CRM_DEMO_EMAIL) {
    blockers.push(blocker("cli_identity_mismatch", "Email confirmation is not the retired CRM Demo Agent identity"));
  }
  if (!isRetiredCrmDemoEmail(snapshot.email) || (confirmation != null && !isRetiredCrmDemoEmail(confirmation))) {
    blockers.push(blocker("email_mismatch", "Stored email does not match the retired CRM Demo Agent identity"));
  }
  if (confirmation != null && normalizeRetiredCrmDemoEmail(snapshot.email) !== normalizeRetiredCrmDemoEmail(confirmation)) {
    blockers.push(blocker("email_mismatch", "Email confirmation does not match the stored account"));
  }
  if (String(snapshot.name || "").trim() !== RETIRED_CRM_DEMO_DISPLAY_NAME) {
    blockers.push(blocker("name_mismatch", "Stored name is not the retired Demo Agent fixture identity"));
  }

  if (String(snapshot.stripeCustomerId || "").trim() || String(snapshot.stripeSubscriptionId || "").trim()) {
    blockers.push(blocker("stripe_present", "Stripe customer or subscription id is present"));
  }
  if (
    String(snapshot.shopifyShop || "").trim() ||
    snapshot.shopifyInstalledAt ||
    snapshot.shopifyAccessToken ||
    snapshot.shopifyChargeId ||
    String(snapshot.shopifySubscriptionStatus || "").trim()
  ) {
    blockers.push(blocker("shopify_present", "Shopify installation is present"));
  }

  const connected =
    snapshot.connectedChannelCount +
    snapshot.integrationCount +
    (snapshot.metaConnected ? 1 : 0) +
    (snapshot.twilioConnected ? 1 : 0);
  if (connected > 0) {
    blockers.push(blocker("connected_channels", "Connected channels or integrations are present"));
  }
  if (snapshot.mailboxCount + snapshot.gmailWatchCount > 0) {
    blockers.push(blocker("mailbox", "Email mailbox or Gmail watch is present"));
  }
  if (snapshot.ownedTeamMemberCount + snapshot.memberOfTeamCount > 0) {
    blockers.push(blocker("team", "Team members are present"));
  }
  if (snapshot.conversionCount + snapshot.commissionCount + (snapshot.partnerId ? 1 : 0) > 0) {
    blockers.push(blocker("sales_or_partner", "Sales conversions, commissions, or partner attribution are present"));
  }

  const unexpectedWorkspace =
    snapshot.workflowCount +
    snapshot.reminderCount +
    snapshot.campaignEnrollmentCount +
    snapshot.presetCampaignCount +
    snapshot.dripCampaignCount +
    snapshot.chatbotFlowCount +
    snapshot.automationTemplateCount +
    snapshot.growthEngineTaskCount +
    snapshot.supportTicketCount +
    snapshot.registeredPhoneCount +
    snapshot.appointmentCount +
    snapshot.inventorySourceCount +
    snapshot.prospectImportJobCount +
    snapshot.knowledgeCount +
    snapshot.webhookCount +
    snapshot.templateEntitlementCount +
    snapshot.workspaceOfferCount +
    snapshot.extraWorkspaceRowCount;
  if (unexpectedWorkspace > 0) {
    blockers.push(blocker("unexpected_workspace", "Unexpected workspace-owned data is present"));
  }

  if (!qualifyingFixtureSnapshot(snapshot)) {
    blockers.push(
      blocker(
        "fixture_mismatch",
        "CRM rows do not match the audited Demo Agent fixtures (7 contacts, 8 conversations, 33 messages with no provider ids, 3 legacy chats)",
      ),
    );
  }

  const unique = [...new Map(blockers.map((b) => [b.code + b.label, b])).values()];

  return {
    allowed: unique.length === 0,
    userId: snapshot.userId,
    email: snapshot.email,
    blockers: unique,
    counts: {
      contacts: snapshot.contactCount,
      conversations: snapshot.conversationCount,
      messages: snapshot.messageCount,
      chats: snapshot.chatCount,
      messagesWithExternalId: snapshot.messagesWithExternalId,
    },
  };
}

export function qualifyingRetiredCrmDemoFixtureSnapshot(
  overrides: Partial<RetiredCrmDemoCleanupSnapshot> = {},
): RetiredCrmDemoCleanupSnapshot {
  return emptyRetiredCrmDemoCleanupSnapshot({
    userId: RETIRED_CRM_DEMO_USER_ID,
    email: RETIRED_CRM_DEMO_EMAIL,
    name: RETIRED_CRM_DEMO_DISPLAY_NAME,
    contactCount: RETIRED_CRM_DEMO_EXPECTED_COUNTS.contacts,
    conversationCount: RETIRED_CRM_DEMO_EXPECTED_COUNTS.conversations,
    messageCount: RETIRED_CRM_DEMO_EXPECTED_COUNTS.messages,
    chatCount: RETIRED_CRM_DEMO_EXPECTED_COUNTS.chats,
    messagesWithExternalId: 0,
    contactNames: [...RETIRED_CRM_DEMO_FIXTURE_CONTACT_NAMES],
    chatNames: [...RETIRED_CRM_DEMO_FIXTURE_CHAT_NAMES],
    ...overrides,
  });
}
