/**
 * Sales Admin permanent deletion of empty unused workspaces.
 * Target is always the exact users.id. Never deletes by name or email domain.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { users, authSecurityEvents } from "@shared/schema";
import {
  emailsMatchForAdminDeletion,
  emptyAdminAccountDeletionSnapshot,
  evaluateAdminAccountDeletionPreflight,
  isAdminAccountDeletionUserId,
  type AdminAccountDeletionPreflight,
  type AdminAccountDeletionSnapshot,
} from "@shared/adminAccountDeletion";

export type AdminDeletionActor = "admin_session" | "admin_token";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadSnapshot(
  userId: string,
  dbLike: typeof db | Tx,
): Promise<AdminAccountDeletionSnapshot | null> {
  const [row] = await dbLike
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
      billingPlan: users.billingPlan,
      subscriptionStatus: users.subscriptionStatus,
      shopifyShop: users.shopifyShop,
      shopifyInstalledAt: users.shopifyInstalledAt,
      shopifyAccessToken: users.shopifyAccessToken,
      shopifyChargeId: users.shopifyChargeId,
      shopifySubscriptionStatus: users.shopifySubscriptionStatus,
      partnerId: users.partnerId,
      metaConnected: users.metaConnected,
      twilioConnected: users.twilioConnected,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;

  const counts = await dbLike.execute(sql`
    SELECT
      (SELECT count(*)::int FROM channel_settings cs WHERE cs.user_id = ${userId} AND cs.is_connected = true) AS connected_channels,
      (SELECT count(*)::int FROM channel_settings cs WHERE cs.user_id = ${userId}) AS channel_rows,
      (SELECT count(*)::int FROM integrations i WHERE i.user_id = ${userId}) AS integrations,
      (SELECT count(*)::int FROM email_mailboxes em WHERE em.workspace_user_id = ${userId}) AS mailboxes,
      (SELECT count(*)::int FROM email_mailboxes em
        WHERE em.workspace_user_id = ${userId}
          AND lower(coalesce(em.gmail_watch_status, 'not_configured')) NOT IN ('not_configured', '')) AS gmail_watches,
      (SELECT count(*)::int FROM team_members tm WHERE tm.owner_id = ${userId}) AS owned_members,
      (SELECT count(*)::int FROM team_members tm WHERE tm.member_id = ${userId}) AS member_of,
      (SELECT count(*)::int FROM contacts c WHERE c.user_id = ${userId}) AS contacts,
      (SELECT count(*)::int FROM conversations cv WHERE cv.user_id = ${userId}) AS conversations,
      (SELECT count(*)::int FROM messages m WHERE m.user_id = ${userId}) AS messages,
      (SELECT count(*)::int FROM chats ch WHERE ch.user_id = ${userId}) AS chats,
      (SELECT count(*)::int FROM workflows w WHERE w.user_id = ${userId}) AS workflows,
      (SELECT count(*)::int FROM recurring_reminders rr WHERE rr.user_id = ${userId}) AS reminders,
      (SELECT count(*)::int FROM campaign_enrollments ce WHERE ce.user_id = ${userId}) AS campaign_enrollments,
      (SELECT count(*)::int FROM preset_campaigns pc WHERE pc.user_id = ${userId}) AS preset_campaigns,
      (SELECT count(*)::int FROM drip_campaigns dc WHERE dc.user_id = ${userId}) AS drip_campaigns,
      (SELECT count(*)::int FROM chatbot_flows cf WHERE cf.user_id = ${userId}) AS chatbot_flows,
      (SELECT count(*)::int FROM user_automation_templates uat WHERE uat.user_id = ${userId}) AS automation_templates,
      (SELECT count(*)::int FROM sales_conversions sc WHERE sc.user_id = ${userId}) AS conversions,
      (SELECT count(*)::int FROM commissions co WHERE co.user_id = ${userId}) AS commissions,
      (SELECT count(*)::int FROM growth_engine_setup_tasks gest WHERE gest.user_id = ${userId}) AS ge_tasks,
      (SELECT count(*)::int FROM support_tickets st WHERE st.user_id = ${userId}) AS support_tickets,
      (SELECT count(*)::int FROM registered_phones rp WHERE rp.user_id = ${userId}) AS registered_phones,
      (SELECT count(*)::int FROM appointments ap WHERE ap.user_id = ${userId}) AS appointments,
      (SELECT count(*)::int FROM inventory_sources inv WHERE inv.user_id = ${userId}) AS inventory_sources,
      (SELECT count(*)::int FROM prospect_import_jobs pij WHERE pij.destination_user_id = ${userId}) AS prospect_jobs,
      (SELECT count(*)::int FROM ai_business_knowledge k WHERE k.user_id = ${userId}) AS knowledge,
      (SELECT count(*)::int FROM webhooks wh WHERE wh.user_id = ${userId}) AS webhooks,
      (SELECT count(*)::int FROM template_entitlements te WHERE te.user_id = ${userId}) AS template_entitlements,
      (SELECT count(*)::int FROM workspace_offers wo WHERE wo.user_id = ${userId}) AS workspace_offers,
      (
        (SELECT count(*)::int FROM ai_automations aa WHERE aa.user_id = ${userId}) +
        (SELECT count(*)::int FROM ai_subscriptions asub WHERE asub.user_id = ${userId}) +
        (SELECT count(*)::int FROM ghl_marketplace_installs gmi WHERE gmi.whachat_user_id = ${userId}) +
        (SELECT count(*)::int FROM message_templates mt WHERE mt.user_id = ${userId}) +
        (SELECT count(*)::int FROM activity_events ae WHERE ae.user_id = ${userId}) +
        (SELECT count(*)::int FROM template_installs ti WHERE ti.user_id = ${userId}) +
        (SELECT count(*)::int FROM user_template_data utd WHERE utd.user_id = ${userId}) +
        (SELECT count(*)::int FROM realtor_onboarding_submissions ros WHERE ros.user_id = ${userId}) +
        (SELECT count(*)::int FROM ai_website_knowledge_sources awks WHERE awks.user_id = ${userId}) +
        (SELECT count(*)::int FROM business_knowledge_facts bkf WHERE bkf.user_id = ${userId}) +
        (SELECT count(*)::int FROM drip_enrollments de
          INNER JOIN drip_campaigns dc ON dc.id = de.campaign_id
          WHERE dc.user_id = ${userId})
      ) AS extra_workspace,
      (SELECT count(*)::int FROM email_oauth_states eos WHERE eos.workspace_user_id = ${userId}) AS email_oauth
  `);

  const rows = (counts as { rows?: Record<string, unknown>[] }).rows;
  const c = rows?.[0];
  if (!c) {
    throw new Error("Failed to load account deletion preflight counts");
  }
  const n = (key: string) => Number(c[key] ?? 0) || 0;

  return emptyAdminAccountDeletionSnapshot({
    found: true,
    userId: row.id,
    name: row.name || "",
    email: row.email || "",
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    billingPlan: row.billingPlan,
    subscriptionStatus: row.subscriptionStatus,
    shopifyShop: row.shopifyShop,
    shopifyInstalledAt: row.shopifyInstalledAt,
    shopifyAccessToken: !!row.shopifyAccessToken,
    shopifyChargeId: !!row.shopifyChargeId,
    shopifySubscriptionStatus: row.shopifySubscriptionStatus,
    partnerId: row.partnerId,
    metaConnected: !!row.metaConnected,
    twilioConnected: !!row.twilioConnected,
    connectedChannelCount: n("connected_channels"),
    channelRowCount: n("channel_rows"),
    integrationCount: n("integrations"),
    mailboxCount: n("mailboxes") + n("email_oauth"),
    gmailWatchCount: n("gmail_watches"),
    ownedTeamMemberCount: n("owned_members"),
    memberOfTeamCount: n("member_of"),
    contactCount: n("contacts"),
    conversationCount: n("conversations"),
    messageCount: n("messages"),
    chatCount: n("chats"),
    workflowCount: n("workflows"),
    reminderCount: n("reminders"),
    campaignEnrollmentCount: n("campaign_enrollments"),
    presetCampaignCount: n("preset_campaigns"),
    dripCampaignCount: n("drip_campaigns"),
    chatbotFlowCount: n("chatbot_flows"),
    automationTemplateCount: n("automation_templates"),
    conversionCount: n("conversions"),
    commissionCount: n("commissions"),
    growthEngineTaskCount: n("ge_tasks"),
    supportTicketCount: n("support_tickets"),
    registeredPhoneCount: n("registered_phones"),
    appointmentCount: n("appointments"),
    inventorySourceCount: n("inventory_sources"),
    prospectImportJobCount: n("prospect_jobs"),
    knowledgeCount: n("knowledge"),
    webhookCount: n("webhooks"),
    templateEntitlementCount: n("template_entitlements"),
    workspaceOfferCount: n("workspace_offers"),
    extraWorkspaceRowCount: n("extra_workspace"),
  });
}

function leftoverChannelRows(snapshot: AdminAccountDeletionSnapshot): number {
  if (snapshot.connectedChannelCount > 0) return 0;
  return snapshot.channelRowCount;
}

export async function getAdminAccountDeletionPreflight(
  userId: string,
  opts?: { actorCrmUserId?: string | null },
): Promise<AdminAccountDeletionPreflight> {
  const id = String(userId || "").trim();
  if (!isAdminAccountDeletionUserId(id)) {
    return evaluateAdminAccountDeletionPreflight(null);
  }
  const snapshot = await loadSnapshot(id, db);
  if (snapshot) {
    snapshot.channelRowCount = leftoverChannelRows(snapshot);
  }
  return evaluateAdminAccountDeletionPreflight(snapshot, opts);
}

async function writeDeletionAudit(input: {
  deletedUserId: string;
  actor: AdminDeletionActor;
  outcome: "success" | "rejected";
  reasonCode: string;
  requestId?: string | null;
}): Promise<void> {
  try {
    await db.insert(authSecurityEvents).values({
      eventType: "admin_account_permanent_delete",
      userId: input.deletedUserId,
      normalizedEmail: null,
      ipAddress: null,
      userAgent: null,
      outcome: input.outcome,
      reasonCode: `${input.reasonCode};actor=${input.actor}`,
      requestId: input.requestId ?? null,
    });
  } catch (err) {
    console.warn(
      "[AdminAccountDeletion] audit log failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
  console.log(
    JSON.stringify({
      tag: "[AdminAccountDeletion]",
      event: "admin_account_permanent_delete",
      deletedUserId: input.deletedUserId,
      actor: input.actor,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      timestamp: new Date().toISOString(),
    }),
  );
}

function isRetryableTxError(err: unknown): boolean {
  const codes = new Set(["40001", "40P01"]);
  let current: unknown = err;
  for (let i = 0; i < 4 && current && typeof current === "object"; i++) {
    const code = (current as { code?: string }).code;
    if (code && codes.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export type PermanentDeleteResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string; blockers?: AdminAccountDeletionPreflight["blockers"] };

export async function permanentlyDeleteEmptyAdminAccount(input: {
  userId: string;
  emailConfirmation: string;
  actorCrmUserId?: string | null;
  actor: AdminDeletionActor;
  requestId?: string | null;
}): Promise<PermanentDeleteResult> {
  const userId = String(input.userId || "").trim();
  if (!isAdminAccountDeletionUserId(userId)) {
    return { ok: false, status: 404, error: "Account not found" };
  }

  let result: {
    ok: true;
    userId: string;
    auditReason: string;
  } | {
    ok: false;
    status: number;
    error: string;
    blockers?: AdminAccountDeletionPreflight["blockers"];
    auditReason: string;
  };

  try {
    result = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);

      const snapshot = await loadSnapshot(userId, tx);
      if (snapshot) snapshot.channelRowCount = leftoverChannelRows(snapshot);
      const preflight = evaluateAdminAccountDeletionPreflight(snapshot, {
        actorCrmUserId: input.actorCrmUserId,
      });

      if (!preflight.allowed || !snapshot) {
        return {
          ok: false as const,
          status: preflight.blockers.some((b) => b.code === "not_found") ? 404 : 409,
          error: "Account cannot be permanently deleted",
          blockers: preflight.blockers,
          auditReason: preflight.blockers[0]?.code || "blocked",
        };
      }

      if (!emailsMatchForAdminDeletion(snapshot.email, input.emailConfirmation)) {
        return {
          ok: false as const,
          status: 400,
          error: "Email confirmation does not match this account",
          auditReason: "email_mismatch",
        };
      }

      const now = new Date();
      await tx.execute(sql`
        UPDATE users
        SET
          deletion_requested_at = COALESCE(deletion_requested_at, ${now}),
          activation_email_day3_sent = true,
          activation_email_day10_sent = true,
          welcome_email_sent_at = COALESCE(welcome_email_sent_at, ${now}),
          trial_expiration_email_sent_at = COALESCE(trial_expiration_email_sent_at, ${now}),
          shopify_welcome_email_sent_at = COALESCE(shopify_welcome_email_sent_at, ${now})
        WHERE id = ${userId}
      `);

      // Exact Passport field only (sess.passport.user). Do not substring-match sess JSON.
      await tx.execute(sql`
        DELETE FROM user_sessions
        WHERE sess->'passport'->>'user' = ${userId}
      `);

      await tx.delete(users).where(eq(users.id, userId));

      return { ok: true as const, userId, auditReason: "empty_unused" };
    });
  } catch (err) {
    if (isRetryableTxError(err)) {
      await writeDeletionAudit({
        deletedUserId: userId,
        actor: input.actor,
        outcome: "rejected",
        reasonCode: "concurrent_change",
        requestId: input.requestId,
      });
      return {
        ok: false,
        status: 409,
        error: "Account state changed. Refresh and try again.",
      };
    }
    throw err;
  }

  await writeDeletionAudit({
    deletedUserId: userId,
    actor: input.actor,
    outcome: result.ok ? "success" : "rejected",
    reasonCode: result.auditReason,
    requestId: input.requestId,
  });

  if (result.ok) {
    return { ok: true, userId: result.userId };
  }
  return {
    ok: false,
    status: result.status,
    error: result.error,
    ...(result.blockers ? { blockers: result.blockers } : {}),
  };
}
