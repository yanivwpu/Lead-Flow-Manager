/**
 * READ-ONLY: expected post-migration discovery quota for current workspace.
 * Run: npx tsx scripts/verify-discovery-quota-post-migration.ts
 */
import "dotenv/config";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { db } from "../drizzle/db";
import {
  prospectAiDiscoveryResults,
  prospectAiDiscoveryUsageEvents,
  users,
} from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import {
  countMonthlyDiscoveryUsage,
  resolveDiscoveryQuotaPeriodStart,
} from "../server/prospectAI/prospectAIService";

async function main() {
  const wid = await resolveProspectImportDestinationUserId();
  const now = new Date();
  const period = await resolveDiscoveryQuotaPeriodStart(wid, now);

  const [user] = await db
    .select({
      currentPeriodStart: users.currentPeriodStart,
      currentPeriodEnd: users.currentPeriodEnd,
      billingPlan: users.billingPlan,
    })
    .from(users)
    .where(eq(users.id, wid))
    .limit(1);

  const [resultTotal] = await db
    .select({ total: count() })
    .from(prospectAiDiscoveryResults)
    .where(eq(prospectAiDiscoveryResults.workspaceUserId, wid));

  const [resultsInPeriod] = await db
    .select({ total: count() })
    .from(prospectAiDiscoveryResults)
    .where(
      and(
        eq(prospectAiDiscoveryResults.workspaceUserId, wid),
        gte(prospectAiDiscoveryResults.createdAt, period.periodStart),
      ),
    );

  // Simulated backfill SUM: one event per search with units=COUNT(results),
  // counted only when event.created_at (MIN result created_at) >= periodStart.
  const simulatedBackfill = await db.execute(sql`
    SELECT COALESCE(SUM(cnt), 0)::int AS total
    FROM (
      SELECT COUNT(*)::int AS cnt, MIN(created_at) AS event_at
      FROM prospect_ai_discovery_results
      WHERE workspace_user_id = ${wid}
      GROUP BY search_id
    ) s
    WHERE s.event_at >= ${period.periodStart}
  `);

  const liveUsed = await countMonthlyDiscoveryUsage(wid, now).catch((err) => ({
    error: err instanceof Error ? err.message : String(err),
  }));

  const [ledgerSum] = await db
    .select({
      total: sql<number>`coalesce(sum(${prospectAiDiscoveryUsageEvents.units}), 0)`,
    })
    .from(prospectAiDiscoveryUsageEvents)
    .where(
      and(
        eq(prospectAiDiscoveryUsageEvents.workspaceUserId, wid),
        gte(prospectAiDiscoveryUsageEvents.createdAt, period.periodStart),
      ),
    )
    .catch(() => [{ total: null }]);

  const out = {
    workspaceIdPrefix: wid.slice(0, 8),
    now: now.toISOString(),
    userBilling: {
      billingPlan: user?.billingPlan ?? null,
      currentPeriodStart: user?.currentPeriodStart ?? null,
      currentPeriodEnd: user?.currentPeriodEnd ?? null,
    },
    periodResolver: {
      source: period.source,
      periodStart: period.periodStart.toISOString(),
    },
    discoveryResults: {
      allTime: Number(resultTotal?.total || 0),
      inResolvedPeriod: Number(resultsInPeriod?.total || 0),
    },
    simulatedBackfillUnitsInPeriod: Number(
      (simulatedBackfill as { rows?: Array<{ total: number }> }).rows?.[0]?.total ??
        (simulatedBackfill as unknown as Array<{ total: number }>)?.[0]?.total ??
        0,
    ),
    liveLedgerSumInPeriod: ledgerSum?.total == null ? null : Number(ledgerSum.total),
    liveCountMonthlyDiscoveryUsage: liveUsed,
    expectedPostMigrationUsed:
      Number(
        (simulatedBackfill as { rows?: Array<{ total: number }> }).rows?.[0]?.total ??
          (simulatedBackfill as unknown as Array<{ total: number }>)?.[0]?.total ??
          0,
      ) || Number(resultsInPeriod?.total || 0),
  };

  writeFileSync("verify-discovery-quota-out.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
