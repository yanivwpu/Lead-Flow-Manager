/**
 * Sales Admin permanent-delete preflight for empty unused workspaces.
 * Evaluate from a snapshot — never infer the target from name or email domain.
 */

import { isShopifySyntheticMerchantEmail } from "./shopifyBilling";

export const ADMIN_ACCOUNT_DELETION_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAdminAccountDeletionUserId(id: string): boolean {
  return ADMIN_ACCOUNT_DELETION_USER_ID_RE.test(String(id || "").trim());
}

/**
 * connect-pg-simple stores Passport's serialized CRM id at sess.passport.user.
 * Invalidation must match that field exactly — never a JSON text/substring search.
 */
export function adminDeletionSessionMatchesAuthenticatedUser(
  sess: unknown,
  userId: string,
): boolean {
  const id = String(userId || "").trim();
  if (!isAdminAccountDeletionUserId(id)) return false;
  if (!sess || typeof sess !== "object") return false;
  const passport = (sess as { passport?: unknown }).passport;
  if (!passport || typeof passport !== "object") return false;
  const stored = (passport as { user?: unknown }).user;
  return typeof stored === "string" && stored === id;
}

export function normalizeAdminDeletionEmail(email: string | null | undefined): string {
  const t = String(email || "").trim().toLowerCase();
  try {
    return t.normalize("NFKC");
  } catch {
    return t;
  }
}

export function emailsMatchForAdminDeletion(
  storedEmail: string | null | undefined,
  confirmation: string | null | undefined,
): boolean {
  const stored = normalizeAdminDeletionEmail(storedEmail);
  const given = normalizeAdminDeletionEmail(confirmation);
  return !!stored && !!given && stored === given;
}

/** Owner / demo / system identities that must never be permanently deleted from Sales Admin. */
const PROTECTED_DELETION_EMAILS = new Set([
  "yanivharamaty@gmail.com",
  "yahabegood@gmail.com",
  "demo@sales.com",
  "demo@whachat.com",
]);

export function isProtectedAdminDeletionEmail(email: string | null | undefined): boolean {
  const lower = normalizeAdminDeletionEmail(email);
  if (!lower) return true;
  if (PROTECTED_DELETION_EMAILS.has(lower)) return true;
  if (isShopifySyntheticMerchantEmail(lower)) return true;
  return false;
}

export const STRIPE_BILLING_STATUS_BLOCKERS = new Set([
  "trialing",
  "past_due",
  "paused",
  "unpaid",
  "incomplete",
  "incomplete_expired",
]);

export type AdminAccountDeletionBlockerCode =
  | "not_found"
  | "protected_account"
  | "current_admin_identity"
  | "stripe_billing"
  | "shopify_installation"
  | "connected_channels"
  | "email_mailbox"
  | "team_memberships"
  | "contacts_or_conversations"
  | "automations_or_campaigns"
  | "sales_or_payouts"
  | "workspace_data";

export type AdminAccountDeletionBlocker = {
  code: AdminAccountDeletionBlockerCode;
  label: string;
  count?: number;
};

export const ADMIN_ACCOUNT_DELETION_BLOCKER_LABELS: Record<AdminAccountDeletionBlockerCode, string> = {
  not_found: "Account not found",
  protected_account: "This is a protected or system account and cannot be deleted",
  current_admin_identity: "You cannot delete the currently signed-in account",
  stripe_billing: "Stripe customer or subscription is present",
  shopify_installation: "Shopify shop, installation, or synthetic identity is present",
  connected_channels: "Connected messaging channels or integrations",
  email_mailbox: "Email mailbox or Gmail watch is present",
  team_memberships: "Team members or invitations are present",
  contacts_or_conversations: "Contacts, conversations, or messages are present",
  automations_or_campaigns: "Workflows, campaigns, enrollments, or automations are present",
  sales_or_payouts: "Sales conversions, commissions, partner, or payout records are present",
  workspace_data: "Other workspace-owned data is present and must not be cascaded",
};

export type AdminAccountDeletionSnapshot = {
  found: boolean;
  userId: string;
  name: string;
  email: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingPlan: string | null;
  subscriptionStatus: string | null;
  shopifyShop: string | null;
  shopifyInstalledAt: Date | string | null;
  shopifyAccessToken: boolean;
  shopifyChargeId: boolean;
  shopifySubscriptionStatus: string | null;
  partnerId: string | null;
  metaConnected: boolean;
  twilioConnected: boolean;
  connectedChannelCount: number;
  channelRowCount: number;
  integrationCount: number;
  mailboxCount: number;
  gmailWatchCount: number;
  ownedTeamMemberCount: number;
  memberOfTeamCount: number;
  contactCount: number;
  conversationCount: number;
  messageCount: number;
  chatCount: number;
  workflowCount: number;
  reminderCount: number;
  campaignEnrollmentCount: number;
  presetCampaignCount: number;
  dripCampaignCount: number;
  chatbotFlowCount: number;
  automationTemplateCount: number;
  conversionCount: number;
  commissionCount: number;
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
  /** Additional owned rows (GHL installs, templates, knowledge facts, etc.). */
  extraWorkspaceRowCount: number;
};

export type AdminAccountDeletionPreflight = {
  allowed: boolean;
  userId: string | null;
  name: string | null;
  email: string | null;
  blockers: AdminAccountDeletionBlocker[];
};

function blocker(
  code: AdminAccountDeletionBlockerCode,
  count?: number,
): AdminAccountDeletionBlocker {
  return {
    code,
    label: ADMIN_ACCOUNT_DELETION_BLOCKER_LABELS[code],
    ...(typeof count === "number" ? { count } : {}),
  };
}

