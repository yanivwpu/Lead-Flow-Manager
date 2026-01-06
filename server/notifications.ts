import webPush from 'web-push';
import cron from 'node-cron';
import { storage } from './storage';
import { sendUserWhatsAppMessage } from './userTwilio';
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

// Process drip campaign enrollments
async function processDripEnrollments() {
  try {
    const dueEnrollments = await storage.getDueEnrollments();
    
    if (dueEnrollments.length === 0) {
      return;
    }

    console.log(`Processing ${dueEnrollments.length} drip enrollments`);

    for (const enrollment of dueEnrollments) {
      try {
        const campaign = await storage.getDripCampaign(enrollment.campaignId);
        if (!campaign || !campaign.isActive) {
          await storage.updateDripEnrollment(enrollment.id, { status: "cancelled" });
          continue;
        }

        const chat = await storage.getChat(enrollment.chatId);
        if (!chat || !chat.whatsappPhone) {
          await storage.updateDripEnrollment(enrollment.id, { status: "cancelled" });
          continue;
        }

        const steps = await storage.getDripSteps(enrollment.campaignId);
        const nextStepOrder = (enrollment.currentStepOrder || 0) + 1;
        const currentStep = steps.find(s => s.stepOrder === nextStepOrder);

        if (!currentStep) {
          await storage.updateDripEnrollment(enrollment.id, { 
            status: "completed",
            completedAt: new Date()
          });
          continue;
        }

        // Send the message via user's Twilio
        const dripSend = await storage.createDripSend({
          enrollmentId: enrollment.id,
          stepId: currentStep.id,
          status: "pending",
        });

        try {
          const result = await sendUserWhatsAppMessage(
            campaign.userId,
            chat.whatsappPhone,
            currentStep.messageContent
          );

          await storage.updateDripSend(dripSend.id, {
            status: "sent",
            twilioSid: result.sid,
          });

          // Record message in chat history
          const dripMessage = {
            id: `drip-${Date.now()}`,
            text: currentStep.messageContent,
            time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
            sent: true,
            sender: "me",
          };
          const currentChat = await storage.getChat(chat.id);
          if (currentChat) {
            const msgs = (currentChat.messages as any[]) || [];
            msgs.push(dripMessage);
            await storage.updateChat(chat.id, { messages: msgs });
          }

          console.log(`Drip message sent to ${chat.whatsappPhone} (step ${nextStepOrder})`);

          // Calculate next send time
          const nextStep = steps.find(s => s.stepOrder === nextStepOrder + 1);
          if (nextStep) {
            const nextSendAt = new Date(Date.now() + (nextStep.delayMinutes || 0) * 60 * 1000);
            await storage.updateDripEnrollment(enrollment.id, {
              currentStepOrder: nextStepOrder,
              nextSendAt,
            });
          } else {
            await storage.updateDripEnrollment(enrollment.id, {
              currentStepOrder: nextStepOrder,
              status: "completed",
              completedAt: new Date(),
            });
          }
        } catch (sendError: any) {
          console.error(`Failed to send drip message:`, sendError);
          await storage.updateDripSend(dripSend.id, {
            status: "failed",
            errorMessage: sendError.message || "Unknown error",
          });
        }
      } catch (enrollmentError) {
        console.error(`Error processing enrollment ${enrollment.id}:`, enrollmentError);
      }
    }
  } catch (error) {
    console.error('Error processing drip enrollments:', error);
  }
}

export function startNotificationScheduler() {
  // Check for due follow-ups every minute
  cron.schedule('* * * * *', checkFollowUps);
  console.log('Notification scheduler started - checking every minute');
  
  // Process drip enrollments every minute
  cron.schedule('* * * * *', processDripEnrollments);
  console.log('Drip campaign scheduler started - checking every minute');
  
  // Run immediately on startup
  checkFollowUps();
}
