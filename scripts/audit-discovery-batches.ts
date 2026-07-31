/**
 * Read-only audit: recent Prospect AI discovery batches (no Places calls).
 * Run: npx tsx scripts/audit-discovery-batches.ts
 */
import { and, count, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  prospectAiDiscoveryResults,
  prospectAiDiscoverySearches,
} from "../shared/schema";

async function main() {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  const recent = await db
    .select()
    .from(prospectAiDiscoverySearches)
    .orderBy(desc(prospectAiDiscoverySearches.createdAt))
    .limit(20);

  const sample = [];
  for (const s of recent) {
    const [totalRow] = await db
      .select({ total: count() })
      .from(prospectAiDiscoveryResults)
      .where(eq(prospectAiDiscoveryResults.searchId, s.id));
    const [unsentRow] = await db
      .select({ total: count() })
      .from(prospectAiDiscoveryResults)
      .where(
        and(
          eq(prospectAiDiscoveryResults.searchId, s.id),
          isNull(prospectAiDiscoveryResults.sentToReviewAt),
        ),
      );
    sample.push({
      searchIdPrefix: String(s.id).slice(0, 8),
      workspacePrefix: String(s.workspaceUserId).slice(0, 8),
      businessType: s.businessType,
      location: s.location,
      radiusKm: s.radiusKm,
      status: s.status,
      resultCount: s.resultCount,
      createdAt: s.createdAt?.toISOString?.() ?? null,
      totalResults: Number(totalRow?.total ?? 0),
      unsentResults: Number(unsentRow?.total ?? 0),
    });
  }

  const [monthUsage] = await db
    .select({ total: count() })
    .from(prospectAiDiscoveryResults)
    .where(gte(prospectAiDiscoveryResults.createdAt, since));

  const miamiLike = sample.filter(
    (s) =>
      /miami/i.test(String(s.location || "")) ||
      /real.?estate/i.test(String(s.businessType || "")),
  );

  console.log(
    JSON.stringify(
      {
        monthUsage: Number(monthUsage?.total ?? 0),
        recentSearchCount: recent.length,
        miamiLike,
        sample,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
