import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOutreachDraftRewriteUserPrompt,
  parseOutreachDraftRewriteResponse,
} from "../shared/prospectOutreachDraftRewrite";
import { PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS } from "../shared/prospectOutreachInstructions";

{
  const parsed = parseOutreachDraftRewriteResponse(
    '{"subject":"Quick hello","message":"Hi there — shorter and friendlier."}',
  );
  assert.equal(parsed?.subject, "Quick hello");
  assert.match(String(parsed?.message), /friendlier/i);
  assert.equal(parseOutreachDraftRewriteResponse("not json"), null);
}

{
  const prompt = buildOutreachDraftRewriteUserPrompt({
    prospectName: "Luca Jacoli",
    subject: "Quick introduction, Luca Jacoli",
    message: "Hi Luca — longer personalized pitch about your LA brokerage.",
    instructions: {
      ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
      customInstructions: "Make it shorter. Mention free trial. Don't mention AI.",
      length: "short",
      tone: "friendly",
    },
  });
  assert.match(prompt, /EXISTING SUBJECT/);
  assert.match(prompt, /EXISTING MESSAGE/);
  assert.match(prompt, /free trial/i);
  assert.match(prompt, /Don't mention AI/i);
  assert.match(prompt, /Luca Jacoli/);
  // Rewrite layer keeps prospect facts from the existing draft + campaign guidance.
  assert.match(prompt, /LA brokerage/);
  assert.match(prompt, /campaign instructions|Rewrite the subject/i);
}

{
  const serviceSrc = readFileSync(
    join(import.meta.dirname, "..", "server/prospectImport/prospectOutreachQueueService.ts"),
    "utf8",
  );
  assert.ok(serviceSrc.includes("rewriteQueuedOutreachDrafts"));
}

console.log("prospect-outreach-draft-rewrite.test.ts: ok");
