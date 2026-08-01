/**
 * Facebook profile enrichment safety review coverage.
 * Run: npx tsx tests/facebook-profile-enrichment-safety.test.ts
 */
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildFacebookContactNamePatch,
  mergeFacebookDisplayNameSource,
  shouldLookupFacebookSenderProfile,
} from "../shared/facebookContactNaming";
import { fetchFacebookSenderProfile } from "../server/facebookSenderProfile";
import {
  getPreferredMessageMidForTests,
  isFacebookEnrichmentActiveForTests,
  resetFacebookEnrichmentSchedulerForTests,
  scheduleFacebookContactProfileEnrichment,
  setFacebookEnrichmentTestDeps,
} from "../server/facebookProfileEnrichment";

const PSID = "27842272592092598";
const MID_A = "m_message_a";
const MID_B = "m_message_b";
const PAGE_TOKEN = "PAGE_TOKEN_TEST_VALUE_NOT_REAL";
const USER_ID = "user-workspace-1";
const CONTACT_ID = "contact-1";
const CONV_ID = "conv-1";
const LOG_PATH = join(process.cwd(), "debug-91ef88.log");

function dbg(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
): void {
  // #region agent log
  appendFileSync(
    LOG_PATH,
    JSON.stringify({
      sessionId: "91ef88",
      runId: "safety-review",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }) + "\n",
  );
  // #endregion
}

function run(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
}

