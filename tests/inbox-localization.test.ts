import assert from "node:assert/strict";
import test from "node:test";
import { createInstance } from "i18next";
import en from "../client/src/locales/en.json";
import he from "../client/src/locales/he.json";
import es from "../client/src/locales/es.json";
import { copilotActionLabel, quickFollowUpDate, quickFollowUpOptions } from "../client/src/lib/inboxCopilotPresentation";
import { CONVERSATION_STATUS_ROWS, conversationStatusLabel } from "../client/src/lib/conversationStatusUi";
import { crmStageLabel, crmTagLabel, crmChannelLabel } from "../client/src/lib/crmPresentation";
import { inboxPipelineChoices } from "../client/src/lib/data";
import { defaultPipelineLayout, pipelineStageDisplayLabel } from "../shared/pipelineLayout";
import { isSchedulingComposerAction } from "../shared/customerInsights";

test("Inbox shell, channel picker, composer and Copilot resolve in each interface locale", async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en }, he: { translation: he }, es: { translation: es } },
  });
  const fixtures = [
    ["en", "ltr", "Inbox", "Filter by channel", "Type a message…", "Send available time options"],
    ["he", "rtl", "תיבת שיחות", "סינון לפי ערוץ", "כתבו הודעה…", "שליחת אפשרויות זמן פנויות"],
    ["es", "ltr", "Bandeja de entrada", "Filtrar por canal", "Escribe un mensaje…", "Enviar horarios disponibles"],
  ] as const;
  const schedulingAction = "Send available time options";
  for (const [locale, direction, inbox, filter, composer, action] of fixtures) {
    await i18n.changeLanguage(locale);
    assert.equal(i18n.dir(), direction);
    assert.equal(i18n.t("inboxUi.inbox"), inbox);
    assert.equal(i18n.t("inboxUi.filterByChannel"), filter);
    assert.equal(i18n.t("inboxUi.typeAMessage"), composer);
    assert.equal(copilotActionLabel(schedulingAction, i18n.t), action);
    assert.equal(isSchedulingComposerAction(schedulingAction), true);
  }
});

test("quick follow-up localizes labels and schedules canonical offsets at 9 AM", async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en }, he: { translation: he }, es: { translation: es } },
  });
  const now = new Date(2026, 0, 29, 16, 30);
  const expectedDates = [
    new Date(2026, 0, 30, 9).toISOString(),
    new Date(2026, 1, 1, 9).toISOString(),
    new Date(2026, 1, 5, 9).toISOString(),
  ];
  for (const [locale, labels] of [
    ["en", ["Tomorrow (24h)", "3 days", "1 week"]],
    ["he", ["מחר (24 שעות)", "3 ימים", "שבוע אחד"]],
    ["es", ["Mañana (24 h)", "3 días", "1 semana"]],
  ] as const) {
    await i18n.changeLanguage(locale);
    const options = quickFollowUpOptions(i18n.t);
    assert.deepEqual(options.map(({ display }) => display), labels, locale);
    assert.deepEqual(options.map(({ value }) => value), ["24h", "3 days", "1 week"], locale);
    assert.deepEqual(options.map(({ value }) => quickFollowUpDate(value, now)), expectedDates, locale);
  }
});

test("Inbox status, stage and tag labels preserve canonical values and custom text", async () => {
  const locale = createInstance();
  await locale.init({
    lng: "en",
    resources: { en: { translation: en }, he: { translation: he }, es: { translation: es } },
  });

  for (const [language, messages] of Object.entries({ en, he, es })) {
    await locale.changeLanguage(language);
    assert.deepEqual(CONVERSATION_STATUS_ROWS.map(row => row.value), ["open", "pending", "resolved", "closed"]);
    assert.deepEqual(CONVERSATION_STATUS_ROWS.map(row => conversationStatusLabel(locale.t, row.value)), [
      messages.inboxUi.conversationOpen, messages.inboxUi.conversationPending,
      messages.inboxUi.conversationResolved, messages.inboxUi.conversationClosed,
    ]);
    assert.equal(crmStageLabel(locale.t, "Contacted"), messages.crmDetails.contacted);
    assert.equal(crmStageLabel(locale.t, "Custom qualification"), "Custom qualification");
    assert.equal(crmTagLabel(locale.t, "New"), messages.crmDetails.newTag);
    assert.equal(crmTagLabel(locale.t, "Customer supplied tag"), "Customer supplied tag");
    assert.equal(crmChannelLabel(locale.t, "email_inbox"), messages.inboxUi.emailChannel);
  }
});

test("Inbox pipeline choices use workspace ordering, custom assignments and canonical fallback", () => {
  const defaults = defaultPipelineLayout();
  const id = "custom:12345678-1111-2222-3333-444444444444";
  const [, contacted, proposal, negotiation, closed] = defaults;
  const layout = [contacted, defaults[0], { id, label: "Design & Measurements", canonicalStage: "Proposal" as const },
    { ...proposal, label: "Estimate" }, negotiation, closed];

  assert.deepEqual(inboxPipelineChoices(layout, "Proposal", id, false), {
    value: id,
    stageIds: ["Contacted", "Lead", id, "Proposal", "Negotiation", "Closed"],
  });
  assert.equal(pipelineStageDisplayLabel(layout, id), "Design & Measurements");
  assert.equal(pipelineStageDisplayLabel(layout, "Proposal"), "Estimate");
  assert.equal(pipelineStageDisplayLabel(layout.map(stage => stage.id === id ? { ...stage, label: "Design" } : stage), id), "Design");
  assert.equal(inboxPipelineChoices(layout, "Negotiation", id, false).value, "Negotiation");
  assert.deepEqual(inboxPipelineChoices(defaults, "Proposal", id, false), {
    value: "Proposal",
    stageIds: ["Lead", "Contacted", "Proposal", "Negotiation", "Closed"],
  });
  assert.ok(inboxPipelineChoices(layout, "Lead", null, true).stageIds.includes("Appointment Set"));
  assert.ok(inboxPipelineChoices(layout, "Lead", null, true).stageIds.includes("Qualified (Hot)"));
  assert.equal(inboxPipelineChoices(layout, "Under Contract", null, false).stageIds.at(-1), "Under Contract");
});

test("Inbox pipeline admission is localized", async () => {
  const locale = createInstance();
  await locale.init({ lng: "en", resources: { en: { translation: en }, he: { translation: he }, es: { translation: es } } });
  for (const [language, label] of [
    ["en", "Add to pipeline"], ["es", "Añadir al pipeline"], ["he", "הוספה לצינור המכירות"],
  ] as const) {
    await locale.changeLanguage(language);
    assert.equal(locale.t("inboxUi.addToPipeline"), label);
    assert.equal(locale.dir(), language === "he" ? "rtl" : "ltr");
  }
});
