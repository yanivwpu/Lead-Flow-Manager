/**
 * Prospect AI Message Creation modes — parse, template contracts, AI placeholders.
 * Run: npx tsx --test tests/prospect-message-creation-modes.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isMessageCreationConfigured,
  messageCreationAllowsAiRewrite,
  messageCreationUsesTemplate,
  normalizeMessageCreationForSave,
  parseMessageCreationSettings,
  PROSPECT_MESSAGE_CREATION_DEFAULTS,
} from "../shared/prospectMessageCreation";
import { OutreachInstructionsValidationError } from "../shared/prospectOutreachInstructions";
import {
  applyAiPlaceholderReplacements,
  extractAiPlaceholderKeys,
  sanitizeAiPlaceholderFillResponse,
} from "../shared/prospectAiPlaceholders";
import {
  generateFromTemplateStrategy,
  templateProseFingerprint,
} from "../shared/prospectMessageGeneration";

test("missing mode defaults to ai_compose", () => {
  const parsed = parseMessageCreationSettings({
    customInstructions: "Keep short",
    tone: "friendly",
  });
  assert.equal(parsed.mode, "ai_compose");
  assert.equal(parsed.templateBody, "");
  assert.equal(PROSPECT_MESSAGE_CREATION_DEFAULTS.mode, "ai_compose");
});

test("ai_compose allows rewrite; template modes do not", () => {
  assert.equal(messageCreationAllowsAiRewrite("ai_compose"), true);
  assert.equal(messageCreationAllowsAiRewrite("use_my_template"), false);
  assert.equal(messageCreationAllowsAiRewrite("ai_assisted_template"), false);
  assert.equal(messageCreationUsesTemplate("use_my_template"), true);
  assert.equal(messageCreationUsesTemplate("ai_assisted_template"), true);
  assert.equal(messageCreationUsesTemplate("ai_compose"), false);
});

test("Use My Template — no AI rewrite of prose (fingerprint stable)", () => {
  const settings = normalizeMessageCreationForSave({
    mode: "use_my_template",
    templateSubject: "Hello {{first_name}}",
    templateBody: "Exact prose for {{business_name}}. Do not compliment.",
  });
  const before = templateProseFingerprint(settings.templateBody);
  assert.equal(before, "Exact prose for {{}}. Do not compliment.");
  const generated = generateFromTemplateStrategy({
    mode: "use_my_template",
    settings,
    source: {
      name: "Pat Lee",
      companyName: "Lee Labs",
    },
  });
  // Re-tokenizing the merged value recovers the same prose skeleton (no AI polish).
  assert.equal(
    templateProseFingerprint(generated.body.replace("Lee Labs", "{{business_name}}")),
    before,
  );
  assert.equal(generated.body, "Exact prose for Lee Labs. Do not compliment.");
  assert.equal(generated.meta.aiPlaceholdersFilled.length, 0);
  assert.ok(!/amazing|thrilled|synergy/i.test(generated.body));
});

test("AI placeholders only — mixed tokens", () => {
  const subject = "Hi {{first_name}}";
  const body = "{{ai_opening}}\nStay exactly.\n{{ai_cta}}\n{{business_name}}";
  assert.deepEqual(extractAiPlaceholderKeys(subject, body), ["ai_opening", "ai_cta"]);

  const mergedBody = "Stay exactly.\n{{ai_opening}}\n{{ai_cta}}\nLee Labs";
  const filled = applyAiPlaceholderReplacements(mergedBody, {
    ai_opening: "Quick note,",
    ai_cta: "Worth a chat?",
    subject: "SMUGGLE",
    message: "FULL REWRITE ATTEMPT",
  });
  assert.equal(filled, "Stay exactly.\nQuick note,\nWorth a chat?\nLee Labs");
  assert.ok(!filled.includes("FULL REWRITE"));
  assert.ok(!filled.includes("SMUGGLE"));
});

test("sanitizeAiPlaceholderFillResponse drops non-requested / non-ai keys", () => {
  const clean = sanitizeAiPlaceholderFillResponse(["ai_opening"], {
    ai_opening: "Hello",
    ai_cta: "Nope",
    subject: "Bad",
    message: "Bad",
  });
  assert.deepEqual(clean, { ai_opening: "Hello" });
});

test("Use My Template rejects ai_ tokens on save", () => {
  assert.throws(
    () =>
      normalizeMessageCreationForSave({
        mode: "use_my_template",
        templateBody: "Hi {{ai_opening}}",
      }),
    (err: unknown) => err instanceof OutreachInstructionsValidationError,
  );
});

test("template modes require body; configured flag", () => {
  assert.equal(isMessageCreationConfigured({}), false);
  assert.throws(
    () => normalizeMessageCreationForSave({ mode: "use_my_template", templateBody: "" }),
    (err: unknown) => err instanceof OutreachInstructionsValidationError,
  );
  const saved = normalizeMessageCreationForSave({
    mode: "ai_assisted_template",
    templateSubject: "Q for {{business_name}}",
    templateBody: "Hi {{first_name}},\n\n{{ai_reason}}\n",
  });
  assert.equal(isMessageCreationConfigured(saved), true);
  assert.equal(saved.mode, "ai_assisted_template");
});

test("assisted generation fills only ai_ slots", () => {
  const settings = normalizeMessageCreationForSave({
    mode: "ai_assisted_template",
    templateSubject: "Note for {{business_name}}",
    templateBody: "Hi {{first_name}},\n\n{{ai_opening}}\n\nFixed CTA line.\n\n{{ai_cta}}",
  });
  const generated = generateFromTemplateStrategy({
    mode: "ai_assisted_template",
    settings,
    source: { name: "Pat Lee", companyName: "Lee Labs" },
    aiFill: {
      ai_opening: "Saw your recent launch.",
      ai_cta: "Open to a quick call?",
      message: "IGNORE FULL BODY",
    },
  });
  assert.equal(generated.subject, "Note for Lee Labs");
  assert.equal(
    generated.body,
    "Hi Pat,\n\nSaw your recent launch.\n\nFixed CTA line.\n\nOpen to a quick call?",
  );
  assert.ok(generated.body.includes("Fixed CTA line."));
  assert.ok(!generated.body.includes("IGNORE FULL BODY"));
});

test("UI + server wiring present", () => {
  const modal = readFileSync(
    join(process.cwd(), "client/src/components/prospectAi/MessageCreationModal.tsx"),
    "utf8",
  );
  assert.ok(modal.includes("AI Compose"));
  assert.ok(modal.includes("Use My Template"));
  assert.ok(modal.includes("AI Assisted Template"));
  assert.ok(modal.includes("ProspectMessagePreview"));

  const service = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectMessageGenerationService.ts"),
    "utf8",
  );
  assert.ok(service.includes("refreshQueuedDraftsForMessageCreation"));
  assert.ok(service.includes("generateProspectOutreachDraft"));

  const routes = readFileSync(
    join(process.cwd(), "server/routes/prospectBulkOutreach.ts"),
    "utf8",
  );
  assert.ok(routes.includes("preview-message"));
});
