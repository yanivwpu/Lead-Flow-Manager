/**
 * Free / no-AI-Brain AI Workspace copy — value-first, i18n, entitlement-aware.
 * Run: npx tsx --test tests/ai-workspace-locked-copy.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const PAGE = path.join(process.cwd(), "client/src/pages/AIBrain.tsx");
const EN = path.join(process.cwd(), "client/src/locales/en.json");
const ES = path.join(process.cwd(), "client/src/locales/es.json");
const HE = path.join(process.cwd(), "client/src/locales/he.json");

const WORKSPACE_KEYS = [
  "title",
  "valueLead",
  "assistLine",
  "brainGoesFurther",
  "brainSalesTeam",
  "brainContext",
  "readyHeadline",
  "readyBody",
  "cta",
  "viewPlans",
] as const;

function loadJson(file: string) {
  return JSON.parse(fs.readFileSync(file, "utf8")) as {
    aiBrain: { workspace: Record<string, string> };
  };
}

function flattenWorkspace(loc: ReturnType<typeof loadJson>) {
  return WORKSPACE_KEYS.map((k) => loc.aiBrain.workspace[k]).join("\n");
}

test("locked AI Workspace uses value-first EN copy via i18n keys", () => {
  const page = fs.readFileSync(PAGE, "utf8");
  const en = loadJson(EN).aiBrain.workspace;

  assert.equal(en.title, "AI Workspace");
  assert.equal(en.valueLead, "Turn your conversations into smarter sales decisions.");
  assert.match(en.assistLine, /AI Assist<\/assist> helps you write faster/);
  assert.match(
    en.brainGoesFurther,
    /AI Brain<\/brain> goes further — it remembers your business, understands conversations, scores opportunities, and powers smarter recommendations and automation/,
  );
  assert.match(en.brainSalesTeam, /the intelligence behind your <team>AI Sales Team<\/team>/);
  assert.match(
    en.brainContext,
    /recommend better next steps across conversations, prospects, and workflows/,
  );
  assert.equal(en.readyHeadline, "Ready for smarter AI?");
  assert.match(
    en.readyBody,
    /Upgrade to <pro>Pro<\/pro> to unlock <assist>AI Assist<\/assist> and <brain>AI Brain<\/brain>. AI Brain is included with Pro/,
  );
  assert.equal(en.cta, "Start Your 14-Day Free Trial");

  assert.ok(page.includes('t("aiBrain.workspace.title")'));
  assert.ok(page.includes('t("aiBrain.workspace.valueLead")'));
  assert.ok(page.includes('i18nKey="aiBrain.workspace.assistLine"'));
  assert.ok(page.includes('i18nKey="aiBrain.workspace.brainGoesFurther"'));
  assert.ok(page.includes('i18nKey="aiBrain.workspace.brainSalesTeam"'));
  assert.ok(page.includes('i18nKey="aiBrain.workspace.brainContext"'));
  assert.ok(page.includes('t("aiBrain.workspace.readyHeadline")'));
  assert.ok(page.includes('i18nKey="aiBrain.workspace.readyBody"'));
  assert.ok(page.includes('t("aiBrain.workspace.cta")'));
  assert.ok(page.includes('data-testid="ai-workspace-locked"'));
  assert.ok(page.includes('data-testid="button-ai-workspace-choose-plan"'));
  assert.ok(page.includes("handleProCheckout"));
  assert.ok(!page.includes("setBundleModalOpen(true)"));
  assert.ok(!page.includes("handlePlanAIBundleCheckout"));
});

test("obsolete plan-jargon copy is gone from the locked screen", () => {
  const page = fs.readFileSync(PAGE, "utf8");
  const en = flattenWorkspace(loadJson(EN));
  const lockedIntro = page.slice(
    page.indexOf("!hasAIAssist && !effectiveHasAIBrain"),
    page.indexOf("isFree && !isShopify"),
  );

  for (const gone of [
    "serious upgrade",
    "where enabled",
    "Choose plan & bundles",
    "Choose plan &amp; bundles",
    "Choose a plan to turn on AI Assist",
    "Starter is AI Assist Basic",
  ]) {
    assert.ok(!lockedIntro.includes(gone), `locked screen still contains "${gone}"`);
    assert.ok(!en.includes(gone.replace("&amp;", "&")), `EN workspace copy still contains "${gone}"`);
  }
});

test("locked screen does not present Brain as an add-on purchase", () => {
  const en = flattenWorkspace(loadJson(EN)).toLowerCase();
  assert.ok(en.includes("included with pro"));
  assert.ok(!en.includes("then add"));
  assert.ok(!en.includes("$29"));
  assert.ok(!en.includes("starter"));
});

test("entitlement gates are unchanged: Free locked vs active vs Starter upgrade", () => {
  const page = fs.readFileSync(PAGE, "utf8");
  assert.ok(page.includes("if (!hasAIAssist && !effectiveHasAIBrain)"));
  assert.ok(page.includes("const showBrainUpgradeSection = hasAIAssist && !effectiveHasAIBrain"));
  assert.ok(page.includes('data-testid="ai-workspace-active"'));
  assert.ok(page.includes("AI Brain is active — your intelligence layer is unlocked below."));

  const locked = page.slice(
    page.indexOf("if (!hasAIAssist && !effectiveHasAIBrain)"),
    page.indexOf("if (settingsLoading"),
  );
  const active = page.slice(page.indexOf('data-testid="ai-workspace-active"'));

  assert.ok(locked.includes("aiBrain.workspace.readyHeadline"));
  assert.ok(!active.includes("aiBrain.workspace.readyHeadline"));
  assert.ok(!active.includes("aiBrain.workspace.cta"));
  assert.ok(active.includes("AI Brain is active — your intelligence layer is unlocked below."));
});

test("EN/ES/HE workspace strings exist and locales stay aligned", () => {
  const en = loadJson(EN).aiBrain.workspace;
  const es = loadJson(ES).aiBrain.workspace;
  const he = loadJson(HE).aiBrain.workspace;

  for (const key of WORKSPACE_KEYS) {
    assert.equal(typeof en[key], "string", `en missing ${key}`);
    assert.equal(typeof es[key], "string", `es missing ${key}`);
    assert.equal(typeof he[key], "string", `he missing ${key}`);
    assert.ok(en[key].trim().length > 0, `en empty ${key}`);
    assert.ok(es[key].trim().length > 0, `es empty ${key}`);
    assert.ok(he[key].trim().length > 0, `he empty ${key}`);
  }

  assert.equal(en.title, es.title);
  assert.equal(en.title, he.title);

  const esAll = flattenWorkspace(loadJson(ES));
  const heAll = flattenWorkspace(loadJson(HE));
  assert.match(esAll, /Convierte tus conversaciones/);
  assert.match(esAll, /¿Listo para una IA más inteligente\?/);
  assert.match(esAll, /prueba gratis de 14 días/);
  assert.match(heAll, /הפוך את השיחות שלך/);
  assert.match(heAll, /מוכנים ל-AI חכם יותר/);
  assert.match(heAll, /ניסיון 14 הימים בחינם/);
  assert.ok(!esAll.toLowerCase().includes("serious upgrade"));
  assert.ok(!heAll.toLowerCase().includes("serious upgrade"));
});

test("Hebrew RTL: locked copy uses logical start alignment and LTR brand isolates", () => {
  const page = fs.readFileSync(PAGE, "utf8");
  const locked = page.slice(
    page.indexOf("if (!hasAIAssist && !effectiveHasAIBrain)"),
    page.indexOf("if (settingsLoading"),
  );
  assert.ok(locked.includes("text-start"));
  assert.ok(!locked.includes("text-left"));
  assert.ok(locked.includes('dir="ltr"'));
  assert.ok(locked.includes("<bdi"));
  assert.ok(locked.includes("Trans"));

  const he = loadJson(HE).aiBrain.workspace;
  assert.match(he.valueLead, /[\u0590-\u05FF]/);
  assert.match(he.readyHeadline, /[\u0590-\u05FF]/);
  assert.match(he.cta, /[\u0590-\u05FF]/);
  assert.ok(he.assistLine.includes("<assist>AI Assist</assist>"));
  assert.ok(he.brainGoesFurther.includes("<brain>AI Brain</brain>"));
});
