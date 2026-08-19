import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { storage } from "./storage";
import { fetchShopifyShopOwnerEmail } from "./shopify";
import {
  sendShopifyWelcomeEmail,
  sendShopifyActivationEmailDay5,
  sendShopifyActivationEmailDay10,
} from "./email";
import { getUserMessagingChannelStatusForEmails } from "./activationEmailService";
import { fullCalendarDaysSince } from "@shared/activationEmailEligibility";
import {
  chooseShopifyOnboardingSequenceAction,
  isShopifyInstallActiveForOnboarding,
  shouldProcessShopifyOnboardingUser,
  shopifyOnboardingStartAt,
  usableShopifyOwnerEmail,
} from "@shared/shopifyOnboardingEmailEligibility";
import { isShopifySyntheticMerchantEmail } from "@shared/shopifyBilling";

function firstName(name: string | null | undefined): string {
  return (name || "there").split(" ")[0] || "there";
}

const shopifyOnboardingSelect = {
  id: users.id,
  name: users.name,
  email: users.email,
  shopifyShop: users.shopifyShop,
  shopifyAccessToken: users.shopifyAccessToken,
  shopifyInstalledAt: users.shopifyInstalledAt,
  shopifySubscriptionStatus: users.shopifySubscriptionStatus,
  shopifyOwnerEmail: users.shopifyOwnerEmail,
  shopifyWelcomeEmailSentAt: users.shopifyWelcomeEmailSentAt,
  shopifyActivationEmailDay5SentAt: users.shopifyActivationEmailDay5SentAt,
  shopifyActivationEmailDay10SentAt: users.shopifyActivationEmailDay10SentAt,
  deletionRequestedAt: users.deletionRequestedAt,
};

type ShopifyOnboardingRow = {
  id: string;
  name: string;
  email: string;
  shopifyShop: string | null;
  shopifyAccessToken: string | null;
  shopifyInstalledAt: Date | null;
  shopifySubscriptionStatus: string | null;
  shopifyOwnerEmail: string | null;
  shopifyWelcomeEmailSentAt: Date | null;
  shopifyActivationEmailDay5SentAt: Date | null;
  shopifyActivationEmailDay10SentAt: Date | null;
  deletionRequestedAt: Date | null;
};

async function markShopifyRemindersComplete(userId: string): Promise<void> {
  const now = new Date();
  await db
    .update(users)
    .set({
      shopifyActivationEmailDay5SentAt: now,
      shopifyActivationEmailDay10SentAt: now,
    })
    .where(eq(users.id, userId));
}

export async function trySendShopifyWelcomeEmailForUser(user: {
  id: string;
  name: string;
  email?: string | null;
  shopifyShop?: string | null;
  shopifySubscriptionStatus?: string | null;
  shopifyOwnerEmail?: string | null;
  shopifyWelcomeEmailSentAt?: Date | string | null;
  deletionRequestedAt?: Date | string | null;
}): Promise<boolean> {
  if (user.shopifyWelcomeEmailSentAt) return true;
  if (user.deletionRequestedAt) return true;
  if (!isShopifyInstallActiveForOnboarding(user)) return true;

  const recipient = usableShopifyOwnerEmail(user.shopifyOwnerEmail);
  if (!recipient) return false;
  if (isShopifySyntheticMerchantEmail(recipient)) return false;

  const sent = await sendShopifyWelcomeEmail(user.name, recipient);
  if (sent) {
    await storage.updateUser(user.id, { shopifyWelcomeEmailSentAt: new Date() });
  }
  return sent;
}

