import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOutreachDraftRewriteSystemPrompt,
  buildOutreachDraftRewriteUserPrompt,
  parseOutreachDraftRewriteResponse,
} from "../shared/prospectOutreachDraftRewrite";
import { PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS } from "../shared/prospectOutreachInstructions";
import { PLATFORM_OUTREACH_WRITING_STANDARD_HEADING } from "../shared/prospectOutreachWritingStandard";

{
  const parsed = parseOutreachDraftRewriteResponse(
    '{"subject":"Quick hello","message":"Hi there — shorter and friendlier."}',
  );
  assert.equal(parsed?.subject, "Quick hello");
  assert.match(String(parsed?.message), /friendlier/i);
  assert.equal(parseOutreachDraftRewriteResponse("not json"), null);
}

{
  assert.ok(
    buildOutreachDraftRewriteSystemPrompt().includes(PLATFORM_OUTREACH_WRITING_STANDARD_HEADING),
  );

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
  assert.match(prompt, /LA brokerage/);
  assert.match(prompt, /CAMPAIGN INSTRUCTIONS/);
  assert.match(prompt, /Platform Outreach Writing Standard/i);
}

{
  const serviceSrc = readFileSync(
    join(import.meta.dirname, "..", "server/prospectImport/prospectOutreachQueueService.ts"),
    "utf8",
  );
  assert.ok(serviceSrc.includes("rewriteQueuedOutreachDrafts"));
}

console.log("prospect-outreach-draft-rewrite.test.ts: ok");
