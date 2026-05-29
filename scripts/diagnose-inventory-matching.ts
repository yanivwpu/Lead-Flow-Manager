/**
 * Audit inventory seed vs contact workspace for matching diagnostics.
 *
 * Usage:
 *   npx tsx scripts/diagnose-inventory-matching.ts <contactId>
 */
import "dotenv/config";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts, contactInventoryOpportunities, inventoryListings, inventorySources, users } from "../shared/schema";

const contactId = (process.argv[2] || "").trim();
if (!contactId) {
  console.error("Usage: npx tsx scripts/diagnose-inventory-matching.ts <contactId>");
  process.exit(1);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const [contact] = await db
    .select({ id: contacts.id, userId: contacts.userId, name: contacts.name })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) {
    console.error(`Contact not found: ${contactId}`);
    process.exit(1);
  }

  const contactUserId = contact.userId;

  const [userRow] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, contactUserId))
    .limit(1);

  const sources = await db
    .select({
      id: inventorySources.id,
      provider: inventorySources.provider,
      displayName: inventorySources.displayName,
      userId: inventorySources.userId,
    })
    .from(inventorySources)
    .where(eq(inventorySources.userId, contactUserId));

  const listingStats = await db
    .select({
      status: inventoryListings.status,
      count: sql<number>`count(*)::int`,
    })
    .from(inventoryListings)
    .where(eq(inventoryListings.userId, contactUserId))
    .groupBy(inventoryListings.status);

  const devSeedCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .where(
      and(
        eq(inventoryListings.userId, contactUserId),
        sql`${inventoryListings.providerListingId} like 'dev-seed-%'`,
      ),
    );

  const activeCount = listingStats.find((r) => r.status === "active")?.count ?? 0;
  const totalCount = listingStats.reduce((s, r) => s + r.count, 0);

  console.log("\n=== Inventory matching audit ===\n");
  console.log("Contact:", contact.id, contact.name || "(no name)");
  console.log("Contact workspace userId:", contactUserId);
  console.log("User email:", userRow?.email ?? "(user row missing)");
  console.log("\nSeed command for THIS workspace:");
  console.log(`  npx tsx scripts/seed-inventory.ts ${contactUserId} --clearExisting --processOpportunities`);
  console.log("\nInventory sources:", sources.length);
  for (const s of sources) {
    console.log(`  - ${s.id} | ${s.provider} | ${s.displayName}`);
  }
  console.log("\nListings by status:");
  if (listingStats.length === 0) {
    console.log("  (none for this userId)");
  } else {
    for (const row of listingStats) {
      console.log(`  - ${row.status}: ${row.count}`);
    }
  }
  console.log("\ndev-seed-* listings:", devSeedCount[0]?.count ?? 0);
  console.log("Active listings (matcher uses these):", activeCount);
  console.log("Total listings:", totalCount);

  const [oppRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactInventoryOpportunities)
    .where(eq(contactInventoryOpportunities.contactId, contactId));

  const newAlertCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .where(
      and(
        eq(inventoryListings.userId, contactUserId),
        eq(inventoryListings.status, "active"),
        eq(inventoryListings.syncAlertStatus, "new"),
      ),
    );

  console.log("\nNew Opportunities (contact):", oppRow?.count ?? 0);
  console.log("Listings flagged sync_alert_status=new:", newAlertCount[0]?.count ?? 0);
  console.log(`  GET /api/contacts/${contactId}/inventory-opportunities`);

  if (sources.length === 0) {
    console.log("\n⚠ No inventory_sources for contact workspace — run seed-inventory.ts with userId above.");
  } else if (activeCount === 0) {
    console.log("\n⚠ Sources exist but no active listings — re-run seed or check status column.");
  } else {
    console.log("\n✓ Active inventory present for contact workspace.");
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
