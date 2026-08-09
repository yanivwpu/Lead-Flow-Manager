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
  generateHomepageHtml,
  injectHomepageSeoMeta,
  injectLocalizedStaticShell,
  hideStaticShellInHtml,
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

  assert.ok(es.includes("Conoce a tu equipo de ventas con IA"));
  assert.ok(es.includes("Encuentra y califica prospectos"));
  assert.ok(es.includes("Explorar Prospect AI"));
  assert.ok(es.includes("Precios"));
  assert.ok(es.includes("Empieza tu prueba gratis"));
  assert.ok(!es.includes("Meet Your AI Sales Team"));
  assert.ok(!es.includes("Start Free Trial"));
  assert.ok(!es.includes("Find and qualify prospects"));
  assert.ok(!es.includes("Explore WhachatCRM"));

  assert.ok(he.includes("הכירו את צוות המכירות מבוסס ה-AI שלכם"));
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
  assertNoEnglishMarketing("es", "static shell", es.match(/id="whachat-static-shell"[\s\S]*?<\/div>\s*<div id="root"/)?.[0] || es);

  const he = injectLocalizedStaticShell(injectHomepageSeoMeta(shell, "he"), "he");
  assert.match(he, /<html lang="he" dir="rtl">/);
  assert.ok(he.includes("הכירו את צוות המכירות מבוסס ה-AI שלכם"));
  assert.ok(he.includes("התחל ניסיון חינם"));
  assert.ok(he.includes('href="/he/ai-brain"'));
  assert.ok(!he.includes("Meet Your AI Sales Team"));
  assertNoEnglishMarketing("he", "static shell", he.match(/id="whachat-static-shell"[\s\S]*?<\/div>\s*<div id="root"/)?.[0] || he);

  const enKept = injectLocalizedStaticShell(shell, "en");
  assert.ok(enKept.includes("Meet Your AI Sales Team"));

  const hidden = hideStaticShellInHtml(shell);
  assert.match(hidden, /wcs-hide-static-marketing/);
});

test("index.html boot keeps static shell on localized homepage roots", () => {
  const html = fs.readFileSync(path.join(process.cwd(), "client/index.html"), "utf8");
  assert.ok(html.includes('p !== "/" && p !== "/es" && p !== "/he"'));
});
