/**
 * CRM Integration card locale must follow the authenticated app locale.
 * Run: npx tsx --test tests/crm-integration-locale.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInstance } from "i18next";
import { crmIntegrationCardCopy } from "../client/src/lib/crmIntegrationCardCopy";
import type { CrmMarketplaceConnectionState } from "../shared/ghlConnectionState";
import type { UserLanguage } from "../shared/userLanguage";
import { isCrmMarketplaceHandoffRedirect } from "../shared/ghlOAuthHandoff";

const root = process.cwd();
const en = JSON.parse(readFileSync(join(root, "client/src/locales/en.json"), "utf8"));
const es = JSON.parse(readFileSync(join(root, "client/src/locales/es.json"), "utf8"));
const he = JSON.parse(readFileSync(join(root, "client/src/locales/he.json"), "utf8"));
const bundles: Record<UserLanguage, { crm: Record<string, string> }> = {
  en: { crm: en.integrations.crm },
  es: { crm: es.integrations.crm },
  he: { crm: he.integrations.crm },
};

const STATES: CrmMarketplaceConnectionState[] = [
  "connected",
  "installed_incomplete",
  "installed_expired",
  "not_connected",
];

async function makeI18n(lng: UserLanguage) {
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

function expectedForState(locale: UserLanguage, state: CrmMarketplaceConnectionState) {
  const crm = bundles[locale].crm;
  if (state === "connected") {
    return { statusLabel: crm.connectedStatus, description: crm.connectedDescription, cta: crm.connectedStatus };
  }
  if (state === "installed_incomplete") {
    return {
      statusLabel: crm.connectionRequiredStatus,
      description: crm.incompleteDescription,
      cta: crm.finishCta,
    };
  }
  if (state === "installed_expired") {
    return {
      statusLabel: crm.connectionRequiredStatus,
      description: crm.expiredDescription,
      cta: crm.reconnectCta,
    };
  }
  return {
    statusLabel: crm.notConnectedStatus,
    description: crm.notConnectedDescription,
    cta: crm.connectCta,
  };
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
    copy.manageDescription,
    copy.debugDescription,
  ];
}

test("1. App locale English + i18n instance Spanish (browser/Accept-Language) → English card copy", async () => {
  const spanishInstance = await makeI18n("es");
  assert.equal(spanishInstance.language, "es");
  for (const state of STATES) {
    const copy = crmIntegrationCardCopy(state, spanishInstance.t.bind(spanishInstance), "en");
    const expected = expectedForState("en", state);
    assert.equal(copy.statusLabel, expected.statusLabel, state);
    assert.equal(copy.description, expected.description, state);
    assert.equal(copy.cta, expected.cta, state);
    assert.equal(copy.label, bundles.en.crm.label);
    assert.doesNotMatch(copy.statusLabel, /Conexión|Conectado/);
    assert.doesNotMatch(copy.description, /Tu aplicación|Tu conexión/);
    assert.doesNotMatch(copy.cta, /Terminar|Conectar CRM|Volver/);
  }
});

test("2. App locale Spanish → all card copy is Spanish", async () => {
  const i18n = await makeI18n("en");
  for (const state of STATES) {
    const copy = crmIntegrationCardCopy(state, i18n.t.bind(i18n), "es");
    const expected = expectedForState("es", state);
    assert.equal(copy.statusLabel, expected.statusLabel);
    assert.equal(copy.description, expected.description);
    assert.equal(copy.cta, expected.cta);
    assert.equal(copy.label, bundles.es.crm.label);
  }
});

test("3. App locale Hebrew → all card copy is Hebrew", async () => {
  const i18n = await makeI18n("en");
  for (const state of STATES) {
    const copy = crmIntegrationCardCopy(state, i18n.t.bind(i18n), "he");
    const expected = expectedForState("he", state);
    assert.equal(copy.statusLabel, expected.statusLabel);
    assert.equal(copy.description, expected.description);
    assert.equal(copy.cta, expected.cta);
    assert.equal(copy.label, bundles.he.crm.label);
  }
});

test("4. Every connection state in every supported locale", async () => {
  const i18n = await makeI18n("en");
  for (const locale of ["en", "es", "he"] as const) {
    for (const state of STATES) {
      const copy = crmIntegrationCardCopy(state, i18n.t.bind(i18n), locale);
      const expected = expectedForState(locale, state);
      assert.equal(copy.state, state);
      assert.equal(copy.statusLabel, expected.statusLabel);
      assert.equal(copy.description, expected.description);
      assert.equal(copy.cta, expected.cta);
    }
  }
});

test("5. No mixed-language card", async () => {
  const i18n = await makeI18n("es");
  const english = crmIntegrationCardCopy("installed_incomplete", i18n.t.bind(i18n), "en");
  for (const value of cardStrings(english)) {
    assert.doesNotMatch(value, /Conexión requerida|Terminar conexión|Tu aplicación de CRM/);
    assert.doesNotMatch(value, /נדרש חיבור|השלם חיבור/);
  }
  const spanish = crmIntegrationCardCopy("installed_incomplete", i18n.t.bind(i18n), "es");
  assert.equal(spanish.statusLabel, "Conexión requerida");
  assert.equal(spanish.cta, "Terminar conexión");
  assert.match(spanish.description, /autorización está incompleta/);
  for (const value of cardStrings(spanish)) {
    assert.doesNotMatch(value, /Connection required|Finish connection|Your CRM app is installed/);
  }
});

test("6. OAuth handoff/login does not overwrite an existing authenticated locale", () => {
  const pref = readFileSync(join(root, "client/src/lib/userLanguagePreference.ts"), "utf8");
  const auth = readFileSync(join(root, "client/src/lib/auth-context.tsx"), "utf8");
  const loginFn = auth.slice(auth.indexOf("const login"), auth.indexOf("const signup"));
  assert.doesNotMatch(loginFn, /persistAuthenticatedLanguage/);
  assert.doesNotMatch(loginFn, /\/api\/user\/language/);
  assert.match(auth, /applyDatabaseLanguagePreference\(user\.language\)/);
  assert.match(pref, /isCrmMarketplaceHandoffRedirect/);
  assert.match(pref, /normalizeUserLanguage\(rawLanguage\) \?\? "en"/);
  assert.equal(isCrmMarketplaceHandoffRedirect("/app/integrations"), true);
});

test("7. Server connection-status response remains machine-readable and sanitized", () => {
  const routes = readFileSync(join(root, "server/ghlRoutes.ts"), "utf8");
  const statusHandler = routes.slice(routes.indexOf("router.get('/connection-status'"));
  const successIdx = statusHandler.indexOf("connectionState: status.connectionState");
  assert.ok(successIdx >= 0, "success payload must include machine-readable connectionState");
  const jsonBlock = statusHandler.slice(Math.max(0, successIdx - 250), successIdx + 450);
  assert.doesNotMatch(jsonBlock, /Accept-Language/);
  assert.doesNotMatch(jsonBlock, /Conexión requerida/);
  assert.doesNotMatch(jsonBlock, /Finish connection/);
  assert.doesNotMatch(jsonBlock, /accessToken/);
  assert.doesNotMatch(jsonBlock, /refreshToken/);
  assert.doesNotMatch(statusHandler, /req\.headers\[['"]accept-language['"]\]/i);
  assert.doesNotMatch(routes, /connectionState:\s*["']Conexión/);
});

test("8. Admin diagnostic labels follow the active client locale", async () => {
  const i18n = await makeI18n("es");
  const enCopy = crmIntegrationCardCopy("not_connected", i18n.t.bind(i18n), "en");
  const esCopy = crmIntegrationCardCopy("not_connected", i18n.t.bind(i18n), "es");
  assert.equal(enCopy.previewConnectionUrl, bundles.en.crm.previewConnectionUrl);
  assert.equal(enCopy.debugTitle, bundles.en.crm.debugTitle);
  assert.equal(esCopy.previewConnectionUrl, bundles.es.crm.previewConnectionUrl);
  assert.equal(esCopy.debugTitle, bundles.es.crm.debugTitle);
  const src = readFileSync(join(root, "client/src/pages/Integrations.tsx"), "utf8");
  assert.match(src, /resolveAuthenticatedAppLocale\(user\?\.language\)/);
  assert.match(src, /crmLocale/);
});

test("9. Ordinary users still cannot access diagnostic URLs", () => {
  const src = readFileSync(join(root, "client/src/pages/Integrations.tsx"), "utf8");
  assert.match(
    src,
    /isLeadConnector && canAccessCrmDiagnostics && !lcConnected && \([\s\S]{0,800}?previewConnectionUrl/,
  );
  assert.match(src, /lcStatus\?\.canAccessCrmDiagnostics \? \(/);
  const routes = readFileSync(join(root, "server/ghlRoutes.ts"), "utf8");
  assert.match(routes, /oauth-authorize-debug/);
  assert.match(routes, /canAccessRecoveryTools/);
});

test("10. i18n detector does not use navigator/Accept-Language", () => {
  const i18nSrc = readFileSync(join(root, "client/src/lib/i18n.ts"), "utf8");
  assert.match(i18nSrc, /order:\s*\[\s*'localStorage'\s*\]/);
  assert.doesNotMatch(i18nSrc, /order:\s*\[[^\]]*navigator/);
  const integrations = readFileSync(join(root, "client/src/pages/Integrations.tsx"), "utf8");
  assert.match(integrations, /lng:\s*crmLocale|crmLocale/);
  assert.doesNotMatch(integrations, /navigator\.language/);
  assert.doesNotMatch(integrations, /Accept-Language/);
});

test("11. Locale files share the same CRM card keys", () => {
  const enKeys = Object.keys(bundles.en.crm).sort();
  assert.deepEqual(Object.keys(bundles.es.crm).sort(), enKeys);
  assert.deepEqual(Object.keys(bundles.he.crm).sort(), enKeys);
  assert.equal(bundles.en.crm.connectionRequiredStatus, "Connection required");
  assert.equal(bundles.es.crm.connectionRequiredStatus, "Conexión requerida");
  assert.equal(bundles.he.crm.connectionRequiredStatus, "נדרש חיבור");
  assert.equal(bundles.en.crm.label, "CRM Integration");
  assert.equal(bundles.es.crm.label, "Integración CRM");
});
