/**
 * Static verification of Copilot inventory UI branches.
 * Run: npx tsx tests/verify-inventory-copilot-ui.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function main() {
  const inbox = readFileSync(
    join(process.cwd(), "client", "src", "components", "InboxLeadDetailsPanel.tsx"),
    "utf8",
  );
  const unavailable = readFileSync(
    join(
      process.cwd(),
      "client",
      "src",
      "components",
      "inventory",
      "CopilotInventorySourcesUnavailable.tsx",
    ),
    "utf8",
  );
  const empty = readFileSync(
    join(process.cwd(), "client", "src", "components", "inventory", "CopilotInventoryEmptyState.tsx"),
    "utf8",
  );

  assert.ok(
    unavailable.includes("Inventory connection status unavailable. Please retry."),
    "unavailable message present",
  );
  assert.ok(
    inbox.includes("inventorySourcesError &&") &&
      inbox.includes("CopilotInventorySourcesUnavailable"),
    "error branch shows unavailable component",
  );
  assert.ok(
    inbox.includes("!inventorySourcesError") &&
      inbox.includes("!inventoryConnected && <CopilotInventoryEmptyState"),
    "connect card gated on success + disconnected",
  );
  assert.ok(
    inbox.includes("MatchingListingsPanel") &&
      inbox.includes("!inventorySourcesError") &&
      inbox.includes("inventoryConnected || inventorySourcesLoading"),
    "matching panel when connected or loading, not on error",
  );
  assert.ok(
    empty.includes("Connect inventory to enable matching listings"),
    "connect card copy unchanged",
  );
  assert.ok(
    !inbox.includes("data: inventorySources = []"),
    "no default empty array on sources query",
  );

  console.log("verify-inventory-copilot-ui tests");
  console.log("  sources error -> unavailable message: OK");
  console.log("  sources 200 connected -> MatchingListingsPanel path: OK");
  console.log("  sources 200 [] -> CopilotInventoryEmptyState path: OK");
  console.log("\nAll tests passed.");
}

main();
