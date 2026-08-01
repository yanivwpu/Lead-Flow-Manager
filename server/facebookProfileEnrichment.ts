/**
 * Post-ingest Facebook Messenger profile enrichment with bounded retry.
 * Never blocks inbound persistence; never logs raw tokens.
 *
 * Deduplication: at most one in-flight enrichment chain per workspace+PSID.
 * Rapid messages refresh the preferred messageMid on the active chain instead
 * of starting overlapping timers.
 *
 * Retry timers run after the webhook handler returns — schedule* only enqueues
 * work via a detached Promise and never awaits the retry delays on the request path.
 */

import {
  buildFacebookContactNamePatch,
  mergeFacebookDisplayNameSource,
  resolveFacebookDisplayNameSource,
  shouldLookupFacebookSenderProfile,
} from "@shared/facebookContactNaming";
import { fetchFacebookSenderProfile } from "./facebookSenderProfile";
import { notifyUser } from "./presence";
import { storage } from "./storage";
import { facebookTokenFingerprint } from "./metaFacebookReconnectDiag";

const DEFAULT_RETRY_DELAYS_MS = [0, 5_000, 25_000] as const; // 3 attempts max

type ContactRow = {
  id: string;
  name?: string | null;
  sourceDetails?: unknown;
  avatar?: string | null;
};