/** True when Stripe customer/subscription state is present. Default free + status "active" is not a live subscription. */
export function hasStripeBillingDeletionBlocker(input: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  billingPlan?: string | null;
  subscriptionStatus?: string | null;
}): boolean {
  if (String(input.stripeCustomerId || "").trim()) return true;
  if (String(input.stripeSubscriptionId || "").trim()) return true;
  const plan = String(input.billingPlan || "free").trim().toLowerCase();
  if (plan && plan !== "free") return true;
  const status = String(input.subscriptionStatus || "").trim().toLowerCase();
  return STRIPE_BILLING_STATUS_BLOCKERS.has(status);
}

export function hasShopifyInstallationDeletionBlocker(input: {
  email?: string | null;
  shopifyShop?: string | null;
  shopifyInstalledAt?: Date | string | null;
  shopifyAccessToken?: boolean;
  shopifyChargeId?: boolean;
  shopifySubscriptionStatus?: string | null;
}): boolean {
  if (isShopifySyntheticMerchantEmail(input.email)) return true;
  if (String(input.shopifyShop || "").trim()) return true;
  if (input.shopifyInstalledAt) return true;
  if (input.shopifyAccessToken) return true;
  if (input.shopifyChargeId) return true;
  if (String(input.shopifySubscriptionStatus || "").trim()) return true;
  return false;
}

export function evaluateAdminAccountDeletionPreflight(
  snapshot: AdminAccountDeletionSnapshot | null,
  opts?: { actorCrmUserId?: string | null },
): AdminAccountDeletionPreflight {
  if (!snapshot || !snapshot.found) {
    return {
      allowed: false,
      userId: snapshot?.userId ?? null,
      name: null,
      email: null,
      blockers: [blocker("not_found")],
    };
  }

  const blockers: AdminAccountDeletionBlocker[] = [];
  const actorId = String(opts?.actorCrmUserId || "").trim();

  if (isProtectedAdminDeletionEmail(snapshot.email)) {
    blockers.push(blocker("protected_account"));
  }
  if (actorId && actorId === snapshot.userId) {
    blockers.push(blocker("current_admin_identity"));
  }
  if (hasStripeBillingDeletionBlocker(snapshot)) {
    blockers.push(blocker("stripe_billing"));
  }
  if (hasShopifyInstallationDeletionBlocker(snapshot)) {
    blockers.push(blocker("shopify_installation"));
  }

  const connected =
    snapshot.connectedChannelCount +
    snapshot.integrationCount +
    (snapshot.metaConnected ? 1 : 0) +
    (snapshot.twilioConnected ? 1 : 0);
  if (connected > 0) {
    blockers.push(blocker("connected_channels", connected));
  }

  const mailbox = snapshot.mailboxCount + snapshot.gmailWatchCount;
  if (mailbox > 0) {
    blockers.push(blocker("email_mailbox", mailbox));
  }

  const team = snapshot.ownedTeamMemberCount + snapshot.memberOfTeamCount;
  if (team > 0) {
    blockers.push(blocker("team_memberships", team));
  }

  const crm =
    snapshot.contactCount +
    snapshot.conversationCount +
    snapshot.messageCount +
    snapshot.chatCount;
  if (crm > 0) {
    blockers.push(blocker("contacts_or_conversations", crm));
  }

  const automations =
    snapshot.workflowCount +
    snapshot.reminderCount +
    snapshot.campaignEnrollmentCount +
    snapshot.presetCampaignCount +
    snapshot.dripCampaignCount +
    snapshot.chatbotFlowCount +
    snapshot.automationTemplateCount;
  if (automations > 0) {
    blockers.push(blocker("automations_or_campaigns", automations));
  }

  const sales =
    snapshot.conversionCount +
    snapshot.commissionCount +
    snapshot.growthEngineTaskCount +
    (snapshot.partnerId ? 1 : 0);
  if (sales > 0) {
    blockers.push(blocker("sales_or_payouts", sales));
  }

  const workspace =
    snapshot.channelRowCount +
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
  if (workspace > 0) {
    blockers.push(blocker("workspace_data", workspace));
  }

  return {
    allowed: blockers.length === 0,
    userId: snapshot.userId,
    name: snapshot.name,
    email: snapshot.email,
    blockers,
  };
}

export function emptyAdminAccountDeletionSnapshot(
  overrides: Partial<AdminAccountDeletionSnapshot> & Pick<AdminAccountDeletionSnapshot, "userId" | "email" | "name">,
): AdminAccountDeletionSnapshot {
  return {
    found: true,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    billingPlan: "free",
    subscriptionStatus: "active",
    shopifyShop: null,
    shopifyInstalledAt: null,
    shopifyAccessToken: false,
    shopifyChargeId: false,
    shopifySubscriptionStatus: null,
    partnerId: null,
    metaConnected: false,
    twilioConnected: false,
    connectedChannelCount: 0,
    channelRowCount: 0,
    integrationCount: 0,
    mailboxCount: 0,
    gmailWatchCount: 0,
    ownedTeamMemberCount: 0,
    memberOfTeamCount: 0,
    contactCount: 0,
    conversationCount: 0,
    messageCount: 0,
    chatCount: 0,
    workflowCount: 0,
    reminderCount: 0,
    campaignEnrollmentCount: 0,
    presetCampaignCount: 0,
    dripCampaignCount: 0,
    chatbotFlowCount: 0,
    automationTemplateCount: 0,
    conversionCount: 0,
    commissionCount: 0,
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
