/** Optional Railway one-shot cron entrypoint; uses the same leases as the in-process scheduler. */
import { runShopifyPrivacyTick } from "../server/shopifyExternalErasure";
import { db } from "../drizzle/db";
try { const result = await runShopifyPrivacyTick(); if (!result.ok) process.exitCode = 1; }
finally { await db.$client.end(); }
