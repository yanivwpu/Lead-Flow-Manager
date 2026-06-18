/**
 * Agent Page inventory publishing audit (read-only by default).
 * Usage:
 *   npx tsx scripts/audit-agent-page-publish.ts [userId]
 *   npx tsx scripts/audit-agent-page-publish.ts [userId] --publish
 *   npx tsx scripts/audit-agent-page-publish.ts [userId] --unpublish
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { aiBusinessKnowledge, users } from "../shared/schema";
import {
  bulkPublishEligibleListings,
  bulkUnpublishAllListings,
  getListingPublicationStats,
} from "../server/inventory/inventoryDb";
import { fetchPublishedListingsForAgentPage } from "../server/agentPage/agentPageDb";

const DEFAULT_USER_ID = "51f64011-eb3a-48a4-bb10-031abd3c0cdc";

async function auditUser(userId: string, label: string) {
  const [abk] = await db
    .select()
    .from(aiBusinessKnowledge)
    .where(eq(aiBusinessKnowledge.userId, userId))
    .limit(1);
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const stats = await getListingPublicationStats(userId);
  const agentPageListings = await fetchPublishedListingsForAgentPage(userId);

  console.log(`--- ${label} ---`);
  console.log("userId:", userId);
  console.log("email:", user?.email ?? "(unknown)");
  console.log("agentPageEnabled:", abk?.agentPageEnabled ?? false);
  console.log("agentPageSlug:", abk?.agentPageSlug ?? null);
  console.log("publishListingsPublicly:", abk?.publishListingsPublicly ?? false);
  console.log("publicationStats:", stats);
  console.log("agentPageFetchCount:", agentPageListings.length);
  console.log("");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith("--"));
  const userId = (args.find((a) => !a.startsWith("--")) || DEFAULT_USER_ID).trim();

  if (flags.includes("--publish")) {
    console.log("Running bulk publish for", userId);
    const result = await bulkPublishEligibleListings(userId);
    console.log("bulkPublish result:", result);
    console.log("");
  }

  if (flags.includes("--unpublish")) {
    console.log("Running bulk unpublish for", userId);
    const result = await bulkUnpublishAllListings(userId);
    console.log("bulkUnpublish result:", result);
    console.log("");
  }

  const agentPages = await db
    .select({
      userId: aiBusinessKnowledge.userId,
      slug: aiBusinessKnowledge.agentPageSlug,
      email: users.email,
    })
    .from(aiBusinessKnowledge)
    .innerJoin(users, eq(aiBusinessKnowledge.userId, users.id))
    .where(eq(aiBusinessKnowledge.agentPageEnabled, true));

  console.log("Enabled agent pages:", agentPages.length);
  for (const ap of agentPages) {
    console.log(` - slug=${ap.slug} email=${ap.email}`);
  }
  console.log("");

  await auditUser(userId, "Target workspace");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
