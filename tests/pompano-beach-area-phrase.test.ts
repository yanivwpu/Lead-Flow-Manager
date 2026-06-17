/**
 * Pompano Beach area phrase + geo preference chips — exact Susu inbound regression.
 * Run: ALLOW_DB_TEST_WRITES=1 npx tsx tests/pompano-beach-area-phrase.test.ts
 */
import assert from "node:assert/strict";
import { prepareDbTestEnvironment, teardownTestUser } from "./helpers/dbTestGuard.js";

prepareDbTestEnvironment("pompano-beach-area-phrase.test.ts");

import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { parseBuyerSearchCommand } from "../shared/buyerSearchCommand";
import { buildBuyerPreferenceSearchChips } from "../shared/buyerPreferenceDisplay";
import {
  snapshotPatchTraceFields,
  snapshotProfileTraceFields,
  buildPersistedProfileSnapshotForDiagnostics,
} from "../shared/buyerSearchCommandDebug";
import { extractBuyerMatchCriteria } from "../shared/inventory/inventoryMatchScoring";
import { traceBuyerMatchingPipeline } from "../shared/buyerMatchingTrace";

const MSG1 =
  "I'm looking for SFH rental in the Pompano Beach area close to the beach at least 3 bedrooms 2 bath up to $7k a mo";
const MSG2 = "Do you have any SFH rental up to 10k?";

const { storage } = await import("../server/storage");
const { processInboundBuyerPreferencesOnMessage } = await import("../server/buyerPreferenceService");

function assertChipValues(chips: ReturnType<typeof buildBuyerPreferenceSearchChips>, expected: string[]) {
  const values = chips.map((c) => c.value);
  for (const label of expected) {
    assert(
      values.some((v) => v.toLowerCase() === label.toLowerCase()),
      `missing chip "${label}" in [${values.join(", ")}]`,
    );
  }
  const closeToBeachCount = values.filter((v) => /close to beach/i.test(v)).length;
  assert.equal(closeToBeachCount, 1, `Close to beach should appear once (got ${closeToBeachCount})`);
}

async function main() {
  const patch1 = heuristicPatchFromInboundText(MSG1);
  assert(
    patch1.targetAreas?.value?.some((a) => /pompano beach/i.test(a)),
    `Pompano in targetAreas (got ${patch1.targetAreas?.value?.join()})`,
  );
  assert(
    !patch1.targetAreas?.value?.some((a) => /close to beach/i.test(a)),
    "close to beach not in targetAreas",
  );
  assert(
    patch1.geoPreferences?.value?.some((a) => /close to beach/i.test(a)),
    "close to beach in geoPreferences",
  );

  let userId: string | undefined;
  try {
    const user = await storage.createUser({
      email: `pompano-phrase-${Date.now()}@test.com`,
      password: "test123",
      name: "Pompano Phrase Test",
    });
    userId = user.id;

    const contact = await storage.createContact({
      userId: user.id,
      name: "Pompano Phrase Contact",
      phone: `+1555${String(Date.now()).slice(-7)}`,
      primaryChannel: "whatsapp",
      customFields: { leadType: "buyer" },
    });

    const saved1 = await processInboundBuyerPreferencesOnMessage({
      userId: user.id,
      contact: (await storage.getContact(contact.id))!,
      conversationId: "conv-phrase",
      messageId: `msg-phrase-1-${Date.now()}`,
      inboundText: MSG1,
      triggerSource: "test",
    });
    assert(saved1);

    const command1 = parseBuyerSearchCommand(MSG1, saved1);
    const merged1 = mergeBuyerPreferenceProfile(saved1, command1.patch);
    const criteria1 = extractBuyerMatchCriteria(saved1);
    const matching1 = buildPersistedProfileSnapshotForDiagnostics(saved1, criteria1);
    const chips1 = buildBuyerPreferenceSearchChips(saved1);

    const trace1 = {
      parsedPatch: snapshotPatchTraceFields(command1.patch),
      mergedProfile: snapshotProfileTraceFields(merged1),
      savedProfile: snapshotProfileTraceFields(saved1),
      matchingProfile: matching1,
      displayedChips: chips1.map((c) => ({ id: c.id, label: c.label, value: c.value })),
    };
    console.log("msg1 BuyerMatchingTrace layers:", JSON.stringify(trace1, null, 2));

    assert(matching1.areas.some((a) => /pompano beach/i.test(a)));
    assert(matching1.geoPreferences.some((a) => /close to beach/i.test(a)));
    assertChipValues(chips1, ["Rent", "Pompano Beach", "Close to beach", "Up to $7k/mo", "House", "3 bed", "2 bath"]);

    const saved2 = await processInboundBuyerPreferencesOnMessage({
      userId: user.id,
      contact: (await storage.getContact(contact.id))!,
      conversationId: "conv-phrase",
      messageId: `msg-phrase-2-${Date.now()}`,
      inboundText: MSG2,
      triggerSource: "test",
    });
    assert(saved2);

    const command2 = parseBuyerSearchCommand(MSG2, saved1);
    const merged2 = mergeBuyerPreferenceProfile(saved1, command2.patch);
    const criteria2 = extractBuyerMatchCriteria(saved2);
    const matching2 = buildPersistedProfileSnapshotForDiagnostics(saved2, criteria2);
    const chips2 = buildBuyerPreferenceSearchChips(saved2);

    traceBuyerMatchingPipeline({
      traceId: `phrase:${contact.id}`,
      contactId: contact.id,
      source: "pompano-beach-area-phrase.test",
      message: MSG2,
      parsedPatch: command2.patch,
      mergedProfile: merged2,
      savedProfile: saved2,
    });

    console.log("msg2 BuyerMatchingTrace layers:", JSON.stringify({
      parsedPatch: snapshotPatchTraceFields(command2.patch),
      mergedProfile: snapshotProfileTraceFields(merged2),
      savedProfile: snapshotProfileTraceFields(saved2),
      matchingProfile: matching2,
      displayedChips: chips2.map((c) => ({ id: c.id, label: c.label, value: c.value })),
    }, null, 2));

    assert.equal(saved2.priceMax?.value, 10_000);
    assert(matching2.areas.some((a) => /pompano beach/i.test(a)));
    assert(matching2.geoPreferences.some((a) => /close to beach/i.test(a)));
    assertChipValues(chips2, ["Rent", "Pompano Beach", "Close to beach", "Up to $10k/mo", "House", "3 bed", "2 bath"]);

    console.log("pompano-beach-area-phrase.test.ts: OK");
  } finally {
    await teardownTestUser(userId, "pompano-beach-area-phrase.test.ts");
  }
}

await main();
