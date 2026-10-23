import { safeTextLinks } from "../shared/safeTextLinks";
import assert from "node:assert/strict";
import { normalizeProspectOutreachEmailText, renderProspectOutreachEmailHtml } from "../server/prospectImport/prospectOutreachEmailHtml";
import { ensureAiComposeCampaignLink, validateOutreachLinkUrl } from "../shared/prospectOutreachInstructions";

function main() {
  const url = "https://www.whachatcrm.com/realtor-growth-engine";
  const source = "Hi there,\n\nSee the details: " + url + ".\n\nWould you like to talk?";
  const html = renderProspectOutreachEmailHtml(source);
  assert.ok(html.includes('<a href="' + url + '"'));
  assert.ok(html.includes(">" + url + "</a>."));
  assert.ok(html.includes("Hi there,"));
  assert.ok(html.includes("Would you like to talk?"));
  assert.ok(html.includes("</p><p"));
  assert.equal(html.includes('href="' + url + '."'), false, "punctuation cannot enter href");

  const hostile = renderProspectOutreachEmailHtml('<img src=x onerror="bad()">' +
    "\n\n" + 'Go to https://example.com/a?x=1&y=2 or javascript:alert(1)');
  assert.equal(hostile.includes("<img"), false, "untrusted HTML must be escaped");
  assert.ok(hostile.includes("&lt;img"));
  assert.ok(hostile.includes('href="https://example.com/a?x=1&amp;y=2"'));
  assert.equal(hostile.includes('href="javascript:'), false);

  // Regression: production acceptance seed exposed literal backslash-n sequences
  // becoming part of an email href and yielding a %5Cn%5CnWe 404.
  const escapedBreak = String.fromCharCode(92) + "n";
  const encodedNewlines = "Hi there!" + escapedBreak.repeat(2) +
    "Learn about our Realtor Growth Engine: " + url +
    escapedBreak.repeat(2) + "We are checking formatting.";
  const repaired = normalizeProspectOutreachEmailText(encodedNewlines);
  assert.equal(repaired, ["Hi there!", "Learn about our Realtor Growth Engine: " + url, "We are checking formatting."].join("\n\n"));
  const htmlRepaired = renderProspectOutreachEmailHtml(encodedNewlines, [url], true);
  assert.equal((htmlRepaired.match(/<p dir="auto" /g) || []).length, 3);
  assert.ok(htmlRepaired.includes('href="' + url + '"'), "href stays exact");
  assert(htmlRepaired.includes(">Explore the Realtor Growth Engine</a>"), "approved campaign link has descriptive CTA label");
  assert(htmlRepaired.includes("background-color:#087f78"), "approved CTA is styled for email clients");
  assert(!htmlRepaired.includes("%5Cn") && !htmlRepaired.includes(escapedBreak), "CTA must not absorb encoded breaks");
  const otherApproved = "https://example.com/book?source=email";
  const otherCta = renderProspectOutreachEmailHtml("Book: " + otherApproved, [otherApproved], true);
  assert(otherCta.includes('href="https://example.com/book?source=email"'));
  assert(otherCta.includes(">Learn more</a>"), "non-Realtor campaigns receive neutral CTA");
  const authoredLink = renderProspectOutreachEmailHtml("Reference: " + otherApproved, [url], true);
  assert(authoredLink.includes(">" + otherApproved + "</a>"), "non-approved authored links retain original visible URL");
  assert(!authoredLink.includes("background-color:#087f78"), "only explicitly approved links become CTAs");

  assert.ok(htmlRepaired.includes("</a></p><p"), "link ends before the next paragraph");
  assert.equal(htmlRepaired.includes("%5Cn"), false);
  assert.equal(htmlRepaired.includes(escapedBreak), false);
  assert.equal(repaired.includes(escapedBreak), false);
  const multiline = renderProspectOutreachEmailHtml("Hello\nHow are you?");
  assert.ok(multiline.includes("Hello<br>How are you?"));
  assert.equal(renderProspectOutreachEmailHtml(" \n "), "");
  const settings = { linkUrl: url, includeLinkNaturally: true };
  const draft = ensureAiComposeCampaignLink("Hi there, would a demo help?", settings);
  assert.ok(draft.includes(url), "explicitly configured CTA URL cannot be dropped by AI");
  assert.equal(ensureAiComposeCampaignLink(draft, settings), draft, "CTA must be idempotent");
  assert.equal(ensureAiComposeCampaignLink("Hi", { linkUrl: url, includeLinkNaturally: false }), "Hi");
  assert.equal(ensureAiComposeCampaignLink("Hi", { linkUrl: "javascript:bad()", includeLinkNaturally: true }), "Hi");
  console.log("ok - prospect outreach email HTML linkification and escaping");
}
main();

const configured = "https://example.com/demo";
for (const altered of [configured + "?utm_source=ai", configured + "/wrong"]) {
  const fixed = ensureAiComposeCampaignLink("Details: " + altered, {linkUrl:configured,includeLinkNaturally:true});
  assert.ok(fixed.endsWith(configured), "a modified URL cannot count as the configured destination");
}
const origin = "https://example.com";
assert.ok(ensureAiComposeCampaignLink("See https://example.com.evil.test", {linkUrl:origin,includeLinkNaturally:true}).endsWith(origin));
for (const [language, prefix] of [["spanish","Descubre cómo funciona:"],["hebrew","לפרטים נוספים:"],["arabic","لمعرفة المزيد:"]] as const) {
  assert.ok(ensureAiComposeCampaignLink("Localized message", {linkUrl:configured,includeLinkNaturally:true,language}).includes(prefix));
}
const apostrophe = "https://example.com/it's-here";
const linked = renderProspectOutreachEmailHtml("See " + apostrophe);
assert.ok(linked.includes('href="https://example.com/it&#39;s-here"'));
assert.equal(linked.includes('href="https://example.com/it"'), false);

