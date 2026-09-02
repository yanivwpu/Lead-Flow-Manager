/**
 * Authenticated user language preference: restore, precedence, signup, API.
 * Run: npx tsx --test tests/user-language-preference.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  isPublicLocaleAuthoritativePath,
  parseLocalizedPath,
} from "../shared/localeRoutes";
import {
  isSupportedUserLanguage,
  normalizeUserLanguage,
} from "../shared/userLanguage";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

test("normalizeUserLanguage accepts en|es|he and rejects invalid", () => {
  assert.equal(normalizeUserLanguage("en"), "en");
  assert.equal(normalizeUserLanguage("es"), "es");
  assert.equal(normalizeUserLanguage("he"), "he");
  assert.equal(normalizeUserLanguage("HE"), "he");
  assert.equal(normalizeUserLanguage("es-MX"), "es");
  assert.equal(normalizeUserLanguage("he-IL"), "he");
  assert.equal(normalizeUserLanguage("ar"), null);
  assert.equal(normalizeUserLanguage("fr"), null);
  assert.equal(normalizeUserLanguage(""), null);
  assert.equal(normalizeUserLanguage(null), null);
  assert.equal(normalizeUserLanguage(undefined), null);
  assert.equal(normalizeUserLanguage(123), null);
  assert.equal(isSupportedUserLanguage("en"), true);
  assert.equal(isSupportedUserLanguage("ar"), false);
});

test("public URL locale is authoritative on Phase 2 marketing paths", () => {
  assert.equal(isPublicLocaleAuthoritativePath("/es/ai-brain"), true);
  assert.equal(isPublicLocaleAuthoritativePath("/he/pricing"), true);
  assert.equal(isPublicLocaleAuthoritativePath("/ai-brain"), true);
  assert.equal(isPublicLocaleAuthoritativePath("/pricing"), true);
  assert.equal(isPublicLocaleAuthoritativePath("/es/"), true);
  assert.equal(isPublicLocaleAuthoritativePath("/"), true);
  assert.equal(isPublicLocaleAuthoritativePath("/app/inbox"), false);
  assert.equal(isPublicLocaleAuthoritativePath("/auth"), false);
  assert.equal(isPublicLocaleAuthoritativePath("/blog"), false);
  assert.equal(parseLocalizedPath("/es/ai-brain").locale, "es");
  assert.equal(parseLocalizedPath("/he/pricing").locale, "he");
  assert.equal(parseLocalizedPath("/ai-brain").locale, "en");
});

test("auth context restores DB language from /api/auth/me without a second profile request", () => {
  const auth = read("client/src/lib/auth-context.tsx");
  assert.match(auth, /language\?:\s*string\s*\|\s*null/);
  assert.match(auth, /applyDatabaseLanguagePreference/);
  assert.match(auth, /resolveSignupLanguagePreference/);
  assert.match(auth, /language,/);
  assert.match(auth, /clearExplicitLanguageSelection/);
  assert.doesNotMatch(
    auth,
    /fetch\(\s*["']\/api\/user\/profile/,
    "must not add a second profile endpoint",
  );
  // Restore tied to existing user object + location (leave public → app)
  assert.match(auth, /user\?\.language/);
  assert.match(auth, /isLoading \|\| !user/);
});

test("LanguageSelector notes explicit selection before persist and skips unauthenticated PATCH spam pattern", () => {
  const sel = read("client/src/components/LanguageSelector.tsx");
  assert.match(sel, /noteExplicitLanguageSelection/);
  assert.match(sel, /persistAuthenticatedLanguage/);
  assert.match(sel, /changeLanguage\(lang\)/);
  // Must not raw-fetch PATCH for every visitor (including logged-out)
  assert.doesNotMatch(sel, /fetch\(\s*['"]\/api\/user\/language['"]/);
});

test("persistAuthenticatedLanguage skips redundant PATCH and keeps UI on failure", () => {
  const pref = read("client/src/lib/userLanguagePreference.ts");
  assert.match(pref, /lastKnownPersistedLanguage === lang/);
  assert.match(pref, /persistInFlightFor/);
  assert.match(pref, /generationAtStart === explicitGeneration/);
  assert.match(pref, /Failed to save language preference/);
  assert.match(pref, /explicitSessionLanguage/);
  assert.match(pref, /isPublicLocaleAuthoritativePath/);
  // Failed persist must not call changeLanguage to revert
  const persistFn = pref.slice(pref.indexOf("persistAuthenticatedLanguage"));
  assert.doesNotMatch(persistFn.slice(0, 1200), /changeLanguage\(/);
});

test("signup persists validated language in createUser transaction", () => {
  const authServer = read("server/auth.ts");
  assert.match(authServer, /normalizeUserLanguage/);
  assert.match(authServer, /signupLanguage/);
  assert.match(authServer, /language:\s*signupLanguage/);
  // Language failure must not be a separate blocking step after create
  assert.doesNotMatch(
    authServer,
    /createUser\([\s\S]*?\}\);[\s\S]*?\/api\/user\/language/,
  );
});

test("PATCH /api/user/language accepts only en|es|he and requires auth", () => {
  const routes = read("server/routes.ts");
  const idx = routes.indexOf('app.patch("/api/user/language"');
  assert.ok(idx >= 0);
  const slice = routes.slice(idx, idx + 700);
  assert.match(slice, /Unauthorized/);
  assert.match(slice, /normalizeUserLanguage/);
  assert.match(slice, /updateUser\(req\.user\.id/);
  assert.doesNotMatch(slice, /'ar'/);
  assert.doesNotMatch(slice, /req\.params\.userId|req\.body\.userId/);
});

test("schema language field exists — no migration required", () => {
  const schema = read("shared/schema.ts");
  assert.match(schema, /language:\s*text\("language"\)\.default\("en"\)/);
});

test("i18n changeLanguage updates localStorage, lang, dir, and notifies listeners", () => {
  const i18n = read("client/src/lib/i18n.ts");
  assert.match(i18n, /localStorage\.setItem\('whachatcrm_language'/);
  assert.match(i18n, /document\.documentElement\.dir/);
  assert.match(i18n, /document\.documentElement\.lang/);
  assert.match(i18n, /languageChanged/);
  assert.match(i18n, /split\('-'\)\[0\]/);
  assert.match(i18n, /order:\s*\[\s*'localStorage'\s*\]/);
  assert.doesNotMatch(i18n, /order:\s*\[[^\]]*navigator/);
});

test("logout keeps localStorage language preference", () => {
  const auth = read("client/src/lib/auth-context.tsx");
  const logout = auth.slice(auth.indexOf("const logout"));
  assert.doesNotMatch(
    logout.slice(0, 800),
    /removeItem\(\s*['"]whachatcrm_language['"]/,
  );
  assert.match(logout.slice(0, 800), /clearExplicitLanguageSelection/);
});

test("marketing URL sync still forces public locale (Phase 2 regression guard)", () => {
  const routing = read("client/src/lib/marketingLocaleRouting.ts");
  assert.match(routing, /useSyncLanguageFromMarketingUrl/);
  assert.match(routing, /hasLocalizedVersion/);
  assert.match(routing, /changeLanguage\(parsed\.locale/);
  assert.match(routing, /changeLanguage\("en"\)/);
});

test("bootstrap prefers URL locale and forces English i18n on unprefixed Phase 2", () => {
  const boot = read("client/src/bootstrap.tsx");
  assert.match(boot, /whachatcrm_language/);
  assert.match(boot, /parseLocalizedPath/);
  assert.match(boot, /changeLanguage\("en"\)|changeLanguage\('en'\)/);
  assert.doesNotMatch(boot, /\/api\/auth\/me|applyDatabaseLanguagePreference/);
});

test("authenticated restore defaults missing DB language to en rather than leaving detector locale", () => {
  const pref = read("client/src/lib/userLanguagePreference.ts");
  assert.match(pref, /normalizeUserLanguage\(rawLanguage\) \?\? "en"/);
  assert.match(pref, /resolveAuthenticatedAppLocale/);
  assert.match(pref, /isCrmMarketplaceHandoffRedirect/);
});

test("RTL helpers: Hebrew uses rtl; others ltr via supportedLanguages", () => {
  const i18n = read("client/src/lib/i18n.ts");
  assert.match(i18n, /he:\s*\{[^}]*dir:\s*'rtl'/);
  assert.match(i18n, /en:\s*\{[^}]*dir:\s*'ltr'/);
  assert.match(i18n, /es:\s*\{[^}]*dir:\s*'ltr'/);
});
