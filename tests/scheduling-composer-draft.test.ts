import assert from "node:assert/strict";
import {
  buildSchedulingComposerDraft,
  isSchedulingComposerAction,
  SCHEDULING_COMPOSER_INTRO,
} from "../shared/customerInsights";

assert.equal(isSchedulingComposerAction("Send available time options"), true);
assert.equal(isSchedulingComposerAction("Ask if financing is already arranged"), false);

assert.equal(
  buildSchedulingComposerDraft("https://calendly.com/yaniv-whachatcrm"),
  `${SCHEDULING_COMPOSER_INTRO}\nhttps://calendly.com/yaniv-whachatcrm`,
);
assert.equal(buildSchedulingComposerDraft(""), SCHEDULING_COMPOSER_INTRO);

console.log("scheduling-composer-draft.test.ts: ok");
