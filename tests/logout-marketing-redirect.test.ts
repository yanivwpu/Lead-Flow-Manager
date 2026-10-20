/**
 * Production sign-out routing regressions.
 * Run: npx tsx --test tests/logout-marketing-redirect.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveLogoutLandingUrl } from "../client/src/lib/logoutRedirect";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("successful logout from the production app lands on the public website", () => {
  assert.equal(
    resolveLogoutLandingUrl("https://app.whachatcrm.com"),
    "https://www.whachatcrm.com/",
  );
});

test("staging, localhost and public hosts stay on their original origin", () => {
  for (const origin of [
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "https://whachatcrm-staging-app-staging.up.railway.app",
    "https://www.whachatcrm.com",
    "https://whachatcrm.com",
  ]) {
    assert.equal(resolveLogoutLandingUrl(origin), null, origin);
  }
});

test("auth logout redirects only after an acknowledged server sign-out", () => {
  const source = fs.readFileSync(path.join(root, "client/src/lib/auth-context.tsx"), "utf8");
  const logout = source.slice(source.indexOf("  const logout = async () =>"), source.indexOf("\n  return (\n    <AuthContext.Provider"));
  assert.match(logout, /const response = await fetch\("\/api\/auth\/logout"/);
  assert.match(logout, /if \(!response\.ok\) \{[\s\S]*?return;/);
  assert.match(logout, /resetAccountQueryCache\(queryClient\)/);
  assert.match(logout, /clearAccountLocalHints\(\)/);
  assert.match(logout, /resolveLogoutLandingUrl\(window\.location\.origin\)/);
  assert.match(logout, /window\.location\.replace\(landingUrl\)/);
  assert.match(logout, /setLocation\("\/"\)/);
  assert.doesNotMatch(logout, /finally\s*\{/);
});
