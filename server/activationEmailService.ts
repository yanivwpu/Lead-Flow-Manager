import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { eq, isNull, or, isNotNull, and } from "drizzle-orm";
import { storage } from "./storage";
import {
  syncWhatsAppChannelRowFromCanonicalMeta,
  isCanonicalWhatsAppFullyConnected,
} from "./whatsappService";
import { getPrimaryEmailMailbox } from "./emailChannel/mailboxStore";
import { isEmailMailboxUiConnected } from "@shared/emailMailboxAvailability";
import { hasQualifyingMessagingChannelForActivationEmails } from "@shared/activationEmailChannels";
import {
  sendActivationEmailDay5,
  sendActivationEmailDay10,
} from "./email";
import { trySendWelcomeEmailForUser } from "./emailVerification";
import {
  activationStartAt,
  daysSinceActivationStart,
  isEligibleForActivationEmails,
  isExcludedFromActivationEmails,
  chooseActivationSequenceAction,
} from "@shared/activationEmailEligibility";

export type MessagingChannelStatus = {
  whatsappConnected: boolean;
  facebookConnected: boolean;
  instagramConnected: boolean;
  emailConnected: boolean;
  smsConnected: boolean;
  telegramConnected: boolean;
  webchatConnected: boolean;
  /** Email-sequence suppression: WA/FB/IG/Email/SMS/Telegram/Web Chat. Not used by /api/activation-status. */
  hasAnyMessagingChannel: boolean;
};

export async function getUserMessagingChannelStatusForEmails(
  userId: string,
): Promise<MessagingChannelStatus> {
  const user = await storage.getUserForSession(userId);
  await syncWhatsAppChannelRowFromCanonicalMeta(userId);
  const settings = await storage.getChannelSettings(userId);
  const canonicalWa = user ? isCanonicalWhatsAppFullyConnected(user) : false;

  let nativeEmailMailboxConnected = false;
  try {
    const mailbox = await getPrimaryEmailMailbox(userId);
    nativeEmailMailboxConnected = isEmailMailboxUiConnected(mailbox?.syncStatus);
  } catch {
    nativeEmailMailboxConnected = false;
  }

  const hasAny = hasQualifyingMessagingChannelForActivationEmails({
    canonicalWhatsAppConnected: canonicalWa,
    channels: settings.map((s) => ({ channel: s.channel, isConnected: s.isConnected })),
    nativeEmailMailboxConnected,
  });

  const connected = (channel: string) =>
    settings.some((s) => s.channel === channel && !!s.isConnected);

  return {
    whatsappConnected: canonicalWa || connected("whatsapp"),
    facebookConnected: connected("facebook"),
    instagramConnected: connected("instagram"),
    emailConnected: connected("email") || nativeEmailMailboxConnected,
    smsConnected: connected("sms"),
    telegramConnected: connected("telegram"),
    webchatConnected: connected("webchat"),
    hasAnyMessagingChannel: hasAny,
  };
}

/** @deprecated Use getUserMessagingChannelStatusForEmails for the onboarding sequence. */
export async function getUserMessagingChannelStatus(
  userId: string,
): Promise<MessagingChannelStatus> {
  return getUserMessagingChannelStatusForEmails(userId);
}

function firstName(name: string | null | undefined): string {
  return (name || "there").split(" ")[0] || "there";
}

const activationUserSelect = {
  id: users.id,
  name: users.name,
  email: users.email,
  createdAt: users.createdAt,
  trialStartedAt: users.trialStartedAt,
  shopifyInstalledAt: users.shopifyInstalledAt,
  emailVerifiedAt: users.emailVerifiedAt,
  welcomeEmailSentAt: users.welcomeEmailSentAt,
  activationEmailDay3Sent: users.activationEmailDay3Sent,
  activationEmailDay10Sent: users.activationEmailDay10Sent,
  deletionRequestedAt: users.deletionRequestedAt,
};

async function markActivationSequenceComplete(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      activationEmailDay3Sent: true,
      activationEmailDay10Sent: true,
    })
    .where(eq(users.id, userId));
}

