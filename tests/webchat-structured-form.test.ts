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
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /WebchatFormCard/);
  assert.match(frame, /\/forms/);
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /inbox-webchat-form-result/);
});
