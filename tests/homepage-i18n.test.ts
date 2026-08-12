/**
 * Homepage localization completeness: content model, SSR, and static shell.
 * Run: npx tsx --test tests/homepage-i18n.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "fs";
import path from "path";
import { getLocalizedHomepage } from "../shared/localizeMarketingContent";
import {
  needsHebrewAiBidiLayout,
  splitHebrewAiBidiText,
} from "../shared/rtlLeadingLtrIsolate";
import {
  generateHomepageHtml,
  injectHomepageSeoMeta,
  injectLocalizedStaticShell,
  removeStaticShellFromHtml,
} from "../server/seo";

const NARROW_ALLOWLIST = [
  "WhachatCRM",
  "AI Brain",
  "AI Copilot",
  "Prospect AI",
  "WhatsApp",
  "WhatsApp Business",
  "Instagram",
  "Facebook Messenger",
  "Facebook",
  "Messenger",
  "Gmail",
  "Google Workspace",
  "Shopify",
  "Stripe",
  "Calendly",
  "HubSpot",
  "WooCommerce",
  "Showcase IDX",
  "Telegram",
  "SMS",
  "Email",
  "Meta",
  "CRM",
  "API",
  "Unified Inbox",
  "Growth Engines",
  "Growth Engine",
  "Realtor Growth Engine",
  "Chatbot Builder",
  "MLS",
  "GoHighLevel",
  "Interakt",
  "360dialog",
];

const ENGLISH_SENTENCE =
  /\b(the|and|with|your|for|from|that|this|every|when|more|only|into|across|without|before|after|choose|find|manage|convert|explore|start|book)\b(?:\s+\b[a-zA-Z']+\b){2,}/i;

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out);
  }
  return out;
}

function isAllowlisted(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^[\d$€£.,/%+\-\s←→]+$/.test(t)) return true;
  if (NARROW_ALLOWLIST.some((b) => t === b)) return true;
  const stripped = NARROW_ALLOWLIST.reduce((acc, b) => acc.split(b).join(" "), t)
    .replace(/[:\-—,./·|←→()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped || /^[\d$€£.,/%+\-\s]+$/.test(stripped)) return true;
  // Short brand-heavy CTAs like "Explorar Prospect AI" / "גלו את AI Brain"
  if (stripped.split(" ").every((w) => w.length <= 12) && stripped.length < 28) {
    if (!ENGLISH_SENTENCE.test(stripped)) return true;
  }
  return false;
}

function assertNoEnglishMarketing(locale: "es" | "he", label: string, text: string) {
  const chunks = text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 24);
  for (const chunk of chunks) {
    if (isAllowlisted(chunk)) continue;
    assert.ok(
      !ENGLISH_SENTENCE.test(chunk),
      `${locale} ${label} English leak: ${chunk.slice(0, 100)}`,
    );
  }
}

test("homepage content model is fully localized for es and he", () => {
  const en = getLocalizedHomepage("en");
  for (const locale of ["es", "he"] as const) {
    const content = getLocalizedHomepage(locale);
    assert.notEqual(content.discovery.findProspects.eyebrow, en.discovery.findProspects.eyebrow);
    assert.notEqual(content.discovery.convertConversations.eyebrow, en.discovery.convertConversations.eyebrow);
    assert.notEqual(content.aiPlatform.title, en.aiPlatform.title);
    assert.notEqual(content.eyebrows.businessOutcomes, en.eyebrows.businessOutcomes);
    assert.notEqual(content.integrationsCta, en.integrationsCta);
    assert.notEqual(content.ssr.h1, en.ssr.h1);
    assert.notEqual(content.staticShell.h1, en.staticShell.h1);
    assert.equal(content.discovery.findProspects.href, "/prospect-ai");
    assert.equal(content.aiPlatform.aiBrain.title, "AI Brain");

    for (const s of collectStrings(content)) {
      if (isAllowlisted(s)) continue;
      if (s.length < 24) continue;
      assert.ok(!ENGLISH_SENTENCE.test(s), `${locale} homepage model English: ${s.slice(0, 90)}`);
    }
  }
});

test("homepage SSR bodies are localized for es and he", () => {
  const en = generateHomepageHtml("en");
  const es = generateHomepageHtml("es");
  const he = generateHomepageHtml("he");

  // Homepage H1 lives in the static shell (exactly one H1 in the full response).
  assert.ok(!/<h1[\s>]/i.test(es));
  assert.ok(!/<h1[\s>]/i.test(he));
  assert.ok(!/<h1[\s>]/i.test(en));
  assert.ok(es.includes("Encuentra y califica prospectos"));
  assert.ok(es.includes("Explorar Prospect AI"));
  assert.ok(es.includes("Precios"));
  assert.ok(es.includes("Empieza tu prueba gratis"));
  assert.ok(!es.includes("Meet Your AI Sales Team"));
  assert.ok(!es.includes("Start Free Trial"));
  assert.ok(!es.includes("Find and qualify prospects"));
  assert.ok(!es.includes("Explore WhachatCRM"));

  assert.ok(he.includes("מצאו וסננו לידים"));
  assert.ok(he.includes("מחירים"));
  assert.ok(he.includes("התחל ניסיון חינם"));
  assert.ok(!he.includes("Meet Your AI Sales Team"));
  assert.ok(!he.includes("Start Free Trial"));
  assert.ok(!he.includes("Manage and convert conversations"));

  assert.notEqual(es, en);
  assert.notEqual(he, en);
  assertNoEnglishMarketing("es", "homepage SSR", es);
  assertNoEnglishMarketing("he", "homepage SSR", he);
});

test("localized static shell replaces English first-paint copy", () => {
  const indexPath = path.join(process.cwd(), "client/index.html");
  const shell = fs.readFileSync(indexPath, "utf8");
  assert.ok(shell.includes("Meet Your AI Sales Team"));

  const es = injectLocalizedStaticShell(injectHomepageSeoMeta(shell, "es"), "es");
  assert.match(es, /<html lang="es" dir="ltr">/);
  assert.ok(es.includes("Conoce a tu equipo de ventas con IA"));
  assert.ok(es.includes("Empieza tu prueba gratis"));
  assert.ok(es.includes("Precios"));
  assert.ok(es.includes('href="/es/prospect-ai"'));
  assert.ok(!es.includes("Meet Your AI Sales Team"));
  assert.ok(!es.includes(">Start Free Trial<"));
  assert.ok(!es.includes(">Product</a>"));
  const esShell =
    es.match(/<div id="whachat-static-shell">[\s\S]*?<div id="root"/)?.[0] || "";
  assert.ok(esShell.includes("Conoce a tu equipo de ventas con IA"));
  assertNoEnglishMarketing("es", "static shell", esShell);

  const he = injectLocalizedStaticShell(injectHomepageSeoMeta(shell, "he"), "he");
  assert.match(he, /<html lang="he" dir="rtl" class="rtl">/);
  const heH1 = getLocalizedHomepage("he").staticShell.h1;
  assert.ok(he.includes(heH1), `missing Hebrew shell H1: ${heH1}`);
  assert.ok(he.includes("התחל ניסיון חינם"));
  assert.ok(he.includes('href="/he/ai-brain"'));
  assert.ok(!he.includes("Meet Your AI Sales Team"));
  const heShell =
    he.match(/<div id="whachat-static-shell">[\s\S]*?<div id="root"/)?.[0] || "";
  assert.ok(heShell.includes(heH1));
  assertNoEnglishMarketing("he", "static shell", heShell);

  const enKept = injectLocalizedStaticShell(shell, "en");
  assert.ok(enKept.includes("Meet Your AI Sales Team"));

  const removed = removeStaticShellFromHtml(shell);
  assert.ok(!removed.includes('id="whachat-static-shell"'));
  assert.ok(!removed.includes("Meet Your AI Sales Team"));
  assert.ok(removed.includes('<div id="root"></div>'));
});

test("complete homepage HTML has exactly one localized H1", () => {
  const index = fs.readFileSync(path.join(process.cwd(), "client/index.html"), "utf8");
  const en = injectHomepageSeoMeta(index, "en").replace(
    '<div id="root"></div>',
    `<div id="root">${generateHomepageHtml("en")}</div>`,
  );
  const es = injectLocalizedStaticShell(injectHomepageSeoMeta(index, "es"), "es").replace(
    '<div id="root"></div>',
    `<div id="root">${generateHomepageHtml("es")}</div>`,
  );
  const he = injectLocalizedStaticShell(injectHomepageSeoMeta(index, "he"), "he").replace(
    '<div id="root"></div>',
    `<div id="root">${generateHomepageHtml("he")}</div>`,
  );
  assert.equal((en.match(/<h1\b/gi) || []).length, 1);
  assert.equal((es.match(/<h1\b/gi) || []).length, 1);
  assert.equal((he.match(/<h1\b/gi) || []).length, 1);
  assert.match(en, /<h1[^>]*>Meet Your AI Sales Team<\/h1>/);
  assert.match(es, /<h1[^>]*>Conoce a tu equipo de ventas con IA<\/h1>/);
  assert.match(he, /<h1[^>]*>הכירו את צוות המכירות מבוסס ה-AI שלכם<\/h1>/);
});

test("index.html boot keeps static shell on localized homepage roots", () => {
  const html = fs.readFileSync(path.join(process.cwd(), "client/index.html"), "utf8");
  assert.ok(html.includes('p !== "/" && p !== "/es" && p !== "/he"'));
});

test("Hebrew AI Sales Team copy keeps stored order; homepage isolates standalone AI", () => {
  const he = getLocalizedHomepage("he").aiPlatform;

  assert.equal(he.eyebrow, "צוות מכירות AI");
  assert.equal(he.title, "AI שמוצא הזדמנויות ומנחה כל צעד הבא");
  assert.equal(needsHebrewAiBidiLayout(he.title), true);
  assert.deepEqual(splitHebrewAiBidiText(he.title), [
    { kind: "aiHebrew", ai: "AI", hebrew: "שמוצא הזדמנויות ומנחה כל צעד הבא" },
  ]);
  assert.equal(needsHebrewAiBidiLayout(he.eyebrow), false);

  const sectionPath = path.join(
    process.cwd(),
    "client/src/pages/welcome/WelcomeAiPlatformSection.tsx",
  );
  const section = fs.readFileSync(sectionPath, "utf8");
  assert.ok(section.includes("renderRtlAwareHeadingText"));
  assert.ok(section.includes('<bdi dir="ltr">AI</bdi>'));
  assert.ok(section.includes("renderHomepageHebrewAiCopy"));
});
