/**
 * Replay BuyerMatchingTrace for a specific message + prior profile.
 * Run: npx tsx scripts/replay-buyer-trace.ts
 */
import type { BuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { normalizeBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { parseBuyerSearchCommand, isFullReplacementSearch } from "../shared/buyerSearchCommand";
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { extractBuyerMatchCriteria } from "../shared/inventory/inventoryMatchScoring";
import {
  buildPersistedProfileSnapshotForDiagnostics,
  snapshotPatchTraceFields,
  snapshotProfileTraceFields,
} from "../shared/buyerSearchCommandDebug";
import { hasInventoryPreferenceSignals } from "../shared/buyerPreferenceInventorySignals";

const TRACE_ID =
  "45671a0d-2d96-4d1e-aaa4-4f05f0ec86c5:274ba9ac-e80c-4dc0-bebe-878a45456c5d";
const MESSAGE = "show me 3/2 apparent for sale up to 1 mil";
const NOW = new Date().toISOString();

function field<T>(value: T) {
  return { value, source: "explicit" as const, confidence: 1, updatedAt: NOW };
}

const previousProfile: BuyerPreferenceProfile = normalizeBuyerPreferenceProfile({
  schemaVersion: 1,
  profileStatus: "partial",
  transactionIntent: field("rent"),
  priceMax: field(4000),
  propertyTypes: field(["house"]),
});

const heuristicOnly = heuristicPatchFromInboundText(MESSAGE);
const command = parseBuyerSearchCommand(MESSAGE, previousProfile);
const fullReplacement = isFullReplacementSearch(MESSAGE, command.patch, previousProfile);

const mergeOptions =
  command.replaceArrayFields?.length ||
  command.clearUnmentionedHardGates ||
  command.patch
    ? {
        replaceArrayFields: command.replaceArrayFields,
        clearUnmentionedHardGates: command.clearUnmentionedHardGates,
        currentMessagePatch: command.clearUnmentionedHardGates ? command.patch : undefined,
      }
    : undefined;

const mergedProfile = mergeBuyerPreferenceProfile(
  previousProfile,
  command.patch,
  { lastExtractedAt: NOW, lastInboundAt: NOW },
  mergeOptions,
);

const criteria = extractBuyerMatchCriteria(mergedProfile);
const matchingProfile = buildPersistedProfileSnapshotForDiagnostics(mergedProfile, criteria);

const pipeline = {
  tag: "[BuyerMatchingTrace]",
  event: "replay",
  traceId: TRACE_ID,
  contactId: "45671a0d-2d96-4d1e-aaa4-4f05f0ec86c5",
  messageId: "274ba9ac-e80c-4dc0-bebe-878a45456c5d",
  message: MESSAGE,
  diagnostics: {
    hasInventoryPreferenceSignals: hasInventoryPreferenceSignals(MESSAGE),
    commandKind: command.kind,
    skipProfileUpdate: command.skipProfileUpdate,
    clearUnmentionedHardGates: command.clearUnmentionedHardGates,
    isFullReplacementSearch: fullReplacement,
    patchFieldCount: Object.keys(command.patch).length,
    replaceArrayFields: command.replaceArrayFields,
    lockedFields: command.lockedFields,
    signals: command.signals,
    explanation: command.explanation,
  },
  previousProfile: snapshotProfileTraceFields(previousProfile),
  parsedPatch: snapshotPatchTraceFields(command.patch),
  heuristicPatchOnly: snapshotPatchTraceFields(heuristicOnly),
  mergedProfile: snapshotProfileTraceFields(mergedProfile),
  savedProfile: snapshotProfileTraceFields(previousProfile),
  matchingProfile,
  note:
    "savedProfile replayed as previousProfile because GET buyer-preferences is read-only; async extraction may not have completed before GET.",
};

console.log(JSON.stringify(pipeline, null, 2));
