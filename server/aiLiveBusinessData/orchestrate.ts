/**
 * AI Brain Live Business Data orchestration for one reply turn.
 * Detect intent → invoke relevant providers → retrieve only needed records → compose prompt block.
 */

import {
  buildLiveBusinessDataPromptBlock,
  LIVE_BUSINESS_DATA_PROMPT_RECORD_LIMIT,
  resolveLiveBusinessDataDecision,
  type LiveBusinessDataDecision,
  type LiveBusinessDataProviderId,
  type LiveBusinessDataRecord,
} from "@shared/aiLiveBusinessData";
import { getLiveBusinessDataProvider } from "./registry";

export type LiveBusinessDataTurnResult = {
  decision: LiveBusinessDataDecision;
  records: LiveBusinessDataRecord[];
  promptBlock: string;
  /** True when Business Packages supplied structured package rows for this turn. */
  usedBusinessPackages: boolean;
};

/**
 * Resolve structured connector results for the current customer message.
 * Safe to call on every suggestReply — returns empty when no live provider is needed.
 */
export async function resolveLiveBusinessDataForTurn(input: {
  userId: string;
  message: string;
  subIntents?: string[] | null;
  decision?: LiveBusinessDataDecision;
}): Promise<LiveBusinessDataTurnResult> {
  const decision =
    input.decision ??
    resolveLiveBusinessDataDecision({
      message: input.message,
      subIntents: input.subIntents,
    });

  if (!decision.needsLiveBusinessData || decision.providerIds.length === 0) {
    return {
      decision,
      records: [],
      promptBlock: "",
      usedBusinessPackages: false,
    };
  }

  const records: LiveBusinessDataRecord[] = [];
  const perProviderLimit = Math.max(
    1,
    Math.floor(LIVE_BUSINESS_DATA_PROMPT_RECORD_LIMIT / decision.providerIds.length),
  );

  for (const providerId of decision.providerIds) {
    const provider = getLiveBusinessDataProvider(providerId);
    if (!provider) continue;
    try {
      const rows = await provider.query({
        userId: input.userId,
        message: input.message,
        subIntents: input.subIntents,
        limit: perProviderLimit,
      });
      for (const row of rows) {
        if (records.length >= LIVE_BUSINESS_DATA_PROMPT_RECORD_LIMIT) break;
        records.push(row);
      }
    } catch (err) {
      console.warn(
        "[LiveBusinessData] provider query failed",
        providerId,
        err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      );
    }
  }

  const block = buildLiveBusinessDataPromptBlock(records);
  return {
    decision,
    records,
    promptBlock: block.text,
    usedBusinessPackages: records.some((r) => r.providerId === "businessPackages"),
  };
}

export function providerIdsInvoked(
  result: LiveBusinessDataTurnResult,
): LiveBusinessDataProviderId[] {
  return [...new Set(result.records.map((r) => r.providerId))];
}
