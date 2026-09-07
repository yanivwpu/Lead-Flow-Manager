/**
 * Structured Web Chat forms: schema, public redaction, ownership, consent.
 * Run: npx tsx --test tests/webchat-structured-form.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  sanitizeWebchatFormDefinition,
  validateWebchatFormSubmission,
  toInboxFormSubmission,
  WEBCHAT_FORM_PUBLIC_SUBMITTED_CONTENT,
  uniqueWebchatFormFieldId,
  webchatFormFieldDraftError,
  chatbotFormDefinitionIsPublishable,
  chatbotFormNodesPublishError,
  demoteActiveFlowIfFormIncomplete,
  emptyWebchatFormDraft,
  WEBCHAT_FORM_FIELD_TYPES,
} from "../shared/webchatStructuredForm";
import { toPublicWebchatMessages } from "../shared/webchatPublicMessages";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const form = sanitizeWebchatFormDefinition({
  id: "lead_capture",
  title: "Contact details",
  submitLabel: "Send",
  fields: [
    { id: "name", type: "name", label: "Name", required: true },
    { id: "email", type: "email", label: "Email", required: true },
    { id: "phone", type: "phone", label: "Phone", required: false },
    {
      id: "consent",
      type: "consent",
      label: "Consent",
      consentText: "I agree to be contacted. This is not A2P registration.",
    },
  ],
});

test("form schema rejects HTML and requires explicit consent text", () => {
  assert.ok(form);
  assert.equal(
    sanitizeWebchatFormDefinition({
      id: "x",
      title: "<script>alert(1)</script>",
      fields: [{ id: "name", type: "name", label: "Name", required: true }],
    }),
    null,
  );
  assert.equal(
    sanitizeWebchatFormDefinition({
      id: "lead_capture",
      title: "Lead",
      fields: [{ id: "consent", type: "consent", label: "Go", consentText: "" }],
    }),
    null,
  );
  assert.equal(form!.fields.some((f) => f.type === "consent" && f.required), true);
});

test("server-side validation and inbox submission keep consent text", () => {
  assert.ok(form);
  const missing = validateWebchatFormSubmission(form, { name: "Ada" });
  assert.equal(missing.ok, false);
  const noConsent = validateWebchatFormSubmission(form, {
    name: "Ada Lovelace",
    email: "ada@example.com",
    consent: false,
  });
  assert.equal(noConsent.ok, false);
  const ok = validateWebchatFormSubmission(form, {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+1 555 0100",
    consent: true,
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  const inbox = toInboxFormSubmission(form, ok.values, "2026-09-06T18:00:00.000Z");
  assert.equal(inbox.consent?.accepted, true);
  assert.match(inbox.consent?.text || "", /not A2P/);
  assert.equal(inbox.fields.some((f) => f.type === "consent"), false);
});

test("public poll redacts form field values and keeps the definition", () => {
  const payload = toPublicWebchatMessages([
    {
      id: "form-out",
      direction: "outbound",
      content: "Please fill this in",
      contentType: "form",
      status: "sent",
      templateVariables: { webchatForm: form },
    },
    {
      id: "form-in",
      direction: "inbound",
      content: "Ada Lovelace / ada@example.com / +15550100",
      contentType: "form_result",
      status: "delivered",
      templateVariables: {
        webchatFormSubmission: toInboxFormSubmission(form!, {
          name: "Ada Lovelace",
          email: "ada@example.com",
          phone: "+15550100",
          consent: true,
        }),
      },
    },
  ]);
  const out = payload.find((m) => m.id === "form-out");
  const inn = payload.find((m) => m.id === "form-in");
  assert.ok(out?.templateVariables && "webchatForm" in out.templateVariables);
  assert.equal(inn?.content, WEBCHAT_FORM_PUBLIC_SUBMITTED_CONTENT);
  assert.equal(JSON.stringify(inn?.templateVariables || {}).includes("ada@example.com"), false);
  assert.equal(JSON.stringify(payload).includes("webchatFormSubmission"), false);
});

test("form POST is tenant-scoped, validates, and dispatches workflows", () => {
  const webhooks = read("server/routes/webhooks.ts");
  const post = webhooks.slice(webhooks.indexOf('app.post("/api/webchat/:userId/:visitorId/forms"'));
  const window = post.slice(0, 7000);
  assert.match(window, /strictOrigin:\s*true/);
  assert.match(window, /isPublicWebchatVisitorId\(visitorId\)/);
  assert.match(window, /getContactByChannelId\(access\.owner\.userId, "webchat", visitorId\)/);
  assert.match(window, /contact\.userId !== access\.owner\.userId/);
  assert.match(window, /conversation\.userId !== access\.owner\.userId/);
  assert.match(window, /validateWebchatFormSubmission/);
  assert.match(window, /applyWebchatFormToContact/);
  assert.match(window, /contentType: "form_result"/);
  assert.match(window, /dispatchWebchatInboundWorkflows/);
  assert.match(window, /webchatFormSubmission/);
  assert.doesNotMatch(window, /A2P compliant|10DLC approved/i);
  const service = read("server/webchatFormService.ts");
  assert.match(service, /contact\.userId !== params\.userId/);
  assert.match(service, /consentAccepted/);
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /sendChatbotFormWebchat/);
  assert.match(engine, /contentType: "form"/);
  assert.match(engine, /Incomplete webchat form skipped/);
  assert.match(engine, /has no publishable form — skipping/);
  assert.doesNotMatch(engine, /Please share your contact details/);
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /WebchatFormCard/);
  assert.match(frame, /\/forms/);
  assert.match(frame, /sanitizeWebchatFormDefinition/);
  assert.match(frame, /WebchatMessageErrorBoundary/);
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /inbox-webchat-form-result/);
  const patch = read("server/routes.ts");
  const flowPatch = patch.slice(patch.indexOf("app.patch(\"/api/chatbot-flows/:id\""));
  assert.match(flowPatch.slice(0, 1800), /chatbotFormNodesPublishError/);
});

test("empty and malformed drafts are not publishable and do not invent fields", () => {
  const empty = emptyWebchatFormDraft();
  assert.equal(empty.fields.length, 0);
  assert.equal(sanitizeWebchatFormDefinition(empty), null);
  assert.equal(chatbotFormDefinitionIsPublishable(empty), false);
  assert.equal(
    chatbotFormDefinitionIsPublishable({
      id: "lead_capture",
      title: "Contact details",
      fields: [],
    }),
    false,
  );
  assert.match(
    chatbotFormNodesPublishError([
      { data: { label: "Ask for details", messageType: "form", webchatForm: empty } },
    ]) || "",
    /Ask for details/,
  );
  assert.equal(chatbotFormNodesPublishError([{ data: { messageType: "text", content: "Hi" } }]), null);
  const unsafe = uniqueWebchatFormFieldId("1bad", ["field"]);
  assert.equal(unsafe, "field_2");
  const demoted = demoteActiveFlowIfFormIncomplete({
    isActive: true,
    nodes: [{ data: { label: "Ask for details", messageType: "form", webchatForm: empty } }],
  });
  assert.equal(demoted.isActive, false);
  assert.equal(
    demoteActiveFlowIfFormIncomplete({
      isActive: true,
      nodes: [{ data: { messageType: "text", content: "Hi" } }],
    }).isActive,
    true,
  );
});

test("field drafts reject duplicate and unsafe ids, missing options, and empty consent", () => {
  assert.equal(uniqueWebchatFormFieldId("name", []), "name");
  assert.equal(uniqueWebchatFormFieldId("name", ["name"]), "name_2");
  assert.match(webchatFormFieldDraftError({ id: "bad-id", type: "name", label: "Name" }, []) || "", /lowercase/);
  assert.match(
    webchatFormFieldDraftError({ id: "email", type: "email", label: "Email" }, ["email"]) || "",
    /unique/,
  );
  assert.match(
    webchatFormFieldDraftError({ id: "choice", type: "select", label: "Choice", options: [] }, []) || "",
    /option/,
  );
  assert.match(
    webchatFormFieldDraftError({ id: "consent", type: "consent", label: "Go", consentText: "" }, []) || "",
    /Consent text/,
  );
  const ok = webchatFormFieldDraftError(
    { id: "consent", type: "consent", label: "Consent", required: true, consentText: "I agree to be contacted." },
    [],
  );
  assert.equal(ok, null);
  for (const type of WEBCHAT_FORM_FIELD_TYPES) {
    assert.equal(typeof uniqueWebchatFormFieldId(type, []), "string");
  }
});

test("configured fields persist through sanitize for visitor render and remain tenant-scoped on submit", () => {
  const configured = {
    id: "lead_capture",
    title: "Tour request",
    description: "Tell us how to reach you",
    submitLabel: "Send",
    fields: [
      { id: "name", type: "name", label: "Name", required: true },
      { id: "email", type: "email", label: "Email", required: true },
      { id: "phone", type: "phone", label: "Phone", required: false },
      { id: "when", type: "date", label: "Preferred date", required: false },
      { id: "unit", type: "select", label: "Unit", required: true, options: ["A", "B"] },
      { id: "tour", type: "radio", label: "Tour type", required: true, options: ["In person", "Video"] },
      { id: "extras", type: "checkbox", label: "Extras", required: false, options: ["Parking", "Storage"] },
      { id: "consent", type: "consent", label: "Consent", required: true, consentText: "I agree to be contacted." },
    ],
  };
  assert.equal(chatbotFormDefinitionIsPublishable(configured), true);
  const visitor = sanitizeWebchatFormDefinition(configured);
  assert.ok(visitor);
  assert.equal(visitor!.fields.length, 8);
  assert.deepEqual(
    visitor!.fields.map((f) => f.type),
    ["name", "email", "phone", "date", "select", "radio", "checkbox", "consent"],
  );
  const submitted = validateWebchatFormSubmission(visitor!, {
    name: "Ada Lovelace",
    email: "ada@example.com",
    when: "2026-09-08",
    unit: "A",
    tour: "Video",
    extras: ["Parking"],
    consent: true,
  });
  assert.equal(submitted.ok, true);
  const card = read("client/src/components/webchat/WebchatFormCard.tsx");
  assert.match(card, /type === "select"/);
  assert.match(card, /type === "radio"/);
  assert.match(card, /type === "checkbox"/);
  assert.match(card, /type === "consent"/);
  assert.match(card, /type === "email"/);
  assert.match(card, /type === "date"/);
  assert.match(card, /type === "phone"/);
  assert.match(read("server/webchatFormService.ts"), /contact\.userId !== params\.userId/);
});

test("add/edit/remove/reorder of every field type survives save/reload sanitize", () => {
  const needsOptions = new Set(["select", "radio", "checkbox"]);
  let fields: Array<Record<string, unknown>> = [];
  for (const type of WEBCHAT_FORM_FIELD_TYPES) {
    const id = uniqueWebchatFormFieldId(type, fields.map((f) => String(f.id || "")));
    const field: Record<string, unknown> = {
      id,
      type,
      label: `${type} label`,
      required: type === "consent" || type === "email",
    };
    if (needsOptions.has(type)) field.options = ["Option 1", "Option 2"];
    if (type === "consent") field.consentText = "I agree to be contacted.";
    fields.push(field);
  }
  fields = [fields[fields.length - 1]!, ...fields.slice(0, -1)];
  const saved = {
    id: "lead_capture",
    title: "Tour request",
    description: "Tell us how to reach you",
    submitLabel: "Send",
    fields: fields.filter((f) => f.type !== "phone"),
  };
  const reloaded = sanitizeWebchatFormDefinition(JSON.parse(JSON.stringify(saved)));
  assert.ok(reloaded);
  assert.equal(reloaded!.fields.length, 7);
  assert.equal(reloaded!.fields[0]!.type, "consent");
  assert.equal(reloaded!.fields[0]!.required, true);
  assert.deepEqual(
    reloaded!.fields.map((f) => f.type),
    ["consent", "name", "email", "select", "radio", "checkbox", "date"],
  );
  assert.deepEqual(reloaded!.fields.find((f) => f.type === "select")?.options, ["Option 1", "Option 2"]);
  assert.equal(chatbotFormDefinitionIsPublishable(saved), true);
  assert.equal(chatbotFormDefinitionIsPublishable({ ...saved, fields: [] }), false);
});

test("malformed or empty form messages are not rendered and do not crash WidgetFrame", () => {
  assert.equal(
    sanitizeWebchatFormDefinition({ id: "lead_capture", title: "Contact details", fields: [] }),
    null,
  );
  assert.equal(
    sanitizeWebchatFormDefinition({
      id: "lead_capture",
      title: "Contact details",
      fields: [{ id: "1bad", type: "name", label: "Name" }],
    }),
    null,
  );
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /const formDef = sanitizeWebchatFormDefinition\(msg\.templateVariables\?\.webchatForm\)/);
  assert.match(frame, /msg\.contentType === "form" && !!formDef && isOutbound/);
  assert.match(frame, /WebchatMessageErrorBoundary/);
  assert.match(frame, /WidgetFrameErrorBoundary/);
});

test("Chatbot Builder exposes a native Form fields editor and does not hide a hardcoded schema", () => {
  const builder = read("client/src/pages/ChatbotBuilder.tsx");
  assert.match(builder, /ChatbotFormFieldsEditor/);
  assert.match(builder, /emptyWebchatFormDraft/);
  assert.match(builder, /chatbotFormNodesPublishError/);
  assert.match(builder, /demoteActiveFlowIfFormIncomplete/);
  assert.match(builder, /Moved to Draft/);
  assert.doesNotMatch(builder, /id: "name", type: "name", label: "Name"/);
  const editor = read("client/src/components/chatbot/ChatbotFormFieldsEditor.tsx");
  assert.match(editor, /Form fields/);
  assert.match(editor, /btn-add-form-field/);
  assert.match(editor, /Visitor preview/);
  assert.match(editor, /WebchatFormCard/);
  assert.match(editor, /WEBCHAT_FORM_FIELD_TYPES\.map/);
  assert.match(editor, /TYPE_LABELS/);
  assert.match(editor, /btn-form-field-up/);
  assert.match(editor, /btn-form-field-remove/);
  assert.match(editor, /btn-add-form-option/);
  assert.match(editor, /toggle-form-field-required/);
  assert.match(editor, /input-form-field-consent/);
  assert.match(editor, /Website Chat only/);
  assert.match(editor, /min-w-0/);
});
