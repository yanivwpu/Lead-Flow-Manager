import assert from "node:assert/strict";
import test from "node:test";
import { createInstance } from "i18next";
import en from "../client/src/locales/en.json";
import he from "../client/src/locales/he.json";
import es from "../client/src/locales/es.json";
import { copilotActionLabel, quickFollowUpDate, quickFollowUpOptions } from "../client/src/lib/inboxCopilotPresentation";
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
