import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildOutreachDraftRewriteSystemPrompt,
  buildOutreachDraftRewriteUserPrompt,
  parseOutreachDraftRewriteResponse,
} from "../shared/prospectOutreachDraftRewrite";
import { PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS } from "../shared/prospectOutreachInstructions";
import { PLATFORM_OUTREACH_WRITING_STANDARD_HEADING } from "../shared/prospectOutreachWritingStandard";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
      customInstructions: "Make it shorter. Mention free trial. Do not mention AI.",
      length: "short",
      tone: "friendly",
    },
  });
  assert.ok(prompt.includes("EXISTING SUBJECT"));
  assert.ok(prompt.includes("EXISTING MESSAGE"));
  assert.ok(/free trial/i.test(prompt));
  assert.ok(/Do not mention AI/i.test(prompt));
  assert.ok(prompt.includes("Luca Jacoli"));
  assert.ok(prompt.includes("LA brokerage"));
  assert.ok(prompt.includes("CAMPAIGN INSTRUCTIONS"));
  assert.ok(/Platform Outreach Writing Standard/i.test(prompt));
}

{
  const serviceSrc = readFileSync(
    join(__dirname, "..", "server/prospectImport/prospectOutreachQueueService.ts"),
    "utf8",
  );
  // Queue service dispatches by Message Creation mode; AI Compose still uses rewrite service.
  assert.ok(serviceSrc.includes("refreshQueuedDraftsForMessageCreation"));
  const rewriteSvc = readFileSync(
    join(__dirname, "..", "server/prospectImport/prospectOutreachDraftRewriteService.ts"),
    "utf8",
  );
  assert.ok(rewriteSvc.includes("rewriteQueuedOutreachDrafts"));
  const genSvc = readFileSync(
    join(__dirname, "..", "server/prospectImport/prospectMessageGenerationService.ts"),
    "utf8",
  );
  assert.ok(genSvc.includes("rewriteQueuedOutreachDrafts"));
}

console.log("prospect-outreach-draft-rewrite.test.ts: ok");