async function maybeRefreshOwnerEmail(user: ShopifyOnboardingRow): Promise<string | null> {
  const existing = usableShopifyOwnerEmail(user.shopifyOwnerEmail);
  if (existing) return existing;
  if (!user.shopifyShop || !user.shopifyAccessToken) return null;
  if (!isShopifyInstallActiveForOnboarding(user)) return null;

  const fetched = await fetchShopifyShopOwnerEmail(user.shopifyShop, user.shopifyAccessToken);
  const usable = usableShopifyOwnerEmail(fetched);
  if (!usable) return null;
  try {
    await storage.updateUser(user.id, { shopifyOwnerEmail: usable });
  } catch (err) {
    console.warn("[ShopifyOnboarding] failed to persist shopifyOwnerEmail", {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return usable;
}

export async function runShopifyOnboardingEmails(): Promise<{
  welcomeSent: number;
  day5Sent: number;
  day10Sent: number;
  markedComplete: number;
  errors: number;
}> {
  console.log("[Cron] Starting Shopify onboarding email job...");

  const now = new Date();
  let welcomeSent = 0;
  let day5Sent = 0;
  let day10Sent = 0;
  let markedComplete = 0;
  let errors = 0;

  try {
    const pendingWelcome = await db
      .select(shopifyOnboardingSelect)
      .from(users)
      .where(and(isNotNull(users.shopifyShop), isNull(users.shopifyWelcomeEmailSentAt)));

    const pendingDay5 = await db
      .select(shopifyOnboardingSelect)
      .from(users)
      .where(
        and(isNotNull(users.shopifyShop), isNull(users.shopifyActivationEmailDay5SentAt)),
      );

    const pendingDay10 = await db
      .select(shopifyOnboardingSelect)
      .from(users)
      .where(
        and(isNotNull(users.shopifyShop), isNull(users.shopifyActivationEmailDay10SentAt)),
      );

    const seen = new Set<string>();
    const uniqueCandidates = [...pendingWelcome, ...pendingDay5, ...pendingDay10].filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    console.log(`[Cron] Checking ${uniqueCandidates.length} Shopify users for onboarding emails`);

    for (const user of uniqueCandidates) {
      if (!shouldProcessShopifyOnboardingUser(user)) continue;
      if (isShopifySyntheticMerchantEmail(user.shopifyOwnerEmail)) continue;

      const ownerEmail =
        usableShopifyOwnerEmail(user.shopifyOwnerEmail) ||
        (await maybeRefreshOwnerEmail(user));
      const hasUsableOwnerEmail = !!ownerEmail;

      const start = shopifyOnboardingStartAt(user);
      const days = start ? fullCalendarDaysSince(start, now) : 0;
      const channels = await getUserMessagingChannelStatusForEmails(user.id);
      const choice = chooseShopifyOnboardingSequenceAction({
        welcomeSent: !!user.shopifyWelcomeEmailSentAt,
        day5Sent: !!user.shopifyActivationEmailDay5SentAt,
        day10Sent: !!user.shopifyActivationEmailDay10SentAt,
        daysSinceInstall: days,
        hasQualifyingChannel: channels.hasAnyMessagingChannel,
        hasUsableOwnerEmail,
      });

      if (choice.action === "none") continue;

      if (choice.action === "mark_complete") {
        await markShopifyRemindersComplete(user.id);
        markedComplete++;
        continue;
      }

      if (!ownerEmail) continue;

      if (choice.action === "welcome") {
        try {
          const alreadySent = !!user.shopifyWelcomeEmailSentAt;
          const ok = await trySendShopifyWelcomeEmailForUser({
            ...user,
            shopifyOwnerEmail: ownerEmail,
          });
          if (ok && !alreadySent) welcomeSent++;
          else if (!ok) errors++;
        } catch (err) {
          errors++;
          console.error("[Cron] Shopify Day 0 email error", { userId: user.id, err });
        }
        continue;
      }

      if (choice.action === "day5") {
        try {
          const ok = await sendShopifyActivationEmailDay5(firstName(user.name), ownerEmail);
          if (ok) {
            await db
              .update(users)
              .set({ shopifyActivationEmailDay5SentAt: now })
              .where(eq(users.id, user.id));
            day5Sent++;
          } else {
            errors++;
          }
        } catch (err) {
          errors++;
          console.error("[Cron] Shopify Day 5 email error", { userId: user.id, err });
        }
        continue;
      }

      if (choice.action === "day10") {
        try {
          const ok = await sendShopifyActivationEmailDay10(firstName(user.name), ownerEmail);
          if (ok) {
            await db
              .update(users)
              .set({
                shopifyActivationEmailDay10SentAt: now,
                ...(choice.alsoCompleteDay5 ? { shopifyActivationEmailDay5SentAt: now } : {}),
              })
              .where(eq(users.id, user.id));
            day10Sent++;
          } else {
            errors++;
          }
        } catch (err) {
          errors++;
          console.error("[Cron] Shopify Day 10 email error", { userId: user.id, err });
        }
      }
    }

    console.log(
      `[Cron] Shopify onboarding emails complete: welcome=${welcomeSent}, day5=${day5Sent}, day10=${day10Sent}, markedComplete=${markedComplete}, errors=${errors}`,
    );
    return { welcomeSent, day5Sent, day10Sent, markedComplete, errors };
  } catch (error) {
    console.error("[Cron] Error in Shopify onboarding email job:", error);
    throw error;
  }
}
