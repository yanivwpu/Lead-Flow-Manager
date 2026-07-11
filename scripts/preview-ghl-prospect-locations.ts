/**
 * Preview Prospect Import GHL locations (no tokens printed).
 * Run: npx tsx scripts/preview-ghl-prospect-locations.ts
 */
import "dotenv/config";
import { listGhlProspectLocations } from "../server/prospectImport/providers/ghlProspectProvider";

async function main() {
  const locations = await listGhlProspectLocations();
  console.log(JSON.stringify({ count: locations.length, locations }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