async function withMockedFetch(
  handler: (url: string) => { status: number; body: unknown },
  fn: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const { status, body } = handler(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("waitUntil timeout"));
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

await run("User Profile succeeds", async () => {
  await withMockedFetch((url) => {
    if (url.includes(`/${PSID}?`)) {
      return {
        status: 200,
        body: {
          id: PSID,
          name: "Susu Sahbak",
          first_name: "Susu",
          last_name: "Sahbak",
          profile_pic: "https://example.com/a.jpg",
        },
      };
    }
    throw new Error("unexpected url " + url);
  }, async () => {
    const profile = await fetchFacebookSenderProfile(PSID, PAGE_TOKEN, { messageMid: MID_A });
    assert.equal(profile?.displayName, "Susu Sahbak");
    assert.equal(profile?.source, "user_profile_api");
    assert.equal(profile?.profilePic, "https://example.com/a.jpg");
    dbg("H1", "facebook-profile-enrichment-safety.test.ts:user-profile", "User Profile success", {
      source: profile?.source,
    });
  });
});

await run("User Profile 100/33, MID/from succeeds with matching from.id", async () => {
  await withMockedFetch((url) => {
    if (url.includes(`/${PSID}?`)) {
      return {
        status: 400,
        body: {
          error: {
            code: 100,
            error_subcode: 33,
            type: "GraphMethodException",
            message: "Unsupported get request",
            fbtrace_id: "T",
          },
        },
      };
    }
    if (url.includes(`/${MID_A}?`)) {
      return { status: 200, body: { from: { name: "Samantha Parezo", id: PSID }, id: MID_A } };
    }
    return { status: 500, body: {} };
  }, async () => {
    const profile = await fetchFacebookSenderProfile(PSID, PAGE_TOKEN, { messageMid: MID_A });
    assert.equal(profile?.displayName, "Samantha Parezo");
    assert.equal(profile?.source, "message_from_api");
    dbg("H2", "facebook-profile-enrichment-safety.test.ts:mid-from", "MID/from success", {
      source: profile?.source,
      mid: MID_A,
    });
  });
});

await run("MID/from without from.id is rejected (not trusted)", async () => {
  await withMockedFetch((url) => {
    if (url.includes(`/${PSID}?`)) {
      return {
        status: 400,
        body: { error: { code: 100, error_subcode: 33, type: "GraphMethodException", message: "denied" } },
      };
    }
    if (url.includes(`/${MID_A}?`)) {
      return { status: 200, body: { from: { name: "No Id Person" }, id: MID_A } };
    }
    return { status: 500, body: {} };
  }, async () => {
    const profile = await fetchFacebookSenderProfile(PSID, PAGE_TOKEN, { messageMid: MID_A });
    assert.equal(profile, null);
    dbg("H3", "facebook-profile-enrichment-safety.test.ts:no-from-id", "Absent from.id rejected", {
      accepted: false,
    });
  });
});

await run("MID/from sender ID mismatch is rejected", async () => {
  await withMockedFetch((url) => {
    if (url.includes(`/${PSID}?`)) {
      return {
        status: 400,
        body: { error: { code: 100, error_subcode: 33, type: "GraphMethodException", message: "denied" } },
      };
    }
    if (url.includes(`/${MID_A}?`)) {
      return {
        status: 200,
        body: { from: { name: "Wrong Person", id: "99999999999999999" }, id: MID_A },
      };
    }
    return { status: 500, body: {} };
  }, async () => {
    const profile = await fetchFacebookSenderProfile(PSID, PAGE_TOKEN, { messageMid: MID_A });
    assert.equal(profile, null);
    dbg("H2", "facebook-profile-enrichment-safety.test.ts:mismatch", "from.id mismatch rejected", {
      accepted: false,
    });
  });
});

await run("manual name remains protected", () => {
  const details = mergeFacebookDisplayNameSource({}, "manual");
  assert.equal(
    shouldLookupFacebookSenderProfile({
      name: "Preferred Name",
      senderPsid: PSID,
      sourceDetails: details,
    }),
    false,
  );
  assert.equal(
    buildFacebookContactNamePatch("Preferred Name", PSID, "Samantha Parezo", details),
    null,
  );
  dbg("H10", "facebook-profile-enrichment-safety.test.ts:manual", "Manual name protected", {
    lookup: false,
  });
});

await run("rapid schedules dedupe; preferred MID refreshed; no overlapping chains", async () => {
  resetFacebookEnrichmentSchedulerForTests();
  let fetchCalls = 0;
  let contact = {
    id: CONTACT_ID,
    name: PSID,
    sourceDetails: mergeFacebookDisplayNameSource({}, "psid"),
  };
  const notifyCalls: Array<{ userId: string; payload: Record<string, unknown> }> = [];

  setFacebookEnrichmentTestDeps({
    getContact: async () => contact,
    updateContact: async (_id, patch) => {
      contact = { ...contact, ...patch, sourceDetails: (patch.sourceDetails as any) || contact.sourceDetails };
      return contact;
    },
    notifyUser: (userId, payload) => notifyCalls.push({ userId, payload }),
    fetchProfile: async (_psid, _token, opts) => {
      fetchCalls += 1;
      // First attempt fails; later attempt uses refreshed MID_B.
      if ((opts?.messageMid || "") === MID_B && fetchCalls >= 2) {
        return {
          displayName: "Samantha Parezo",
          name: "Samantha Parezo",
          firstName: null,
          lastName: null,
          profilePic: null,
          fieldsReturned: ["from.name", "from.id"],
          source: "message_from_api",
        };
      }
      return null;
    },
    retryDelaysMs: [0, 30, 30],
  });

  const scheduleStart = Date.now();
  scheduleFacebookContactProfileEnrichment({
    userId: USER_ID,
    contactId: CONTACT_ID,
    conversationId: CONV_ID,
    senderPsid: PSID,
    pageId: "1257286427457815",
    pageAccessToken: PAGE_TOKEN,
    messageMid: MID_A,
  });
  const scheduleReturnedMs = Date.now() - scheduleStart;
  assert.ok(scheduleReturnedMs < 20, "schedule must return immediately (webhook not held)");
  assert.equal(isFacebookEnrichmentActiveForTests(USER_ID, PSID), true);

  scheduleFacebookContactProfileEnrichment({
    userId: USER_ID,
    contactId: CONTACT_ID,
    conversationId: CONV_ID,
    senderPsid: PSID,
    pageId: "1257286427457815",
    pageAccessToken: PAGE_TOKEN,
    messageMid: MID_B,
  });
  scheduleFacebookContactProfileEnrichment({
    userId: USER_ID,
    contactId: CONTACT_ID,
    conversationId: CONV_ID,
    senderPsid: PSID,
    pageId: "1257286427457815",
    pageAccessToken: PAGE_TOKEN,
    messageMid: MID_B,
  });

  assert.equal(getPreferredMessageMidForTests(USER_ID, PSID), MID_B);
  assert.equal(isFacebookEnrichmentActiveForTests(USER_ID, PSID), true);

  await waitUntil(() => notifyCalls.length === 1, 2000);
  assert.equal(notifyCalls.length, 1);
  assert.equal(notifyCalls[0]!.userId, USER_ID);
  assert.equal(notifyCalls[0]!.payload.type, "contact_updated");
  assert.equal(notifyCalls[0]!.payload.contactId, CONTACT_ID);
  assert.equal(contact.name, "Samantha Parezo");
  // One chain: a few attempts, not 3× chains.
  assert.ok(fetchCalls >= 2 && fetchCalls <= 3, `fetchCalls=${fetchCalls}`);

  dbg("H5", "facebook-profile-enrichment-safety.test.ts:dedupe", "Dedupe + contact_updated", {
    fetchCalls,
    notifyCount: notifyCalls.length,
    preferredMid: MID_B,
    scheduleReturnedMs,
    contactName: contact.name,
  });

  await waitUntil(() => !isFacebookEnrichmentActiveForTests(USER_ID, PSID), 2000);
  resetFacebookEnrichmentSchedulerForTests();
});

await run("both endpoints fail — bounded retries then exhaust", async () => {
  resetFacebookEnrichmentSchedulerForTests();
  let fetchCalls = 0;
  const notifyCalls: Array<unknown> = [];
  const contact = {
    id: CONTACT_ID,
    name: PSID,
    sourceDetails: mergeFacebookDisplayNameSource({}, "psid"),
  };

  setFacebookEnrichmentTestDeps({
    getContact: async () => contact,
    updateContact: async () => contact,
    notifyUser: (_u, p) => notifyCalls.push(p),
    fetchProfile: async () => {
      fetchCalls += 1;
      return null;
    },
    retryDelaysMs: [0, 15, 15],
  });

  scheduleFacebookContactProfileEnrichment({
    userId: USER_ID,
    contactId: CONTACT_ID,
    conversationId: CONV_ID,
    senderPsid: PSID,
    pageId: "1257286427457815",
    pageAccessToken: PAGE_TOKEN,
    messageMid: MID_A,
  });

  await waitUntil(() => !isFacebookEnrichmentActiveForTests(USER_ID, PSID), 2000);
  assert.equal(fetchCalls, 3, "exactly 3 bounded attempts");
  assert.equal(notifyCalls.length, 0, "no contact_updated without successful name/avatar update");
  dbg("H6", "facebook-profile-enrichment-safety.test.ts:retries", "Bounded retries exhausted", {
    fetchCalls,
    notifyCount: notifyCalls.length,
  });
  resetFacebookEnrichmentSchedulerForTests();
});

await run("manual contact is not overwritten by enrichment path", async () => {
  resetFacebookEnrichmentSchedulerForTests();
  let updateCalls = 0;
  const notifyCalls: Array<unknown> = [];
  const contact = {
    id: CONTACT_ID,
    name: "Preferred Name",
    sourceDetails: mergeFacebookDisplayNameSource({}, "manual"),
  };

  setFacebookEnrichmentTestDeps({
    getContact: async () => contact,
    updateContact: async () => {
      updateCalls += 1;
      return contact;
    },
    notifyUser: (_u, p) => notifyCalls.push(p),
    fetchProfile: async () => ({
      displayName: "Samantha Parezo",
      name: "Samantha Parezo",
      firstName: null,
      lastName: null,
      profilePic: "https://example.com/x.jpg",
      fieldsReturned: ["name"],
      source: "user_profile_api",
    }),
    retryDelaysMs: [0],
  });

  scheduleFacebookContactProfileEnrichment({
    userId: USER_ID,
    contactId: CONTACT_ID,
    conversationId: CONV_ID,
    senderPsid: PSID,
    pageId: "1257286427457815",
    pageAccessToken: PAGE_TOKEN,
    messageMid: MID_A,
  });

  await waitUntil(() => !isFacebookEnrichmentActiveForTests(USER_ID, PSID), 1000);
  assert.equal(updateCalls, 0);
  assert.equal(notifyCalls.length, 0);
  assert.equal(contact.name, "Preferred Name");
  dbg("H10", "facebook-profile-enrichment-safety.test.ts:manual-enrich", "Manual protected in enrichment", {
    updateCalls,
    notifyCount: notifyCalls.length,
  });
  resetFacebookEnrichmentSchedulerForTests();
});

await run("contact_updated emitted only after successful DB update, scoped to workspace user", async () => {
  resetFacebookEnrichmentSchedulerForTests();
  const order: string[] = [];
  let contact = {
    id: CONTACT_ID,
    name: PSID,
    sourceDetails: mergeFacebookDisplayNameSource({}, "psid"),
    avatar: null as string | null,
  };
  const notifyCalls: Array<{ userId: string; payload: Record<string, unknown> }> = [];

  setFacebookEnrichmentTestDeps({
    getContact: async () => contact,
    updateContact: async (_id, patch) => {
      order.push("db_update");
      contact = {
        ...contact,
        name: (patch.name as string) || contact.name,
        avatar: (patch.avatar as string) || contact.avatar,
        sourceDetails: (patch.sourceDetails as any) || contact.sourceDetails,
      };
      return contact;
    },
    notifyUser: (userId, payload) => {
      order.push("notify");
      notifyCalls.push({ userId, payload });
    },
    fetchProfile: async () => ({
      displayName: "Samantha Parezo",
      name: "Samantha Parezo",
      firstName: null,
      lastName: null,
      profilePic: "https://example.com/avatar.jpg",
      fieldsReturned: ["name", "profile_pic"],
      source: "user_profile_api",
    }),
    retryDelaysMs: [0],
  });

  scheduleFacebookContactProfileEnrichment({
    userId: USER_ID,
    contactId: CONTACT_ID,
    conversationId: CONV_ID,
    senderPsid: PSID,
    pageId: "1257286427457815",
    pageAccessToken: PAGE_TOKEN,
    messageMid: MID_A,
  });

  await waitUntil(() => notifyCalls.length === 1, 1000);
  assert.deepEqual(order, ["db_update", "notify"]);
  assert.equal(notifyCalls[0]!.userId, USER_ID);
  assert.equal(notifyCalls[0]!.payload.type, "contact_updated");
  assert.equal(notifyCalls[0]!.payload.conversationId, CONV_ID);
  assert.equal(contact.name, "Samantha Parezo");
  assert.equal(contact.avatar, "https://example.com/avatar.jpg");
  dbg("H7", "facebook-profile-enrichment-safety.test.ts:notify-order", "contact_updated after DB update", {
    order,
    userId: notifyCalls[0]!.userId,
  });
  resetFacebookEnrichmentSchedulerForTests();
});

console.log("\nAll facebook-profile-enrichment-safety tests passed.");
