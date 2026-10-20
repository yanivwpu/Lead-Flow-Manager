import assert from "node:assert/strict";
import { renderProspectOutreachEmailHtml } from "../server/prospectImport/prospectOutreachEmailHtml";
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
