/**
 * Trigger inventory sync for all connected sources (compliance backfill).
 * Run: npx tsx scripts/resync-all-inventory-sources.ts
 */
import { listAllConnectedInventorySourceIds } from "../server/inventory/inventoryComplianceDiagnostics";
import { startInventorySourceSync } from "../server/inventory/inventorySyncService";

async function main() {
  const sources = await listAllConnectedInventorySourceIds();
  if (sources.length === 0) {
    console.log("No connected inventory sources found.");
    return;
  }

  console.log(`Found ${sources.length} connected source(s). Starting sync…`);
  let started = 0;
  let skipped = 0;

  for (const source of sources) {
    const outcome = await startInventorySourceSync(source.userId, source.id);
    if (outcome.started) {
      started += 1;
      console.log(`  started: ${source.provider} (${source.id}) user=${source.userId}`);
    } else {
      skipped += 1;
      console.log(`  skipped: ${source.provider} (${source.id}) reason=${outcome.reason}`);
    }
  }

  console.log(`\nDone. started=${started} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