for (const suffix of [".", ",", ";", ":", "!", "?", ")", "]", "}", "'"]) {
 const url = "https://example.com/reset?token=abc" + suffix;
 const message = "Details: " + url;
 assert.equal(ensureAiComposeCampaignLink(message, {linkUrl:url,includeLinkNaturally:true}), message);
 assert.ok(renderProspectOutreachEmailHtml(message, [url]).includes(`href="${url.replace(/'/g, "&#39;")}"`));
}

const exactPunctuation = "https://example.com/reset?token=abc!";
assert.ok(renderProspectOutreachEmailHtml("Visit " + exactPunctuation + ".", [exactPunctuation]).includes(`href="${exactPunctuation}"`));

const quoted = "Details: 'https://example.com/demo'";
assert.equal(ensureAiComposeCampaignLink(quoted, {linkUrl:"https://example.com/demo",includeLinkNaturally:true}),quoted);
assert.ok(renderProspectOutreachEmailHtml(quoted,["https://example.com/demo"]).includes('href="https://example.com/demo"'));

assert.equal(validateOutreachLinkUrl("https://user:pass@example.com/demo").ok,false);
assert.ok(renderProspectOutreachEmailHtml("Template https://example.com/reset?token=abc!", [], true).includes('href="https://example.com/reset?token=abc!"'));

for (const suffix of ['a"b', "a<b", "a>b", "a b"]) assert.equal(validateOutreachLinkUrl("https://example.com/"+suffix).ok,false);

// Migration preserves existing authored destinations and is repeatable in an isolated fixture.
const {PGlite} = await import("@electric-sql/pglite");
const {readFile} = await import("node:fs/promises");
const migrationDb = new PGlite();
try {
 await migrationDb.exec("CREATE TABLE prospect_outreach_queue_items(id text); INSERT INTO prospect_outreach_queue_items VALUES ('legacy')");
 const migration = await readFile("migrations/0114_prospect_link_rendering_snapshot.sql", "utf8");
 await migrationDb.exec(migration); await migrationDb.exec(migration);
 const ts = (await import("typescript")).default;
 const startup = ts.createSourceFile("startup.ts",await readFile("server/startupSchemaPatches.ts","utf8"),ts.ScriptTarget.Latest,true);
 assert.equal((startup as any).parseDiagnostics.length, 0, "startup patch source must parse without syntax errors");
 let startupSql = "";
 function visit(node: any) {
  if (ts.isObjectLiteralExpression(node)) {
   const tag: any = node.properties.find((p: any) => p.name?.getText(startup) === "tag");
   if (tag?.initializer?.text === "0114_prospect_link_rendering_snapshot") startupSql = (node.properties.find((p: any) => p.name?.getText(startup) === "sql") as any)?.initializer?.text || "";
  }
  ts.forEachChild(node,visit);
 }
 visit(startup); assert(startupSql,"production startup must include 0114");
 await migrationDb.exec(startupSql); await migrationDb.exec(startupSql);
 assert.deepEqual((await migrationDb.query<any>("SELECT link_rendering_snapshot FROM prospect_outreach_queue_items")).rows[0].link_rendering_snapshot,{campaignLinkUrl:"",preserveAuthoredUrls:true});
} finally { await migrationDb.close(); }

for (const punctuation of ["؟","،","؛","。","！","？","，","…"]) {
 const url="https://example.com/demo";
 const message="Details: "+url+punctuation;
 assert.equal(ensureAiComposeCampaignLink(message,{linkUrl:url,includeLinkNaturally:true}),message);
 assert.equal(safeTextLinks(message,true,[url]).find(p=>p.href)?.href,url);
 const exact=url+punctuation;
 assert.equal(safeTextLinks(exact,true,[exact]).find(p=>p.href)?.href,exact);
}

for (const message of ["Hello,\n\nSee https://example.com/demo.","Hola,\n\nConsulta https://example.com/demo.","שלום,\n\nפרטים https://example.com/demo.","مرحبا،\n\nتفاصيل https://example.com/demo؟"]) {
 const html=renderProspectOutreachEmailHtml(message);
 assert.equal((html.match(/<p dir="auto" /g)||[]).length,2,"each paragraph must resolve its own content direction");
 assert(!html.includes('dir="rtl"'),"English and Spanish must retain automatic LTR rendering");
 assert(html.includes('href="https://example.com/demo"'));
}

for(const [open,close] of [["“","”"],["‘","’"],["«","»"],["‹","›"],["„","“"],["「","」"],["『","』"]]) {
 const url="https://example.com/demo"; const message=`Details: ${open}${url}${close}.`;
 assert.equal(ensureAiComposeCampaignLink(message,{linkUrl:url,includeLinkNaturally:true}),message);
 assert.equal(safeTextLinks(message,true,[url]).find(p=>p.href)?.href,url);
 assert.equal(safeTextLinks(message,true).find(p=>p.href)?.href,url);
 const exact=url+close;
 assert.equal(safeTextLinks(`${open}${exact}${close}`,true,[exact]).find(p=>p.href)?.href,exact);
 assert.equal(safeTextLinks(exact,false).find(p=>p.href)?.href,exact);
}
