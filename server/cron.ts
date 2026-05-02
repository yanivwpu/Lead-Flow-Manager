import { db } from '../drizzle/db';
import { users, chats, contacts, templateEntitlements, channelSettings } from '@shared/schema';
import { eq, and, lte, gte, isNotNull, or, desc, ne, inArray, sql } from 'drizzle-orm';
import { sendTrialCheckinEmail, sendDailyHotListEmail, type HotLeadEntry } from './email';

const GRAPH = "https://graph.facebook.com/v19.0";

// ─── Meta Webhook Auto-Heal ───────────────────────────────────────────────────
// Runs every hour. For every connected Facebook / Instagram channel, verifies
// that the page is still subscribed to the "messages" field.  If not, it
// re-subscribes automatically so inbound messages keep flowing.
export async function runMetaWebhookHealthCheck(): Promise<{ checked: number; repaired: number; errors: number }> {
  console.log('[WebhookHealth] Starting Meta webhook health check...');
  let checked = 0;
  let repaired = 0;
  let errors = 0;

  try {
    // Find all connected Facebook / Instagram channel settings
    const metaSettings = await db
      .select()
      .from(channelSettings)
      .where(
        and(
          eq(channelSettings.isConnected, true),
          inArray(channelSettings.channel, ['facebook', 'instagram'])
        )
      );

    console.log(`[WebhookHealth] Found ${metaSettings.length} connected Meta channel(s) to check`);

    for (const setting of metaSettings) {
      const cfg = setting.config as any;
      const pageId: string | undefined = cfg?.pageId;
      const accessToken: string | undefined = cfg?.accessToken;

      if (!pageId || !accessToken) {
        console.warn(`[WebhookHealth] Skipping userId=${setting.userId} channel=${setting.channel} — missing pageId or accessToken`);
        continue;
      }

      checked++;

      try {
        // 1. Check current subscription
        const checkResp = await fetch(
          `${GRAPH}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`
        );
        if (!checkResp.ok) {
          console.warn(`[WebhookHealth] GET subscribed_apps failed for pageId=${pageId} — HTTP ${checkResp.status}`);
          errors++;
          continue;
        }
        const checkData = (await checkResp.json()) as any;
        const existingSubs: any[] = checkData?.data ?? [];
        const existingFields: string[] = existingSubs.flatMap((s: any) => s.subscribed_fields ?? []);

        const hasMessages = existingFields.includes('messages');
        console.log(`[WebhookHealth] pageId=${pageId} channel=${setting.channel} subscribed_fields=[${existingFields.join(',')}] hasMessages=${hasMessages}`);

        if (hasMessages) {
          // Subscription is healthy — nothing to do
          continue;
        }

        // 2. Missing "messages" — auto-resubscribe
        console.log(`[WebhookHealth] ⚠ pageId=${pageId} missing "messages" subscription — auto-repairing...`);
        const subResp = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `subscribed_fields=messages&access_token=${encodeURIComponent(accessToken)}`,
        });
        const subData = (await subResp.json()) as any;

        if (subResp.ok && subData?.success === true) {
          repaired++;
          console.log(`[WebhookHealth] ✓ Auto-repaired webhook for pageId=${pageId} (userId=${setting.userId})`);
        } else {
          errors++;
          console.error(`[WebhookHealth] ✗ Auto-repair failed for pageId=${pageId} — ${subData?.error?.message ?? 'unknown error'}`);
        }
      } catch (pageErr) {
        errors++;
        console.error(`[WebhookHealth] Error checking pageId=${pageId}:`, pageErr);
      }
    }

    console.log(`[WebhookHealth] Done — checked=${checked} repaired=${repaired} errors=${errors}`);
    return { checked, repaired, errors };
  } catch (err) {
    console.error('[WebhookHealth] Fatal error in webhook health check:', err);
    throw err;
  }
}

