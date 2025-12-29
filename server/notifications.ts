import webPush from 'web-push';
import cron from 'node-cron';
import { storage } from './storage';
import type { Chat, User } from '@shared/schema';

// Generate VAPID keys if not set
// Run: npx web-push generate-vapid-keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:support@example.com';

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}

export function getVapidPublicKey(): string {
  return vapidPublicKey;
}

async function sendPushNotification(subscription: any, payload: string) {
  try {
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn('VAPID keys not configured, skipping push notification');
      return;
    }
    await webPush.sendNotification(subscription, payload);
    console.log('Push notification sent successfully');
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

async function sendEmailNotification(chatId: string, email: string, chatName: string, followUp: string, notes: string) {
  try {
    const { sendFollowUpReminderEmail } = await import('./email');
    await sendFollowUpReminderEmail(email, chatName, followUp, notes, chatId);
  } catch (error) {
    console.error('Error sending email notification:', error);
  }
}

async function checkFollowUps() {
  try {
    console.log('Checking for due follow-ups...');
    const dueFollowUps = await storage.getDueFollowUps();
    
    if (dueFollowUps.length === 0) {
      console.log('No due follow-ups found');
      return;
    }

    console.log(`Found ${dueFollowUps.length} due follow-ups`);

    for (const chat of dueFollowUps) {
      const user = await storage.getUser(chat.userId);
      if (!user) continue;

      const message = `Follow-up reminder: ${chat.name} - ${chat.followUp}`;
      
      // Send push notification if enabled
      if (user.pushEnabled && user.pushSubscription) {
        await sendPushNotification(
          user.pushSubscription,
          JSON.stringify({
            title: 'Follow-up Reminder',
            body: message,
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
            data: {
              chatId: chat.id,
              url: `/chats/${chat.id}`
            }
          })
        );
      }

      // Send email notification if enabled
      if (user.emailEnabled) {
        await sendEmailNotification(
          chat.id,
          user.email,
          chat.name,
          chat.followUp || '',
          chat.notes || ''
        );
      }

      // Clear the follow-up after sending notification
      await storage.updateChat(chat.id, {
        followUp: null,
        followUpDate: null
      });
    }
  } catch (error) {
    console.error('Error checking follow-ups:', error);
  }
}

export function startNotificationScheduler() {
  // Check for due follow-ups every minute
  cron.schedule('* * * * *', checkFollowUps);
  console.log('Notification scheduler started - checking every minute');
  
  // Run immediately on startup
  checkFollowUps();
}
