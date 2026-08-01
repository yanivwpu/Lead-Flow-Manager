/**
 * Facebook Messenger contact naming + health message classification.
 * Run: npx tsx tests/facebook-sender-profile-naming.test.ts
 */
import assert from "node:assert/strict";
import {
  buildFacebookContactNamePatch,
  composeFacebookDisplayName,
  isFacebookNamePlaceholder,
  isFacebookPsidShapedId,
  mergeFacebookDisplayNameSource,
  resolveFacebookDisplayNameSource,
  shouldLookupFacebookSenderProfile,
} from "../shared/facebookContactNaming";
import {
  classifyFacebookPageGraphError,
  facebookPageHealthUserMessage,
} from "../shared/facebookPageHealthMessage";

const PSID = "27842272592092598";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("PSID-shaped detection is strict (15+ digits), not short business numbers", () => {
  assert.equal(isFacebookPsidShapedId(PSID), true);
  assert.equal(isFacebookPsidShapedId("12345678"), false);
  assert.equal(isFacebookPsidShapedId("90210"), false);
  assert.equal(isFacebookPsidShapedId("Jane Doe"), false);
});

run("does not assume every non-PSID name is user-edited", () => {
  assert.equal(
    resolveFacebookDisplayNameSource({ name: "Alex Rivera", senderPsid: PSID }),
    "unknown",
  );
  assert.equal(
    resolveFacebookDisplayNameSource({
      name: "Alex Rivera",
      senderPsid: PSID,
      sourceDetails: { facebookDisplayNameSource: "meta" },
    }),
    "meta",
  );
  assert.equal(
    resolveFacebookDisplayNameSource({
      name: "Preferred Name",
      senderPsid: PSID,
      sourceDetails: { facebookDisplayNameSource: "manual" },
    }),
    "manual",
  );
});

run("new Facebook sender → profile lookup succeeds → real name + meta provenance", () => {
  assert.equal(
    shouldLookupFacebookSenderProfile({ name: undefined, senderPsid: PSID }),
    true,
  );
  const composed = composeFacebookDisplayName({ name: "Alex Rivera" });
  assert.equal(composed, "Alex Rivera");
  const patch = buildFacebookContactNamePatch(PSID, PSID, composed, {
    facebookDisplayNameSource: "psid",
  });
  assert.equal(patch?.name, "Alex Rivera");
  assert.equal(patch?.sourceDetails.facebookDisplayNameSource, "meta");
});

run("composes first_name + last_name when name is missing", () => {
  assert.equal(
    composeFacebookDisplayName({ first_name: "Alex", last_name: "Rivera" }),
    "Alex Rivera",
  );
});

run("new Facebook sender → lookup fails → PSID remains fallback placeholder", () => {
  assert.equal(isFacebookNamePlaceholder(PSID, PSID), true);
  assert.equal(buildFacebookContactNamePatch(PSID, PSID, null), null);
  assert.equal(buildFacebookContactNamePatch(PSID, PSID, ""), null);
});

run("later lookup succeeds → PSID fallback is replaced by real name", () => {
  assert.equal(
    shouldLookupFacebookSenderProfile({
      name: PSID,
      senderPsid: PSID,
      sourceDetails: { facebookDisplayNameSource: "psid" },
    }),
    true,
  );
  const patch = buildFacebookContactNamePatch(PSID, PSID, "Sam Lee", {
    facebookDisplayNameSource: "psid",
  });
  assert.deepEqual(patch?.name, "Sam Lee");
  assert.equal(patch?.sourceDetails.facebookDisplayNameSource, "meta");
});

run("user manually edits contact name → later lookup does not overwrite", () => {
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
    buildFacebookContactNamePatch("Preferred Name", PSID, "Meta Name", details),
    null,
  );
});

run("short numeric business name is not treated as PSID fallback", () => {
  assert.equal(
    resolveFacebookDisplayNameSource({ name: "12345678", senderPsid: PSID }),
    "unknown",
  );
  assert.equal(
    shouldLookupFacebookSenderProfile({ name: "12345678", senderPsid: PSID }),
    false,
  );
  assert.equal(
    buildFacebookContactNamePatch("12345678", PSID, "Meta Name"),
    null,
  );
});

run("existing meta-derived name → no unnecessary repeat lookup", () => {
  assert.equal(
    shouldLookupFacebookSenderProfile({
      name: "Alex Rivera",
      senderPsid: PSID,
      sourceDetails: { facebookDisplayNameSource: "meta" },
    }),
    false,
  );
});

run("does not classify every Graph error as revoked/unpublished", () => {
  const authKind = classifyFacebookPageGraphError({
    httpStatus: 400,
    code: 100,
    message: "Unsupported get request. Object does not exist",
  });
  assert.equal(authKind, "missing_authorization");
  const msg = facebookPageHealthUserMessage(authKind);
  assert.match(msg.issue.toLowerCase(), /not authorized/);
  assert.equal(msg.issue.toLowerCase().includes("unpublished"), false);

  assert.equal(
    classifyFacebookPageGraphError({
      httpStatus: 400,
      code: 190,
      message: "Invalid OAuth access token",
    }),
    "invalid_token",
  );
  assert.equal(classifyFacebookPageGraphError(null, "timeout"), "temporary_failure");
});

console.log("\nAll facebook-sender-profile-naming tests passed.");
