/**
 * Prospect AI Message Creation preview helpers.
 * Run: npx tsx --test tests/prospect-message-preview.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMessageCreationSettings } from "../shared/prospectMessageCreation";
import {
  generateFromAiComposeSeed,
  generateFromTemplateStrategy,
  listUnresolvedTemplateTokens,
} from "../shared/prospectMessageGeneration";
import {
  buildProspectMessageVariableMap,
  buildSampleProspectMessageVariableSource,
  mergeProspectTemplate,
} from "../shared/prospectMessageVariables";

test("preview merge for sample prospect", () => {
  const settings = parseMessageCreationSettings({
    mode: "use_my_template",
    templateSubject: "Idea for {{business_name}}",
    templateBody: "Hi {{first_name}} in {{city}},",
  });
  const values = buildProspectMessageVariableMap(buildSampleProspectMessageVariableSource());
  const subject = mergeProspectTemplate(settings.templateSubject, values);
  const body = mergeProspectTemplate(settings.templateBody, values);
  assert.equal(subject, "Idea for Rivera Realty");
  assert.equal(body, "Hi Alex in Pompano Beach,");
  assert.deepEqual(listUnresolvedTemplateTokens(subject, body), []);
});

test("AI Compose seed preview does not template-merge", () => {
  const generated = generateFromAiComposeSeed({
    seed: {
      subject: "Custom subject",
      body: "AI wrote this for {{first_name}} literally",
    },
  });
  assert.equal(generated.mode, "ai_compose");
  assert.equal(generated.body, "AI wrote this for {{first_name}} literally");
  assert.deepEqual(generated.unresolvedTokens, ["first_name"]);
});

test("assisted preview leaves unfilled ai_ as unresolved", () => {
  const settings = parseMessageCreationSettings({
    mode: "ai_assisted_template",
    templateSubject: "Hi",
    templateBody: "A {{ai_opening}} B",
  });
  const generated = generateFromTemplateStrategy({
    mode: "ai_assisted_template",
    settings,
    source: buildSampleProspectMessageVariableSource(),
    // no aiFill
  });
  assert.ok(generated.body.includes("{{ai_opening}}"));
  assert.ok(generated.unresolvedTokens.includes("ai_opening"));
});

test("Preview for Prospect UI wired", () => {
  const preview = readFileSync(
    join(process.cwd(), "client/src/components/prospectAi/ProspectMessagePreview.tsx"),
    "utf8",
  );
  assert.ok(preview.includes("pi-preview-for-prospect"));
  assert.ok(preview.includes("/api/growth-tools/prospect-outreach/preview-message"));
});
