import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import {
  syncWhatsAppChannelRowFromCanonicalMeta,
  isCanonicalWhatsAppFullyConnected,
} from "./whatsappService";
import { sendActivationEmailDay3, sendActivationEmailDay10 } from "./email";
import {
  activationStartAt,
  daysSinceActivationStart,
  isExcludedFromActivationEmails,
} from "@shared/activationEmailEligibility";

export type MessagingChannelStatus = {
  whatsappConnected: boolean;
  facebookConnected: boolean;
  instagramConnected: boolean;
  hasAnyMessagingChannel: boolean;
};

export async function getUserMessagingChannelStatus(
  userId: string,
): Promise<MessagingChannelStatus> {
  const user = await storage.getUserForSession(userId);
  await syncWhatsAppChannelRowFromCanonicalMeta(userId);
  const settings = await storage.getChannelSettings(userId);
  const legacyWa = settings.some((s) => s.channel === "whatsapp" && !!s.isConnected);
  const canonicalWa = user ? isCanonicalWhatsAppFullyConnected(user) : false;
  const whatsappConnected = canonicalWa || legacyWa;
  const facebookConnected = settings.some(
    (s) => s.channel === "facebook" && !!s.isConnected,
  );
  const instagramConnected = settings.some(
    (s) => s.channel === "instagram" && !!s.isConnected,
  );
  return {
    whatsappConnected,
    facebookConnected,
    instagramConnected,
    hasAnyMessagingChannel:
      whatsappConnected || facebookConnected || instagramConnected,
  };
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
  activationEmailDay3Sent: users.activationEmailDay3Sent,
  activationEmailDay10Sent: users.activationEmailDay10Sent,
  deletionRequestedAt: users.deletionRequestedAt,
};

export async function runActivationEmails(): Promise<{
  day3Sent: number;
  day10Sent: number;
  errors: number;
}> {
  console.log("[Cron] Starting onboarding activation email job...");

  const now = new Date();
  let day3Sent = 0;
  let day10Sent = 0;
  let errors = 0;

  try {
    const pendingDay3 = await db
      .select(activationUserSelect)
      .from(users)
      .where(eq(users.activationEmailDay3Sent, false));

    const pendingDay10 = await db
      .select(activationUserSelect)
      .from(users)
      .where(eq(users.activationEmailDay10Sent, false));

    const seen = new Set<string>();
    const uniqueCandidates = [...pendingDay3, ...pendingDay10].filter((u) => {
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

      const activationStart = activationStartAt(user);
      const days = daysSinceActivationStart(user, now);
      const channels = await getUserMessagingChannelStatus(user.id);

      if (channels.hasAnyMessagingChannel) {
        console.log(`[Cron] Skipping ${user.email} — messaging channel already connected`);
        continue;
      }

      const needsDay3 = !user.activationEmailDay3Sent && days >= 3;
      const needsDay10 = !user.activationEmailDay10Sent && days >= 10;

      if (needsDay3) {
        console.log(
          `[Cron] Sending day-3 activation email to ${user.email} (${days} full day(s) since ${activationStart?.toISOString() ?? "unknown"})`,
        );
        try {
          const ok = await sendActivationEmailDay3(firstName(user.name), user.email);
          if (ok) {
            await db
              .update(users)
              .set({ activationEmailDay3Sent: true })
              .where(eq(users.id, user.id));
            day3Sent++;
          } else {
            errors++;
          }
        } catch (err) {
          errors++;
          console.error(`[Cron] Day-3 email error for ${user.email}:`, err);
        }
      }

      if (needsDay10) {
        console.log(
          `[Cron] Sending day-10 activation email to ${user.email} (${days} full day(s) since ${activationStart?.toISOString() ?? "unknown"})`,
        );
        try {
          const ok = await sendActivationEmailDay10(firstName(user.name), user.email);
          if (ok) {
            await db
              .update(users)
              .set({ activationEmailDay10Sent: true })
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
      `[Cron] Activation emails complete: day3=${day3Sent}, day10=${day10Sent}, errors=${errors}`,
    );
    return { day3Sent, day10Sent, errors };
  } catch (error) {
    console.error("[Cron] Error in activation email job:", error);
    throw error;
  }
}
