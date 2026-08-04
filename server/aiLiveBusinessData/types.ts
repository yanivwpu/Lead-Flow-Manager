/**
 * Live Business Data provider contract.
 * Providers expose typed query APIs — they are never indexed as Knowledge Source documents.
 */

import type {
  LiveBusinessDataProviderId,
  LiveBusinessDataProviderStatus,
  LiveBusinessDataRecord,
} from "@shared/aiLiveBusinessData";

export type LiveBusinessDataQueryContext = {
  userId: string;
  message: string;
  subIntents?: string[] | null;
  /** Optional name / id hint extracted from the message. */
  hint?: string | null;
  /** Max structured rows to return for this turn (prompt stuffing guard). */
  limit?: number;
};

export type LiveBusinessDataProviderStatusResult = {
  status: LiveBusinessDataProviderStatus;
  detail: string | null;
};

export interface LiveBusinessDataProvider {
  id: LiveBusinessDataProviderId;
  /** Merchant-facing connection / readiness for the AI Brain registry UI. */
  getStatus(userId: string): Promise<LiveBusinessDataProviderStatusResult>;
  /**
   * Retrieve only the structured records needed for this turn.
   * Must never return a full catalog dump.
   */
  query(ctx: LiveBusinessDataQueryContext): Promise<LiveBusinessDataRecord[]>;
}
