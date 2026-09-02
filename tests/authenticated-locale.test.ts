/**
 * Authenticated locale precedence: untrusted detector cache must not win.
 * Run: npx tsx --test tests/authenticated-locale.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LANGUAGE_CACHE_KEY,
  LANGUAGE_SOURCE_KEY,
  TRUSTED_LANGUAGE_SOURCE,
  overwriteUntrustedLanguageCache,
  resolveAuthenticatedAppLocaleFromState,
  shouldOverwriteUntrustedLanguageCache,
} from "../shared/authenticatedLocale";
import { crmIntegrationCardCopy } from "../client/src/lib/crmIntegrationCardCopy";
import { createInstance } from "i18next";
import type { CrmMarketplaceConnectionState } from "../shared/ghlConnectionState";

const root = process.cwd();
const en = JSON.parse(readFileSync(join(root, "client/src/locales/en.json"), "utf8"));
const es = JSON.parse(readFileSync(join(root, "client/src/locales/es.json"), "utf8"));
const he = JSON.parse(readFileSync(join(root, "client/src/locales/he.json"), "utf8"));

const STATES: CrmMarketplaceConnectionState[] = [
  "connected",
  "installed_incomplete",
  "installed_expired",
  "not_connected",
];

async function makeI18n(lng: "en" | "es" | "he") {
  const instance = createInstance();
  await instance.init({
    lng,
    fallbackLng: "en",
    supportedLngs: ["en", "es", "he"],
    resources: {
      en: { translation: en },
      es: { translation: es },
      he: { translation: he },
    },
  });
  return instance;
}

function cardStrings(copy: ReturnType<typeof crmIntegrationCardCopy>): string[] {
  return [
    copy.statusLabel,
    copy.description,
    copy.cta,
    copy.label,
    copy.manageCta,
    copy.previewConnectionUrl,
    copy.debugTitle,
  ];
}

test("legacy whachatcrm_language=es without user marker is untrusted and resolves to English", async () => {
  const memory = new Map<string, string>([[LANGUAGE_CACHE_KEY, "es"]]);
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };

  const input = {
    explicitSessionLanguage: null,
    userLanguage: null,
    cachedLanguage: storage.getItem(LANGUAGE_CACHE_KEY),
    languageSource: storage.getItem(LANGUAGE_SOURCE_KEY),
    i18nLanguage: "es",
  };

  const locale = resolveAuthenticatedAppLocaleFromState(input);
  assert.equal(locale, "en");
  assert.equal(shouldOverwriteUntrustedLanguageCache(input), true);
  overwriteUntrustedLanguageCache(storage);
  assert.equal(storage.getItem(LANGUAGE_CACHE_KEY), "en");
  assert.equal(storage.getItem(LANGUAGE_SOURCE_KEY), null);

  const i18n = await makeI18n("es");
  assert.equal(i18n.language, "es");
  for (const state of STATES) {
    const copy = crmIntegrationCardCopy(state, i18n.t.bind(i18n), locale);
    for (const value of cardStrings(copy)) {
      assert.doesNotMatch(value, /Conexión requerida|Terminar conexión|Tu aplicación de CRM|Integración CRM/);
      assert.doesNotMatch(value, /נדרש חיבור|השלם חיבור/);
    }
    if (state === "installed_incomplete") {
      assert.equal(copy.statusLabel, "Connection required");
      assert.equal(copy.cta, "Finish connection");
      assert.equal(copy.label, "CRM Integration");
    }
  }
});

test("user.language=en is entirely English even with Spanish cache and i18n", async () => {
  const i18n = await makeI18n("es");
  const locale = resolveAuthenticatedAppLocaleFromState({
    explicitSessionLanguage: null,
    userLanguage: "en",
    cachedLanguage: "es",
    languageSource: null,
    i18nLanguage: "es",
  });
  assert.equal(locale, "en");
  const copy = crmIntegrationCardCopy("installed_incomplete", i18n.t.bind(i18n), locale);
  assert.equal(copy.statusLabel, "Connection required");
  assert.equal(copy.cta, "Finish connection");
  assert.equal(copy.label, "CRM Integration");
});

test("user.language=es is entirely Spanish", async () => {
  const i18n = await makeI18n("en");
  const locale = resolveAuthenticatedAppLocaleFromState({
    explicitSessionLanguage: null,
    userLanguage: "es",
    cachedLanguage: "en",
    languageSource: null,
    i18nLanguage: "en",
  });
  assert.equal(locale, "es");
  const copy = crmIntegrationCardCopy("installed_incomplete", i18n.t.bind(i18n), locale);
  assert.equal(copy.statusLabel, "Conexión requerida");
  assert.equal(copy.cta, "Terminar conexión");
  assert.equal(copy.label, "Integración CRM");
});

test("user.language=he is entirely Hebrew", async () => {
  const i18n = await makeI18n("en");
  const locale = resolveAuthenticatedAppLocaleFromState({
    explicitSessionLanguage: null,
    userLanguage: "he",
    cachedLanguage: "en",
    languageSource: null,
    i18nLanguage: "en",
  });
  assert.equal(locale, "he");
  const copy = crmIntegrationCardCopy("not_connected", i18n.t.bind(i18n), locale);
  assert.equal(copy.statusLabel, he.integrations.crm.notConnectedStatus);
  assert.equal(copy.label, he.integrations.crm.label);
});

test("trusted explicit selector cache is honored when DB language is missing", () => {
  const locale = resolveAuthenticatedAppLocaleFromState({
    explicitSessionLanguage: null,
    userLanguage: null,
    cachedLanguage: "he",
    languageSource: TRUSTED_LANGUAGE_SOURCE,
    i18nLanguage: "en",
  });
  assert.equal(locale, "he");
  assert.equal(
    shouldOverwriteUntrustedLanguageCache({
      explicitSessionLanguage: null,
      userLanguage: null,
      cachedLanguage: "he",
      languageSource: TRUSTED_LANGUAGE_SOURCE,
    }),
    false,
  );
});

test("explicit in-session selection wins over DB and stale cache", () => {
  assert.equal(
    resolveAuthenticatedAppLocaleFromState({
      explicitSessionLanguage: "es",
      userLanguage: "en",
      cachedLanguage: "he",
      languageSource: TRUSTED_LANGUAGE_SOURCE,
    }),
    "es",
  );
});

test("all four CRM states share the resolved English locale with no mixed card", async () => {
  const i18n = await makeI18n("es");
  const locale = resolveAuthenticatedAppLocaleFromState({
    explicitSessionLanguage: null,
    userLanguage: null,
    cachedLanguage: "es",
    languageSource: null,
    i18nLanguage: "es",
  });
  assert.equal(locale, "en");
  for (const state of STATES) {
    const copy = crmIntegrationCardCopy(state, i18n.t.bind(i18n), locale);
    for (const value of cardStrings(copy)) {
      assert.doesNotMatch(value, /Conexión|Terminar conexión|Integración CRM/);
    }
  }
});

test("LanguageSelector is the only trusted source writer", () => {
  const pref = readFileSync(join(root, "client/src/lib/userLanguagePreference.ts"), "utf8");
  const selector = readFileSync(join(root, "client/src/components/LanguageSelector.tsx"), "utf8");
  const i18n = readFileSync(join(root, "client/src/lib/i18n.ts"), "utf8");
  const marketing = readFileSync(join(root, "client/src/lib/marketingLocaleRouting.ts"), "utf8");
  assert.match(pref, /noteExplicitLanguageSelection/);
  assert.match(pref, /TRUSTED_LANGUAGE_SOURCE/);
  assert.match(selector, /noteExplicitLanguageSelection\(lang/);
  assert.doesNotMatch(i18n, /LANGUAGE_SOURCE_KEY|whachatcrm_language_source/);
  assert.doesNotMatch(marketing, /LANGUAGE_SOURCE_KEY|whachatcrm_language_source/);
});