export async function runActivationEmails(): Promise<{
  welcomeSent: number;
  day5Sent: number;
  day10Sent: number;
  markedComplete: number;
  errors: number;
  /** @deprecated Alias of day5Sent for admin callers. */
  day3Sent: number;
}> {
  console.log("[Cron] Starting onboarding activation email job...");

  const now = new Date();
  let welcomeSent = 0;
  let day5Sent = 0;
  let day10Sent = 0;
  let markedComplete = 0;
  let errors = 0;

  try {
    const pendingWelcome = await db
      .select(activationUserSelect)
      .from(users)
      .where(
        and(
          isNull(users.welcomeEmailSentAt),
          or(isNotNull(users.emailVerifiedAt), isNotNull(users.shopifyInstalledAt)),
        ),
      );

    const pendingDay5 = await db
      .select(activationUserSelect)
      .from(users)
      .where(eq(users.activationEmailDay3Sent, false));

    const pendingDay10 = await db
      .select(activationUserSelect)
      .from(users)
      .where(eq(users.activationEmailDay10Sent, false));

    const seen = new Set<string>();
    const uniqueCandidates = [...pendingWelcome, ...pendingDay5, ...pendingDay10].filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    console.log(`[Cron] Checking ${uniqueCandidates.length} users for activation emails`);

    for (const user of uniqueCandidates) {
      if (user.deletionRequestedAt) continue;
      if (!user.email || isExcludedFromActivationEmails(user.email)) {
        continue;
      }
      if (!isEligibleForActivationEmails(user)) {
        continue;
      }

      const days = daysSinceActivationStart(user, now);
      const channels = await getUserMessagingChannelStatusForEmails(user.id);
      const choice = chooseActivationSequenceAction({
        welcomeSent: !!user.welcomeEmailSentAt,
        day5Sent: !!user.activationEmailDay3Sent,
        day10Sent: !!user.activationEmailDay10Sent,
        daysSinceStart: days,
        hasQualifyingChannel: channels.hasAnyMessagingChannel,
      });

      if (choice.action === "none") continue;

      if (choice.action === "mark_complete") {
        await markActivationSequenceComplete(user.id);
        markedComplete++;
        console.log(
          `[Cron] Marked activation sequence complete for ${user.email} — qualifying channel connected`,
        );
        continue;
      }

      if (choice.action === "welcome") {
        console.log(`[Cron] Sending/retrying Day 0 welcome email to ${user.email}`);
        try {
          const ok = await trySendWelcomeEmailForUser({
            id: user.id,
            name: user.name,
            email: user.email,
            welcomeEmailSentAt: user.welcomeEmailSentAt,
          });
          if (ok) welcomeSent++;
          else errors++;
        } catch (err) {
          errors++;
          console.error(`[Cron] Welcome email error for ${user.email}:`, err);
        }
        continue;
      }

      if (choice.action === "day5") {
        const activationStart = activationStartAt(user);
        console.log(
          `[Cron] Sending day-5 activation email to ${user.email} (${days} full day(s) since ${activationStart?.toISOString() ?? "unknown"})`,
        );
        try {
          const ok = await sendActivationEmailDay5(firstName(user.name), user.email);
          if (ok) {
            await db
              .update(users)
              .set({ activationEmailDay3Sent: true })
              .where(eq(users.id, user.id));
            day5Sent++;
          } else {
            errors++;
          }
        } catch (err) {
          errors++;
          console.error(`[Cron] Day-5 email error for ${user.email}:`, err);
        }
        continue;
      }

      if (choice.action === "day10") {
        const activationStart = activationStartAt(user);
        console.log(
          `[Cron] Sending day-10 activation email to ${user.email} (${days} full day(s) since ${activationStart?.toISOString() ?? "unknown"})`,
        );
        try {
          const ok = await sendActivationEmailDay10(firstName(user.name), user.email);
          if (ok) {
            await db
              .update(users)
              .set({
                activationEmailDay10Sent: true,
                ...(choice.alsoCompleteDay5 ? { activationEmailDay3Sent: true } : {}),
              })
              .where(eq(users.id, user.id));
            day10Sent++;
          } else {
            errors++;
          }
        } catch (err) {
          errors++;
          console.error(`[Cron] Day-10 email error for ${user.email}:`, err);
        }
      }
    }

    console.log(
      `[Cron] Activation emails complete: welcome=${welcomeSent}, day5=${day5Sent}, day10=${day10Sent}, markedComplete=${markedComplete}, errors=${errors}`,
    );
    return {
      welcomeSent,
      day5Sent,
      day10Sent,
      markedComplete,
      errors,
      day3Sent: day5Sent,
    };
  } catch (error) {
    console.error("[Cron] Error in activation email job:", error);
    throw error;
  }
}
