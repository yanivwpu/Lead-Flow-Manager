import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createInstance } from "i18next";
import en from "../client/src/locales/en.json";
import es from "../client/src/locales/es.json";
import he from "../client/src/locales/he.json";

const resources = { en: { translation: en }, es: { translation: es }, he: { translation: he } };
const page = (name: string) => readFileSync(new URL(`../client/src/pages/${name}.tsx`, import.meta.url), "utf8");

test("workflow delays translate only display copy and retain canonical day and hour values", async () => {
  const source = page("Workflows");
  assert.match(source, /const FOLLOWUP_DAYS\s*= \["1", "3", "7", "14", "30"\]/);
  assert.match(source, /const NO_REPLY_HOURS = \["1", "2", "4", "8", "12", "24", "48", "72"\]/);
  assert.match(source, /<SelectItem key=\{d\} value=\{d\}>\{t\("workflowEditor\.durationDays", \{ count: Number\(d\) \}\)\}/);
  assert.match(source, /<SelectItem key=\{hours\} value=\{hours\}>\s*\{hours === "72"/);
  assert.match(source, /onValueChange=\{onChangeDuration\}/);

  const i18n = createInstance();
  await i18n.init({ lng: "en", resources });
  const labels = new Set<string>();
  for (const language of Object.keys(resources)) {
    await i18n.changeLanguage(language);
    labels.add(i18n.t("workflowEditor.durationDays", { count: 3 }));
    assert.ok(i18n.t("workflowEditor.durationHours", { count: 24 }).includes("24"));
  }
  assert.equal(labels.size, 3);
});

test("chatbot delay and website placement controls keep their stored values", () => {
  const chatbot = page("ChatbotBuilder");
  for (const unit of ["minutes", "hours", "days"]) {
    assert.ok(chatbot.includes(`<SelectItem value="${unit}">{t("automationUi.${unit}")}</SelectItem>`));
  }
  const widget = page("WebsiteWidget");
  for (const position of ["left", "right"]) {
    assert.ok(widget.includes(`updateSettings({ position: "${position}" })`));
    assert.ok(widget.includes(`t("widgetEditor.${position}")`));
  }
});