export type FacebookEnrichmentTestDeps = {
  getContact: (id: string) => Promise<ContactRow | undefined | null>;
  updateContact: (
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<ContactRow | undefined | null>;
  notifyUser: (userId: string, payload: Record<string, unknown>) => void;
  fetchProfile: typeof fetchFacebookSenderProfile;
  retryDelaysMs: readonly number[];
};

/** Active enrichment chains keyed by `${userId}:${senderPsid}`. */
const activeEnrichments = new Map<
  string,
  {
    preferredMessageMid: string | null;
    startedAt: number;
  }
>();

let testDeps: FacebookEnrichmentTestDeps | null = null;

function enrichmentKey(userId: string, senderPsid: string): string {
  return `${userId}:${senderPsid}`;
}

function logFbProfile(event: string, data: Record<string, unknown>): void {
  console.info(`[FB PROFILE] ${JSON.stringify({ event, ...data, ts: new Date().toISOString() })}`);
}

function deps(): FacebookEnrichmentTestDeps {
  if (testDeps) return testDeps;
  return {
    getContact: (id) => storage.getContact(id),
    updateContact: (id, patch) => storage.updateContact(id, patch),
    notifyUser: (userId, payload) => notifyUser(userId, payload),
    fetchProfile: fetchFacebookSenderProfile,
    retryDelaysMs: DEFAULT_RETRY_DELAYS_MS,
  };
}

export type FacebookEnrichmentParams = {
  userId: string;
  contactId: string;
  conversationId: string;
  senderPsid: string;
  pageId: string | null;
  pageAccessToken: string;
  messageMid: string | null;
};

/** Test helper — clears in-flight enrichment registry and injected deps. */
export function resetFacebookEnrichmentSchedulerForTests(): void {
  activeEnrichments.clear();
  testDeps = null;
}

/** Test helper — inject storage/notify/fetch/delays. */
export function setFacebookEnrichmentTestDeps(next: FacebookEnrichmentTestDeps | null): void {
  testDeps = next;
}

/** Test helper — whether a chain is currently scheduled/running. */
export function isFacebookEnrichmentActiveForTests(userId: string, senderPsid: string): boolean {
  return activeEnrichments.has(enrichmentKey(userId, senderPsid));
}

/** Test helper — preferred MID currently held by the active chain. */
export function getPreferredMessageMidForTests(
  userId: string,
  senderPsid: string,
): string | null | undefined {
  return activeEnrichments.get(enrichmentKey(userId, senderPsid))?.preferredMessageMid;
}

async function applyEnrichmentOnce(
  params: FacebookEnrichmentParams,
  attempt: number,
  messageMid: string | null,
): Promise<"updated" | "no_data" | "skipped" | "error"> {
  const d = deps();
  const contact = await d.getContact(params.contactId);
  if (!contact) return "error";

  const needs = shouldLookupFacebookSenderProfile({
    name: contact.name,
    senderPsid: params.senderPsid,
    sourceDetails: contact.sourceDetails,
  });
  if (!needs) {
    logFbProfile("enrichment_retry_skipped", {
      attempt,
      contactId: params.contactId,
      senderPsid: params.senderPsid,
      reason: "no_longer_needs_lookup",
      source: resolveFacebookDisplayNameSource({
        name: contact.name,
        senderPsid: params.senderPsid,
        sourceDetails: contact.sourceDetails,
      }),
    });
    return "skipped";
  }

  logFbProfile("enrichment_attempted", {
    attempt,
    senderPsid: params.senderPsid,
    receivingPageId: params.pageId,
    contactId: params.contactId,
    conversationId: params.conversationId,
    tokenPresent: Boolean(params.pageAccessToken),
    tokenFingerprint: facebookTokenFingerprint(params.pageAccessToken),
    messageMidPresent: Boolean(messageMid),
  });

  const profile = await d.fetchProfile(params.senderPsid, params.pageAccessToken, {
    pageIdForLog: params.pageId,
    userIdForLog: params.userId,
    contactIdForLog: params.contactId,
    conversationIdForLog: params.conversationId,
    messageMid,
  });

  const namePatch = buildFacebookContactNamePatch(
    contact.name,
    params.senderPsid,
    profile?.displayName,
    contact.sourceDetails,
  );
  const patch: Record<string, unknown> = { ...(namePatch || {}) };
  if (profile?.profilePic) {
    patch.avatar = profile.profilePic;
    patch.avatarFetchedAt = new Date();
  }

  // Ensure PSID provenance is stamped even when Meta returns nothing usable.
  if (
    !namePatch &&
    resolveFacebookDisplayNameSource({
      name: contact.name,
      senderPsid: params.senderPsid,
      sourceDetails: contact.sourceDetails,
    }) === "psid"
  ) {
    patch.sourceDetails = mergeFacebookDisplayNameSource(contact.sourceDetails, "psid");
  }

  // Avoid emitting contact_updated for provenance-only stamps.
  const meaningfulUpdate = Boolean(namePatch) || Boolean(profile?.profilePic);
  if (!meaningfulUpdate) {
    if (Object.keys(patch).length > 0) {
      await d.updateContact(params.contactId, patch).catch(() => {});
    }
    logFbProfile("enrichment_update_result", {
      attempt,
      contactId: params.contactId,
      conversationId: params.conversationId,
      senderPsid: params.senderPsid,
      success: false,
      reason: profile ? "no_patch_built" : "profile_lookup_empty",
      profileSource: profile?.source ?? null,
      contactUpdatedEmitted: false,
    });
    return "no_data";
  }

  const updated = await d.updateContact(params.contactId, patch);
  logFbProfile("enrichment_update_result", {
    attempt,
    contactId: params.contactId,
    conversationId: params.conversationId,
    senderPsid: params.senderPsid,
    receivingPageId: params.pageId,
    success: Boolean(updated),
    nameUpdated: Boolean(namePatch),
    avatarUpdated: Boolean(profile?.profilePic),
    profileSource: profile?.source ?? null,
    newName: namePatch?.name ?? null,
    contactUpdatedEmitted: Boolean(updated),
  });

  if (updated) {
    // Scoped to the owning WhachatCRM workspace user only.
    d.notifyUser(params.userId, {
      type: "contact_updated",
      contactId: params.contactId,
      conversationId: params.conversationId,
      reason: "facebook_profile_enrichment",
      nameUpdated: Boolean(namePatch),
      avatarUpdated: Boolean(profile?.profilePic),
    });
    return "updated";
  }
  return "error";
}

/**
 * Schedule enrichment with bounded backoff without blocking the Meta webhook ACK.
 * Dedupes concurrent schedules for the same workspace+PSID.
 * Returns immediately — retry timers do not keep the webhook request open.
 */
export function scheduleFacebookContactProfileEnrichment(
  params: FacebookEnrichmentParams,
): void {
  const key = enrichmentKey(params.userId, params.senderPsid);
  const existing = activeEnrichments.get(key);
  if (existing) {
    // Keep the newest inbound MID for the next attempt in the active chain.
    if (params.messageMid) {
      existing.preferredMessageMid = params.messageMid;
    }
    logFbProfile("enrichment_deduped", {
      contactId: params.contactId,
      senderPsid: params.senderPsid,
      userId: params.userId,
      preferredMessageMidPresent: Boolean(existing.preferredMessageMid),
      reason: "chain_already_active",
    });
    return;
  }

  activeEnrichments.set(key, {
    preferredMessageMid: params.messageMid,
    startedAt: Date.now(),
  });

  const delays = deps().retryDelaysMs;

  void (async () => {
    try {
      for (let i = 0; i < delays.length; i++) {
        const delay = delays[i] ?? 0;
        if (delay > 0) {
          logFbProfile("enrichment_retry_scheduled", {
            attempt: i + 1,
            delayMs: delay,
            contactId: params.contactId,
            senderPsid: params.senderPsid,
            queuedForRetry: true,
          });
          await new Promise((r) => setTimeout(r, delay));
        }
        const live = activeEnrichments.get(key);
        const midForAttempt = live?.preferredMessageMid ?? params.messageMid;
        try {
          const outcome = await applyEnrichmentOnce(params, i + 1, midForAttempt);
          if (outcome === "updated" || outcome === "skipped") return;
        } catch (err) {
          logFbProfile("enrichment_attempt_exception", {
            attempt: i + 1,
            contactId: params.contactId,
            senderPsid: params.senderPsid,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      logFbProfile("enrichment_retries_exhausted", {
        contactId: params.contactId,
        conversationId: params.conversationId,
        senderPsid: params.senderPsid,
        attempts: delays.length,
        queuedForRetry: false,
      });
    } finally {
      activeEnrichments.delete(key);
    }
  })().catch((err) => {
    activeEnrichments.delete(key);
    logFbProfile("enrichment_scheduler_exception", {
      contactId: params.contactId,
      senderPsid: params.senderPsid,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