/** Mark trial_status expired for accounts past trial_ends_at (runs periodically). */
export async function runTrialExpirySync(): Promise<number> {
  try {
    const result = await db.execute(sql`
      UPDATE users SET trial_status = 'expired'
      WHERE trial_ends_at IS NOT NULL
        AND trial_ends_at <= NOW()
        AND (trial_status IS NULL OR trial_status = 'active')
    `);
    const n = Number((result as any).rowCount ?? 0);
    if (n > 0) console.log(`[Cron] Trial expiry sync: ${n} user(s) marked expired`);
    return n;
  } catch (e) {
    console.error('[Cron] Trial expiry sync failed:', e);
    return 0;
  }
}

export async function runTrialCheckinEmails(): Promise<{ sent: number; errors: number }> {
  console.log('[Cron] Starting trial check-in email job...');
  
  const now = new Date();
  let sent = 0;
  let errors = 0;
  
  try {
    const eligibleUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        trialEndsAt: users.trialEndsAt,
        twilioConnected: users.twilioConnected,
        metaConnected: users.metaConnected,
        checkinEmailSent: users.checkinEmailSent,
        subscriptionStatus: users.subscriptionStatus,
      })
      .from(users)
      .where(
        and(
          isNotNull(users.trialEndsAt),
          eq(users.checkinEmailSent, false),
          or(
            eq(users.twilioConnected, false),
            eq(users.metaConnected, false)
          ),
          eq(users.subscriptionStatus, 'active')
        )
      );
    
    console.log(`[Cron] Found ${eligibleUsers.length} users to check`);
    
    for (const user of eligibleUsers) {
      if (!user.trialEndsAt) continue;
      
      const trialEndDate = new Date(user.trialEndsAt);
      const trialStartDate = new Date(trialEndDate);
      trialStartDate.setDate(trialStartDate.getDate() - 14);
      
      const daysSinceTrialStart = Math.floor((now.getTime() - trialStartDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const isConnected = user.twilioConnected || user.metaConnected;
      
      if (isConnected) {
        console.log(`[Cron] Skipping ${user.email} - already connected`);
        continue;
      }
      
      if (daysSinceTrialStart >= 10 && daysSinceTrialStart <= 12) {
        console.log(`[Cron] Sending check-in email to ${user.email} (day ${daysSinceTrialStart} of trial)`);
        
        try {
          const firstName = user.name.split(' ')[0];
          const success = await sendTrialCheckinEmail(firstName, user.email);
          
          if (success) {
            await db
              .update(users)
              .set({ checkinEmailSent: true })
              .where(eq(users.id, user.id));
            
            sent++;
            console.log(`[Cron] ✓ Sent check-in email to ${user.email}`);
          } else {
            errors++;
            console.log(`[Cron] ✗ Failed to send email to ${user.email}`);
          }
        } catch (emailError) {
          errors++;
          console.error(`[Cron] Error sending to ${user.email}:`, emailError);
        }
      } else {
        console.log(`[Cron] Skipping ${user.email} - day ${daysSinceTrialStart} (not in 10-12 range)`);
      }
    }
    
    console.log(`[Cron] Completed: ${sent} emails sent, ${errors} errors`);
    return { sent, errors };
    
  } catch (error) {
    console.error('[Cron] Error in trial check-in job:', error);
    throw error;
  }
}

