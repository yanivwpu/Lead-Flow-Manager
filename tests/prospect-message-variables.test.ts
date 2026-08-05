/**
 * Prospect AI template variable merge.
 * Run: npx tsx --test tests/prospect-message-variables.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProspectMessageVariableMap,
  buildSampleProspectMessageVariableSource,
  mergeProspectTemplate,
  extractProspectTemplateTokens,
} from "../shared/prospectMessageVariables";

test("variable replacement for supported keys", () => {
  const values = buildProspectMessageVariableMap({
    name: "Alex Rivera",
    companyName: "Rivera Realty",
    city: "Pompano Beach",
    businessType: "real_estate",
    website: "https://rivera.example",
    phone: "+15551234567",
    email: "alex@example.com",
  });
  const out = mergeProspectTemplate(
    "Hi {{first_name}} at {{business_name}} in {{city}} — {{website}} / {{phone}} / {{email}} ({{category}})",
    values,
  );
  assert.equal(
    out,
    "Hi Alex at Rivera Realty in Pompano Beach — https://rivera.example / +15551234567 / alex@example.com (real_estate)",
  );
});

test("missing values become empty — never invent", () => {
  const out = mergeProspectTemplate("Hi {{first_name}}, see {{website}}", {
    first_name: "",
    website: "",
  });
  assert.equal(out, "Hi , see ");
});

test("unknown tokens and ai_ tokens are left unchanged", () => {
  const out = mergeProspectTemplate(
    "Hi {{first_name}} {{unknown_field}} {{ai_opening}}",
    { first_name: "Sam" },
  );
  assert.equal(out, "Hi Sam {{unknown_field}} {{ai_opening}}");
});

test("does not invent variables the user did not place", () => {
  const values = buildProspectMessageVariableMap(buildSampleProspectMessageVariableSource());
  const template = "Hello there.";
  assert.equal(mergeProspectTemplate(template, values), "Hello there.");
  assert.deepEqual(extractProspectTemplateTokens(template, ""), []);
});
