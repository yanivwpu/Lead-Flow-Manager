import { db } from '../drizzle/db';
import { users } from '@shared/schema';
import { eq, and, lte, gte, isNotNull, or } from 'drizzle-orm';
import { sendTrialCheckinEmail } from './email';

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

let cronInterval: NodeJS.Timeout | null = null;

export function startCronJobs() {
  console.log('[Cron] Starting cron scheduler...');
  
  runTrialCheckinEmails().catch(err => console.error('[Cron] Initial run error:', err));
  
  cronInterval = setInterval(() => {
    const now = new Date();
    if (now.getUTCHours() === 14 && now.getUTCMinutes() === 0) {
      runTrialCheckinEmails().catch(err => console.error('[Cron] Scheduled run error:', err));
    }
  }, 60000);
  
  console.log('[Cron] Cron scheduler started (runs daily at 10 AM EST / 2 PM UTC)');
}

export function stopCronJobs() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log('[Cron] Cron scheduler stopped');
  }
}
