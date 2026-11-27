import assert from "node:assert/strict";
import test from "node:test";
import { createInstance } from "i18next";
import en from "../client/src/locales/en.json";
import es from "../client/src/locales/es.json";
import he from "../client/src/locales/he.json";
import {
  campaignStatusLabel,
  templateCategoryLabel,
  templateStatusLabel,
  widgetOptionLabel,
} from "../client/src/lib/outreachPresentation";

test("outreach labels localize independently of approved template, campaign and widget values", async () => {
  const resources = { en: { translation: en }, es: { translation: es }, he: { translation: he } };
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources });

  const template = Object.freeze({ id: "template-123", language: "es_MX", status: "approved", category: "UTILITY", body: "Hola {{1}}" });
  const campaign = Object.freeze({ status: "active_pending", delayMinutes: 30, language: "es" });
  const widget = Object.freeze({ width: "compact", greeting: "שלום", matchType: "pathname" });
  const snapshot = structuredClone({ template, campaign, widget });

  for (const [language, { translation }] of Object.entries(resources)) {
    await i18n.changeLanguage(language);
    assert.equal(templateStatusLabel(i18n.t, template.status), translation.messageLibrary.approved);
    assert.equal(templateCategoryLabel(i18n.t, template.category, template.category), translation.outreachUi.utility);
    assert.equal(campaignStatusLabel(i18n.t, campaign.status), translation.outreachUi.activePending);
    assert.equal(widgetOptionLabel(i18n.t, widget.width), translation.outreachUi.compact);
    assert.equal(widgetOptionLabel(i18n.t, "provider-specific"), "provider-specific");
  }
  assert.deepEqual({ template, campaign, widget }, snapshot);
});
