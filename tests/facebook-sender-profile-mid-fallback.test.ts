/**
 * Facebook sender profile: User Profile API denial → message from.name fallback.
 * Run: npx tsx tests/facebook-sender-profile-mid-fallback.test.ts
 */
import assert from "node:assert/strict";
import {
  buildFacebookContactNamePatch,
  mergeFacebookDisplayNameSource,
} from "../shared/facebookContactNaming";
import { fetchFacebookSenderProfile } from "../server/facebookSenderProfile";

const PSID = "27842272592092598";
const MID = "m_test_message_id_abc";
const PAGE_TOKEN = "PAGE_TOKEN_TEST_VALUE_NOT_REAL";

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
    // Never allow real tokens into assertions beyond presence checks.
    assert.ok(!url.includes(PAGE_TOKEN) || url.includes("access_token="));
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

await run("User Profile 100/33 → mid from.name resolves display name", async () => {
  await withMockedFetch((url) => {
    if (url.includes(`/${PSID}?`) && url.includes("fields=")) {
      return {
        status: 400,
        body: {
          error: {
            message: "Unsupported get request. Object with ID does not exist",
            type: "GraphMethodException",
            code: 100,
            error_subcode: 33,
            fbtrace_id: "TESTTRACE",
          },
        },
      };
    }
    if (url.includes(`/${MID}?`) && url.includes("fields=from")) {
      return {
        status: 200,
        body: { from: { name: "Samantha Parezo", id: PSID }, id: MID },
      };
    }
    return { status: 500, body: { error: { message: "unexpected url", code: 1 } } };
  }, async () => {
    const profile = await fetchFacebookSenderProfile(PSID, PAGE_TOKEN, {
      pageIdForLog: "1257286427457815",
      messageMid: MID,
    });
    assert.ok(profile);
    assert.equal(profile!.displayName, "Samantha Parezo");
    assert.equal(profile!.source, "message_from_api");
    assert.equal(profile!.profilePic, null);

    const patch = buildFacebookContactNamePatch(
      PSID,
      PSID,
      profile!.displayName,
      mergeFacebookDisplayNameSource({}, "psid"),
    );
    assert.equal(patch?.name, "Samantha Parezo");
    assert.equal(patch?.sourceDetails.facebookDisplayNameSource, "meta");
  });
});

await run("User Profile success still preferred (includes avatar)", async () => {
  await withMockedFetch((url) => {
    if (url.includes(`/${PSID}?`)) {
      return {
        status: 200,
        body: {
          id: PSID,
          name: "Susu Sahbak",
          first_name: "Susu",
          last_name: "Sahbak",
          profile_pic: "https://example.com/pic.jpg",
        },
      };
    }
    return { status: 500, body: { error: { message: "mid should not be called", code: 1 } } };
  }, async () => {
    const profile = await fetchFacebookSenderProfile(PSID, PAGE_TOKEN, {
      messageMid: MID,
    });
    assert.ok(profile);
    assert.equal(profile!.displayName, "Susu Sahbak");
    assert.equal(profile!.source, "user_profile_api");
    assert.equal(profile!.profilePic, "https://example.com/pic.jpg");
  });
});

await run("mid from.id mismatch is rejected (Page isolation)", async () => {
  await withMockedFetch((url) => {
    if (url.includes(`/${PSID}?`)) {
      return {
        status: 400,
        body: { error: { code: 100, error_subcode: 33, type: "GraphMethodException", message: "denied" } },
      };
    }
    if (url.includes(`/${MID}?`)) {
      return {
        status: 200,
        body: { from: { name: "Wrong Person", id: "99999999999999999" }, id: MID },
      };
    }
    return { status: 500, body: {} };
  }, async () => {
    const profile = await fetchFacebookSenderProfile(PSID, PAGE_TOKEN, { messageMid: MID });
    assert.equal(profile, null);
  });
});

console.log("\nAll facebook-sender-profile-mid-fallback tests passed.");
