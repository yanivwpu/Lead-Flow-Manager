/**
 * One-time GHL Marketplace raw_payload sanitation.
 *
 * Default is dry-run (read-only). Apply requires BOTH:
 *   --apply
 *   --confirm=SANITIZE_GHL_RAW_PAYLOAD
 *     or SANITIZE_GHL_RAW_PAYLOAD_CONFIRM=SANITIZE_GHL_RAW_PAYLOAD
 *
 * Updates only ghl_marketplace_installs.raw_payload. Does not touch encrypted
 * integration credentials, users, plans, entitlements, OAuth state, or ownership.
 * Not invoked from startup patches or deployment.
 *
 * Dry-run:
 *   npx tsx scripts/sanitize-ghl-marketplace-raw-payload.ts
 *
 * Apply — DO NOT RUN YET:
 *   npx tsx scripts/sanitize-ghl-marketplace-raw-payload.ts --apply --confirm=SANITIZE_GHL_RAW_PAYLOAD
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { ghlMarketplaceInstalls } from "../shared/schema";
import {
  formatGhlMarketplaceRawPayloadRepairReport,
  parseSanitizeGhlRawPayloadCli,
  planGhlMarketplaceRawPayloadSanitation,
  sanitizedGhlMarketplaceRawPayloadForRepair,
} from "../shared/ghlMarketplaceRawPayloadRepair";

async function main() {
  const cli = parseSanitizeGhlRawPayloadCli(process.argv.slice(2));
  if (cli.apply && !cli.authorized) {
    console.error(
      "Apply refused: pass --apply together with --confirm=SANITIZE_GHL_RAW_PAYLOAD (or SANITIZE_GHL_RAW_PAYLOAD_CONFIRM).",
    );
    process.exit(2);
  }

  const rows = await db
    .select({
      id: ghlMarketplaceInstalls.id,
      source: ghlMarketplaceInstalls.source,
      installationStatus: ghlMarketplaceInstalls.installationStatus,
      lastEventType: ghlMarketplaceInstalls.lastEventType,
      rawPayload: ghlMarketplaceInstalls.rawPayload,
    })
    .from(ghlMarketplaceInstalls);

  const plans = rows.map((row) =>
    planGhlMarketplaceRawPayloadSanitation({
      id: row.id,
      source: row.source,
      installationStatus: row.installationStatus,
      lastEventType: row.lastEventType,
      rawPayload: row.rawPayload,
    }),
  );
  const mode = cli.apply && cli.authorized ? "apply" : "dry-run";
  console.log(formatGhlMarketplaceRawPayloadRepairReport(plans, mode));

  if (mode === "dry-run") {
    console.log("dry-run complete: no writes");
    return;
  }

  const affected = plans.filter((p) => p.needsUpdate);
  if (affected.length === 0) {
    console.log("apply complete: 0 rows updated");
    return;
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  await db.transaction(async (tx) => {
    for (const plan of affected) {
      const row = byId.get(plan.id);
      if (!row) continue;
      await tx
        .update(ghlMarketplaceInstalls)
        .set({
          rawPayload: sanitizedGhlMarketplaceRawPayloadForRepair(row.rawPayload),
        })
        .where(eq(ghlMarketplaceInstalls.id, plan.id));
    }
  });
  console.log(`apply complete: ${affected.length} rows updated`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : "sanitize failed");
    process.exit(1);
  });
