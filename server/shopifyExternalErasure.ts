import { eq, count } from "drizzle-orm";
import { db } from "../drizzle/db";
import { shopifyPrivacyErasureTasks } from "@shared/schema";

/**
 * Adapter supplied by the governed-log/email-processor operator.
 * An acknowledgment is valid only after all applicable streams/processors for the window
 * have been purged or verified beyond their approved retention, including archive copies.
 * No recipient, shop domain, user selector or token is passed or retained here.
 */
export async function processShopifyExternalErasureTasks(adapter: {
  eraseAndVerify(window: { from: Date | null; to: Date }): Promise<{ verified: boolean }>;
}): Promise<{ pending: number; completed: number }> {
  const tasks = await db.select().from(shopifyPrivacyErasureTasks).limit(20);
  let completed = 0;
  for (const task of tasks) {
    try {
      const result = await adapter.eraseAndVerify({ from: task.scopeFrom, to: task.scopeTo });
      if (result.verified === true) {
        await db.delete(shopifyPrivacyErasureTasks).where(eq(shopifyPrivacyErasureTasks.id, task.id));
        completed++;
      }
    } catch { /* A failed/unconfigured processor never marks erasure complete. */ }
  }
  const [remaining] = await db.select({ total: count() }).from(shopifyPrivacyErasureTasks);
  return { pending: remaining.total, completed };
}
