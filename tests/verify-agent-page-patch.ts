/**
 * Integration check: agent page settings PATCH DB path.
 * Run: npx tsx tests/verify-agent-page-patch.ts [userId]
 */
import assert from "node:assert/strict";
import { patchAgentPageSettings } from "../server/agentPage/agentPageDb";

const DEFAULT_USER_ID = "51f64011-eb3a-48a4-bb10-031abd3c0cdc";

async function main() {
  const userId = process.argv[2] || DEFAULT_USER_ID;
  console.log("verify-agent-page-patch for userId:", userId);

  const enabled = await patchAgentPageSettings(userId, { agentPageEnabled: true });
  assert.equal(enabled?.agentPageEnabled, true, "enable page saves");
  console.log("  enable page: OK", enabled?.agentPageSlug ?? "(no slug)");

  const customBio = await patchAgentPageSettings(userId, {
    agentPageUseCustomBio: true,
    agentPageBio: "Integration test custom bio",
  });
  assert.equal(customBio?.agentPageUseCustomBio, true, "custom bio flag saves");
  assert.equal(customBio?.agentPageBio, "Integration test custom bio", "custom bio text saves");
  console.log("  custom bio toggle: OK");

  const disabled = await patchAgentPageSettings(userId, {
    agentPageUseCustomBio: false,
    agentPageBio: null,
  });
  assert.equal(disabled?.agentPageUseCustomBio, false, "custom bio disable saves");
  assert.equal(disabled?.agentPageBio, null, "custom bio cleared");
  console.log("  disable custom bio: OK");

  console.log("\nAll checks passed.");
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
