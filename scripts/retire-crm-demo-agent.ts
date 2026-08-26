/**
 * Guarded one-time cleanup of the retired CRM Demo Agent workspace.
 *
 * DO NOT RUN WITH --execute UNTIL ALL OF THE FOLLOWING ARE DONE:
 *  1. Deploy the code that removes public demo login and automatic recreation.
 *  2. Verify the former public CRM demo login is rejected.
 *  3. Run this script in preflight/dry-run mode (default).
 *  4. Review the exact printed records.
 *  5. Get separate approval.
 *  6. Execute only with --execute AND RETIRED_CRM_DEMO_CLEANUP_EXECUTE=1.
 *  7. Confirm the account is gone and cannot be recreated.
 *
 * Usage (dry-run / preflight — default):
 *   npx tsx scripts/retire-crm-demo-agent.ts --user-id=<uuid> --email=demo@whachat.com
 *
 * Execute (after approval):
 *   RETIRED_CRM_DEMO_CLEANUP_EXECUTE=1 npx tsx scripts/retire-crm-demo-agent.ts --user-id=<uuid> --email=demo@whachat.com --execute
 *
 * Never selects by name, domain, or email alone. Contains no credentials.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { authSecurityEvents, chats, contacts, users } from "../shared/schema";
import {
  RETIRED_CRM_DEMO_CLEANUP_EXECUTE_ENV,
  RETIRED_CRM_DEMO_USER_ID,
  evaluateRetiredCrmDemoCleanupPreflight,
  executeCleanupConfirmed,
  parseRetiredCrmDemoCleanupCli,
  type RetiredCrmDemoCleanupSnapshot,
} from "../shared/retiredCrmDemoAgentCleanup";
import { RETIRED_CRM_DEMO_EMAIL } from "../shared/retiredCrmDemoAgent";

function dbHostLabel(): string {
  const url = process.env.DATABASE_URL || "";
  try {
    const u = new URL(url.replace(/^postgres:/, "postgresql:"));
    return `${u.hostname}/${(u.pathname || "").replace(/^\//, "")}`;
  } catch {
    return "(unparsed DATABASE_URL)";
  }
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  const r = result as { rows?: Record<string, unknown>[] } | Record<string, unknown>[];
  if (Array.isArray(r)) return r;
  return r.rows ?? [];
}

function n(row: Record<string, unknown>, key: string): number {
  return Number(row[key] ?? 0) || 0;
}

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadSnapshot(
  userId: string,
  dbLike: DbLike = db,
): Promise<RetiredCrmDemoCleanupSnapshot | null> {
  const [row] = await dbLike
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
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

  const countsResult = await dbLike.execute(sql`
    SELECT
      (SELECT count(*)::int FROM channel_settings cs WHERE cs.user_id = ${userId} AND cs.is_connected = true) AS connected_channels,
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
      (SELECT count(*)::int FROM messages m WHERE m.user_id = ${userId} AND m.external_message_id IS NOT NULL) AS messages_with_external_id,
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
      ) AS extra_workspace
  `);
  const c = rowsOf(countsResult)[0] || {};

  const contactRows = await dbLike
    .select({ name: contacts.name })
    .from(contacts)
    .where(eq(contacts.userId, userId));
  const chatRows = await dbLike
    .select({ name: chats.name })
    .from(chats)
    .where(eq(chats.userId, userId));

  return {
    found: true,
    userId: row.id,
    name: row.name || "",
    email: row.email || "",
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    shopifyShop: row.shopifyShop,
    shopifyInstalledAt: row.shopifyInstalledAt,
    shopifyAccessToken: !!row.shopifyAccessToken,
    shopifyChargeId: !!row.shopifyChargeId,
    shopifySubscriptionStatus: row.shopifySubscriptionStatus,
    partnerId: row.partnerId,
    metaConnected: !!row.metaConnected,
    twilioConnected: !!row.twilioConnected,
    connectedChannelCount: n(c, "connected_channels"),
    integrationCount: n(c, "integrations"),
    mailboxCount: n(c, "mailboxes"),
    gmailWatchCount: n(c, "gmail_watches"),
    ownedTeamMemberCount: n(c, "owned_members"),
    memberOfTeamCount: n(c, "member_of"),
    contactCount: n(c, "contacts"),
    conversationCount: n(c, "conversations"),
    messageCount: n(c, "messages"),
    chatCount: n(c, "chats"),
    messagesWithExternalId: n(c, "messages_with_external_id"),
    contactNames: contactRows.map((r) => r.name),
    chatNames: chatRows.map((r) => r.name),
    conversionCount: n(c, "conversions"),
    commissionCount: n(c, "commissions"),
    workflowCount: n(c, "workflows"),
    reminderCount: n(c, "reminders"),
    campaignEnrollmentCount: n(c, "campaign_enrollments"),
    presetCampaignCount: n(c, "preset_campaigns"),
    dripCampaignCount: n(c, "drip_campaigns"),
    chatbotFlowCount: n(c, "chatbot_flows"),
    automationTemplateCount: n(c, "automation_templates"),
    growthEngineTaskCount: n(c, "ge_tasks"),
    supportTicketCount: n(c, "support_tickets"),
    registeredPhoneCount: n(c, "registered_phones"),
    appointmentCount: n(c, "appointments"),
    inventorySourceCount: n(c, "inventory_sources"),
    prospectImportJobCount: n(c, "prospect_jobs"),
    knowledgeCount: n(c, "knowledge"),
    webhookCount: n(c, "webhooks"),
    templateEntitlementCount: n(c, "template_entitlements"),
    workspaceOfferCount: n(c, "workspace_offers"),
    extraWorkspaceRowCount: n(c, "extra_workspace"),
  };
}

async function writeAudit(input: {
  deletedUserId: string;
  outcome: "success" | "rejected";
  reasonCode: string;
}): Promise<void> {
  try {
    await db.insert(authSecurityEvents).values({
      eventType: "retired_crm_demo_agent_cleanup",
      userId: input.deletedUserId,
      normalizedEmail: null,
      ipAddress: null,
      userAgent: null,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      requestId: null,
    });
  } catch (err) {
    console.warn(
      "[retire-crm-demo-agent] audit log failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function main() {
  const parsed = parseRetiredCrmDemoCleanupCli(process.argv.slice(2));
  console.log(
    JSON.stringify(
      {
        mode: parsed.execute ? "execute" : "dry-run",
        dbHost: dbHostLabel(),
        requiredUserId: RETIRED_CRM_DEMO_USER_ID,
        requiredEmail: RETIRED_CRM_DEMO_EMAIL,
        cli: {
          userId: parsed.userId,
          email: parsed.email,
          execute: parsed.execute,
          errors: parsed.errors,
        },
      },
      null,
      2,
    ),
  );

  if (parsed.errors.length > 0 || !parsed.userId || !parsed.email) {
    process.exit(1);
  }

  if (parsed.execute && !executeCleanupConfirmed()) {
    console.error(
      JSON.stringify({
        refused: true,
        reason: `Set ${RETIRED_CRM_DEMO_CLEANUP_EXECUTE_ENV}=1 to execute. Default is dry-run.`,
      }),
    );
    process.exit(1);
  }

  const snapshot = await loadSnapshot(parsed.userId);
  const preflight = evaluateRetiredCrmDemoCleanupPreflight(snapshot, {
    emailConfirmation: parsed.email,
  });

  console.log(
    JSON.stringify(
      {
        preflight,
        contactNames: snapshot?.contactNames ?? [],
        chatNames: snapshot?.chatNames ?? [],
        stripeCustomerIdPresent: !!snapshot?.stripeCustomerId,
        stripeSubscriptionIdPresent: !!snapshot?.stripeSubscriptionId,
        shopifyPresent: !!(
          snapshot?.shopifyShop ||
          snapshot?.shopifyInstalledAt ||
          snapshot?.shopifyAccessToken ||
          snapshot?.shopifyChargeId ||
          snapshot?.shopifySubscriptionStatus
        ),
      },
      null,
      2,
    ),
  );

  if (!parsed.execute) {
    console.log("Dry-run complete. No rows deleted.");
    process.exit(preflight.allowed ? 0 : 2);
  }

  if (!preflight.allowed || !snapshot) {
    await writeAudit({
      deletedUserId: parsed.userId,
      outcome: "rejected",
      reasonCode: preflight.blockers[0]?.code || "blocked",
    });
    process.exit(2);
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    await tx.execute(sql`SELECT id FROM users WHERE id = ${parsed.userId} FOR UPDATE`);

    const locked = await loadSnapshot(parsed.userId, tx);
    const lockedPreflight = evaluateRetiredCrmDemoCleanupPreflight(locked, {
      emailConfirmation: parsed.email,
    });
    if (!lockedPreflight.allowed || !locked) {
      throw new Error(`Cleanup refused after lock: ${lockedPreflight.blockers[0]?.code || "blocked"}`);
    }

    const now = new Date();
    await tx.execute(sql`
      UPDATE users
      SET
        deletion_requested_at = COALESCE(deletion_requested_at, ${now}),
        activation_email_day3_sent = true,
        activation_email_day10_sent = true,
        welcome_email_sent_at = COALESCE(welcome_email_sent_at, ${now}),
        trial_expiration_email_sent_at = COALESCE(trial_expiration_email_sent_at, ${now})
      WHERE id = ${parsed.userId}
    `);

    await tx.execute(sql`
      DELETE FROM user_sessions
      WHERE sess->'passport'->>'user' = ${parsed.userId}
    `);

    await tx.delete(users).where(eq(users.id, parsed.userId!));
  });

  await writeAudit({
    deletedUserId: parsed.userId,
    outcome: "success",
    reasonCode: "retired_fixture_only",
  });

  console.log(JSON.stringify({ deleted: true, userId: parsed.userId }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
