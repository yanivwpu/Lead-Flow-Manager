import { db } from '../drizzle/db';
import { users, chats, contacts, templateEntitlements } from '@shared/schema';
import { eq, and, lte, gte, isNotNull, or, desc, ne } from 'drizzle-orm';
import { sendTrialCheckinEmail, sendDailyHotListEmail, type HotLeadEntry } from './email';

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

export function startCronJobs() {
  console.log('[Cron] Starting cron scheduler...');
  
  runTrialCheckinEmails().catch(err => console.error('[Cron] Initial run error:', err));
  
  cronInterval = setInterval(() => {
    const now = new Date();

    if (now.getUTCHours() === 14 && now.getUTCMinutes() === 0) {
      runTrialCheckinEmails().catch(err => console.error('[Cron] Scheduled run error:', err));
    }

    if (now.getUTCHours() === 13 && now.getUTCMinutes() === 0 && !hotListRanToday) {
      hotListRanToday = true;
      runDailyHotListEmails().catch(err => console.error('[Cron/HotList] Scheduled run error:', err));
    }

    if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
      hotListRanToday = false;
    }
  }, 60000);
  
  console.log('[Cron] Cron scheduler started (trial check-in: 10 AM EST, hot list: 9 AM EST)');
}

export function stopCronJobs() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log('[Cron] Cron scheduler stopped');
  }
}
