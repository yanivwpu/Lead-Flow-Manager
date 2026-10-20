import assert from "node:assert/strict";
import { renderProspectOutreachEmailHtml } from "../server/prospectImport/prospectOutreachEmailHtml";

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
  console.log("ok - prospect outreach email HTML linkification and escaping");
}
main();