export async function runDailyHotListEmails(): Promise<{ sent: number; errors: number }> {
  console.log('[Cron] Starting daily hot list email job...');

  let sent = 0;
  let errors = 0;

  try {
    const installedEntitlements = await db
      .select({
        userId: templateEntitlements.userId,
      })
      .from(templateEntitlements)
      .where(
        and(
          eq(templateEntitlements.templateId, 'realtor-growth-engine'),
          eq(templateEntitlements.status, 'installed')
        )
      );

    console.log(`[Cron/HotList] Found ${installedEntitlements.length} users with active Growth Engine`);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const ent of installedEntitlements) {
      try {
        const user = await db.query.users.findFirst({
          where: eq(users.id, ent.userId),
        });
        if (!user) continue;

        // Phase E Step 1: query contacts (authoritative CRM source) instead of chats.
        // LEFT JOIN to chats on whatsappPhone = whatsappId to fetch lastMessage and
        // chatId for the email link without a separate N+1 lookup.
        const hotLeads = await db
          .select({
            contactId: contacts.id,
            name: contacts.name,
            pipelineStage: contacts.pipelineStage,
            phone: contacts.phone,
            whatsappId: contacts.whatsappId,
            chatId: chats.id,
            lastMessage: chats.lastMessage,
          })
          .from(contacts)
          .leftJoin(
            chats,
            and(
              eq(chats.userId, contacts.userId),
              eq(chats.whatsappPhone, contacts.whatsappId)
            )
          )
          .where(
            and(
              eq(contacts.userId, ent.userId),
              eq(contacts.tag, 'Hot'),
              ne(contacts.pipelineStage, 'Closed'),
              ne(contacts.pipelineStage, 'Unqualified')
            )
          )
          .orderBy(desc(contacts.updatedAt))
          .limit(5);

        const leads: HotLeadEntry[] = hotLeads.map(row => ({
          name: row.name,
          score: 80,
          lastMessage: row.lastMessage || '',
          pipelineStage: row.pipelineStage,
          phone: row.phone || row.whatsappId || '',
          // Fall back to contactId if no matching chat exists yet
          chatId: row.chatId || row.contactId,
        }));

        const success = await sendDailyHotListEmail(user.email, user.name, leads);

        if (success) {
          sent++;
          console.log(`[Cron/HotList] ✓ Sent hot list to ${user.email} (${leads.length} leads)`);
        } else {
          errors++;
          console.log(`[Cron/HotList] ✗ Failed to send to ${user.email}`);
        }
      } catch (userErr) {
        errors++;
        console.error(`[Cron/HotList] Error processing user ${ent.userId}:`, userErr);
      }
    }

    console.log(`[Cron/HotList] Completed: ${sent} emails sent, ${errors} errors`);
    return { sent, errors };
  } catch (error) {
    console.error('[Cron/HotList] Error in daily hot list job:', error);
    throw error;
  }
}

let cronInterval: NodeJS.Timeout | null = null;
let hotListRanToday = false;
let lastWebhookHealthHour = -1;

export function startCronJobs() {
  console.log('[Cron] Starting cron scheduler...');
  
  runTrialCheckinEmails().catch(err => console.error('[Cron] Initial run error:', err));
  runTrialExpirySync().catch(err => console.error('[Cron] Trial expiry sync error:', err));

  // Run webhook health check once at startup (after 30 s to let DB settle)
  setTimeout(() => {
    runMetaWebhookHealthCheck().catch(err => console.error('[WebhookHealth] Startup check error:', err));
  }, 30_000);
  
  cronInterval = setInterval(() => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMin  = now.getUTCMinutes();

    if (utcHour === 14 && utcMin === 0) {
      runTrialCheckinEmails().catch(err => console.error('[Cron] Scheduled run error:', err));
    }

    if (utcMin === 0) {
      runTrialExpirySync().catch(err => console.error('[Cron] Trial expiry sync error:', err));
    }

    if (utcHour === 13 && utcMin === 0 && !hotListRanToday) {
      hotListRanToday = true;
      runDailyHotListEmails().catch(err => console.error('[Cron/HotList] Scheduled run error:', err));
    }

    if (utcHour === 0 && utcMin === 0) {
      hotListRanToday = false;
    }

    // Webhook health check — once per hour on the hour
    if (utcMin === 0 && utcHour !== lastWebhookHealthHour) {
      lastWebhookHealthHour = utcHour;
      runMetaWebhookHealthCheck().catch(err => console.error('[WebhookHealth] Hourly check error:', err));
    }
  }, 60000);
  
  console.log('[Cron] Cron scheduler started (trial check-in: 10 AM EST, hot list: 9 AM EST, webhook health: hourly)');
}

export function stopCronJobs() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log('[Cron] Cron scheduler stopped');
  }
}
