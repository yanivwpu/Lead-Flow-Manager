/**
 * Verify inventoryDb listSourcesForUser after db import fix.
 * Run: npx tsx tests/verify-inventory-sources-db.ts [userId]
 */
import assert from "node:assert/strict";
import { listInventorySources } from "../server/inventory/inventoryDb";
import { listSourcesForUser } from "../server/inventory/inventorySourceService";

const DEFAULT_USER_ID = "51f64011-eb3a-48a4-bb10-031abd3c0cdc";

async function main() {
  const userId = process.argv[2] || DEFAULT_USER_ID;
  console.log("verify-inventory-sources-db for userId:", userId);

  let threwDbUndefined = false;
  try {
    await listInventorySources(userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("db is not defined")) {
      threwDbUndefined = true;
    } else {
      throw e;
    }
  }
  assert.equal(threwDbUndefined, false, "listInventorySources must not throw db is not defined");

  const rows = await listInventorySources(userId);
  console.log("  listInventorySources OK, raw rows:", rows.length);

  const sources = await listSourcesForUser(userId);
  console.log("  listSourcesForUser OK, public sources:", sources.length);

  for (const s of sources) {
    console.log(
      "  source:",
      JSON.stringify({
        id: s.id,
        provider: s.provider,
        connectionStatus: s.connectionStatus,
        listingCount: s.listingCount,
        totalSynced: s.inventoryStats?.totalSynced,
        isActive: s.isActive,
      }),
    );
  }

  const bridge = sources.find((s) => s.provider === "bridge_interactive");
  if (bridge) {
    assert.equal(bridge.connectionStatus, "connected", "Bridge source should be connected");
    assert.ok(bridge.listingCount >= 18_000, "Bridge listingCount should be ~18845");
    console.log("  Bridge source verified: connected, listingCount =", bridge.listingCount);
  } else if (sources.length === 0) {
    console.log("  WARN: no sources for this user in current DATABASE_URL (dev DB?)");
  }

  console.log("\nAll checks passed.");
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
