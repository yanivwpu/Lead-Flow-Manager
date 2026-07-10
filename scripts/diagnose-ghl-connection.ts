/**
 * Inspect GHL Marketplace vs OAuth integration linkage (no tokens printed).
 * Run: npx tsx scripts/diagnose-ghl-connection.ts
 */
import "dotenv/config";
import { summarizeGhlConnectionState } from "../server/ghlConnectionDiagnostics";

async function main() {
  const summary = await summarizeGhlConnectionState();

  console.log("\n=== GHL connection diagnostics ===\n");

  console.log("integrations table (type=gohighlevel):");
  console.log(JSON.stringify(summary.integrationsTable, null, 2));

  console.log("\nghl_marketplace_installs table:");
  console.log(JSON.stringify(summary.marketplaceInstallsTable, null, 2));

  console.log("\nProspect Import eligibility (same source as /api/growth-tools/prospect-import/ghl/locations):");
  console.log(JSON.stringify(summary.prospectImport, null, 2));

  if (summary.likelyIssue) {
    console.log("\nLikely issue:");
    console.log(summary.likelyIssue);
  }

  console.log("\nIntegrations page uses GET /api/ext/connection-status (per logged-in userId).");
  console.log("Prospect Import uses listGhlInstallationsForAdmin() — any workspace with integrationId + tokens.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
