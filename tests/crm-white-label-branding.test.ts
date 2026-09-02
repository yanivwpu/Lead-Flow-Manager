/**
 * Customer-facing CRM white-label branding scan.
 * Run: npx tsx --test tests/crm-white-label-branding.test.ts
 *
 * Flags HighLevel / GoHighLevel / Go High Level / standalone GHL in customer-visible
 * source and localization files. Internal identifiers, admin diagnostics, API URLs,
 * stored tag values, and the dedicated agency landing page are excluded.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();

const SCAN_ROOTS = [
  "client/src/pages",
  "client/src/components",
  "client/src/locales",
  "client/src/content/seo",
  "shared/leadConnectorWhiteLabel.ts",
  "shared/ghlOAuthRecoveryMessages.ts",
  "shared/pricingPageContent.ts",
  "shared/pricingPageLocales.ts",
  "shared/productPages.ts",
  "shared/productPageLocales.ts",
  "shared/solutionPages.ts",
  "shared/solutionPageLocales.ts",
];

const EXCLUDED_PATH_FRAGMENTS = [
  `${sep}admin${sep}`,
  `${sep}Admin.tsx`,
  `${sep}GoHighLevelAgencies.tsx`,
  `${sep}goHighLevelAgenciesContent.ts`,
  `${sep}AdminGhlTab.tsx`,
  `${sep}AdminActivationTab.tsx`,
];

const EXT = new Set([".ts", ".tsx", ".json"]);

function walk(abs: string, out: string[]): void {
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const name of readdirSync(abs)) {
      if (name === "node_modules" || name === "dist") continue;
      walk(join(abs, name), out);
    }
    return;
  }
  const lower = abs.toLowerCase();
  if (![...EXT].some((e) => lower.endsWith(e))) return;
  const rel = relative(root, abs);
  const norm = `${sep}${rel.replace(/[\\/]/g, sep)}`;
  if (EXCLUDED_PATH_FRAGMENTS.some((frag) => norm.includes(frag) || norm.endsWith(frag))) return;
  out.push(abs);
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const rel of SCAN_ROOTS) {
    walk(join(root, rel), files);
  }
  return files;
}

const HIGHLEVEL = /(?:Go\s+High\s+Level|GoHighLevel|HighLevel)/i;
/** Standalone GHL: not part of Imported-GHL, GHL_*, or hyphenated codes. */
const STANDALONE_GHL = /(^|[^A-Za-z0-9_/\-])GHL([^A-Za-z0-9_]|$)/;

function stripIgnorable(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return false;
      if (t.startsWith("import ") || t.startsWith("} from ")) return false;
      return true;
    })
    .join("\n");
}

function quotedCustomerCopy(source: string): string[] {
  const out: string[] = [];
  const stripped = stripIgnorable(source);
  let m: RegExpExecArray | null;
  const re = /(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g;
  while ((m = re.exec(stripped))) {
    const raw = m[0].slice(1, -1);
    const normalized = raw.trim();
    if (!normalized) continue;
    if (/^gohighlevel$/i.test(normalized)) continue;
    if (normalized === "Imported-GHL") continue;
    if (/gohighlevel\.com|leadconnectorhq\.com|\/go-high-level-agencies/i.test(normalized)) continue;
    out.push(raw.replace(/gohighlevel/gi, "").replace(/Imported-GHL/g, ""));
  }
  return out;
}

test("customer-facing copy has no HighLevel / GHL branding", () => {
  const hits: string[] = [];
  for (const file of collectFiles()) {
    const rel = relative(root, file).replace(/\\/g, "/");
    for (const quoted of quotedCustomerCopy(readFileSync(file, "utf8"))) {
      if (HIGHLEVEL.test(quoted) || STANDALONE_GHL.test(quoted)) {
        hits.push(`${rel}: ${quoted.trim().slice(0, 160)}`);
      }
    }
  }
  assert.equal(hits.length, 0, `Prohibited branding in customer-facing copy:\n${hits.join("\n")}`);
});

test("CRM Integration card uses required customer-facing states", () => {
  const src = readFileSync(join(root, "client/src/pages/Integrations.tsx"), "utf8");
  const white = readFileSync(join(root, "shared/leadConnectorWhiteLabel.ts"), "utf8");
  assert.match(white, /CRM_INTEGRATION_LABEL = "CRM Integration"/);
  assert.match(white, /CRM_INSTALL_CTA = "Connect CRM"/);
  assert.match(white, /CRM_COMPLETE_OAUTH_CTA = "Finish connection"/);
  assert.match(white, /CRM_RECONNECT_CTA = "Reconnect CRM"/);
  assert.match(white, /CRM_CONNECTION_REQUIRED_STATUS = "Connection required"/);
  assert.match(white, /CRM_NOT_CONNECTED_STATUS = "Not connected"/);
  assert.match(white, /CRM_MANAGE_CTA = "Manage integration"/);
  assert.match(white, /Connect WhachatCRM with your CRM to sync prospects, contacts, and conversations/);
  assert.match(white, /Your CRM app is installed, but authorization is incomplete/);
  assert.match(white, /Your CRM connection needs to be renewed/);
  assert.match(white, /Your CRM connection is active/);
  assert.match(white, /Opening your CRM authorization/);
  assert.doesNotMatch(src, /Needs OAuth/);
  assert.doesNotMatch(src, /Preview OAuth URL \(debug\)/);
  assert.doesNotMatch(src, /Complete OAuth/);
  assert.doesNotMatch(src, /Try full OAuth authorization/);
  assert.doesNotMatch(src, /Installed in GHL/);
  assert.match(src, /canAccessCrmDiagnostics/);
  assert.match(src, /CRM_OPENING_AUTHORIZATION/);
});

test("Prospect AI import copy is CRM-neutral", () => {
  const prospect = readFileSync(join(root, "client/src/pages/ProspectAI.tsx"), "utf8");
  const wizard = readFileSync(join(root, "client/src/components/settings/GhlProspectImport.tsx"), "utf8");
  const labels = readFileSync(join(root, "shared/prospectImport.ts"), "utf8");
  assert.match(prospect, /Import from CRM/);
  assert.doesNotMatch(prospect, /GoHighLevel Import/);
  assert.match(wizard, /Select CRM location/);
  assert.match(wizard, /CRM contacts/);
  assert.match(labels, /gohighlevel: "CRM"/);
  assert.match(labels, /"Imported-GHL": "Imported-CRM"/);
});
