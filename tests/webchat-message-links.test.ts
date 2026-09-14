/**
 * Website Chat URL linkification is presentation-only.
 * Run: npx tsx tests/webchat-message-links.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { messageTextDir } from "../shared/webchatWidgetLocale";
import {
  isSafeHttpUrl,
  splitTextWithHttpUrls,
  splitTrailingUrlPunctuation,
} from "../shared/webchatMessageLinks";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const CALENDLY = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";

function urlsOf(text: string): string[] {
  return splitTextWithHttpUrls(text).filter((p) => p.type === "url").map((p) => p.href);
}

{
  const parts = splitTextWithHttpUrls(`Book a demo:\n${CALENDLY}`);
  const urlParts = parts.filter((p) => p.type === "url");
  assert.equal(urlParts.length, 1);
  assert.equal(urlParts[0]?.href, CALENDLY);
  assert.equal(urlParts[0]?.display, CALENDLY);
  assert.deepEqual(urlsOf(CALENDLY), [CALENDLY]);
}

{
  const he = `מעולה — אפשר לקבוע כאן: ${CALENDLY} ונשמח לראותך.`;
  const parts = splitTextWithHttpUrls(he);
  assert.equal(messageTextDir(he), "rtl");
  assert.equal(parts[0]?.type, "text");
  assert.match(String(parts[0] && parts[0].type === "text" ? parts[0].value : ""), /מעולה/);
  assert.equal(parts[1]?.type, "url");
  assert.equal(parts[1]?.type === "url" ? parts[1].href : "", CALENDLY);
  assert.match(String(parts[2] && parts[2].type === "text" ? parts[2].value : ""), /נשמח/);
}

{
  const en = `Here is the booking link: ${CALENDLY}`;
  const es = `Reserva una demo aquí: ${CALENDLY}`;
  assert.equal(messageTextDir(en), "auto");
  assert.equal(messageTextDir(es), "auto");
  assert.deepEqual(urlsOf(en), [CALENDLY]);
  assert.deepEqual(urlsOf(es), [CALENDLY]);
  const enParts = splitTextWithHttpUrls(en);
  const esParts = splitTextWithHttpUrls(es);
  assert.match(String(enParts[0] && enParts[0].type === "text" ? enParts[0].value : ""), /Here is the booking link/);
  assert.match(String(esParts[0] && esParts[0].type === "text" ? esParts[0].value : ""), /Reserva una demo/);
}

{
  const multi = `EN ${CALENDLY} ES https://example.com/es/demo`;
  assert.deepEqual(urlsOf(multi), [CALENDLY, "https://example.com/es/demo"]);
}

{
  const long = `https://calendly.com/yanivharamaty/whachatcrm-live-product-demo?utm_source=widget&utm_medium=webchat&utm_campaign=${"a".repeat(80)}`;
  const parts = splitTextWithHttpUrls(`Book:\n${long}`);
  assert.equal(parts.filter((p) => p.type === "url").length, 1);
  assert.equal(parts.find((p) => p.type === "url")?.href, long);
}

{
  assert.deepEqual(splitTextWithHttpUrls("Thanks, we will follow up tomorrow."), [
    { type: "text", value: "Thanks, we will follow up tomorrow." },
  ]);
  assert.deepEqual(splitTextWithHttpUrls(""), []);
}

{
  const unsafe = [
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
  ];
  for (const value of unsafe) {
    assert.equal(isSafeHttpUrl(value), false);
    assert.deepEqual(splitTextWithHttpUrls(value), [{ type: "text", value }]);
    assert.deepEqual(urlsOf(`Please visit ${value} thanks`), []);
  }
}

{
  const injected = `Hi <script>alert(1)</script> & <img src=x onerror=alert(1)> ${CALENDLY}`;
  const parts = splitTextWithHttpUrls(injected);
  const textBlob = parts.filter((p) => p.type === "text").map((p) => p.value).join("");
  assert.match(textBlob, /<script>alert\(1\)<\/script>/);
  assert.match(textBlob, /<img src=x onerror=alert\(1\)>/);
  assert.deepEqual(urlsOf(injected), [CALENDLY]);
}

{
  assert.deepEqual(splitTrailingUrlPunctuation(`${CALENDLY}.`), { url: CALENDLY, trailing: "." });
  assert.deepEqual(urlsOf(`See ${CALENDLY}.`), [CALENDLY]);
  assert.deepEqual(urlsOf(`See ${CALENDLY}, then reply.`), [CALENDLY]);
  assert.deepEqual(urlsOf(`(link: ${CALENDLY})`), [CALENDLY]);
  assert.deepEqual(urlsOf(`Ready? ${CALENDLY}?`), [CALENDLY]);
  assert.deepEqual(urlsOf(`Wow ${CALENDLY}!`), [CALENDLY]);
  assert.deepEqual(urlsOf(`Docs [https://example.com/path]`), ["https://example.com/path"]);
  assert.deepEqual(urlsOf("https://en.wikipedia.org/wiki/Foo_(bar)"), [
    "https://en.wikipedia.org/wiki/Foo_(bar)",
  ]);
}

{
  const renderer = read("client/src/components/webchat/WebchatLinkedText.tsx");
  assert.match(renderer, /splitTextWithHttpUrls/);
  assert.match(renderer, /messageTextDir/);
  assert.match(renderer, /dir=\{messageTextDir\(value\)\}/);
  assert.match(renderer, /target="_blank"/);
  assert.match(renderer, /rel="noopener noreferrer"/);
  assert.match(renderer, /dir="ltr"/);
  assert.match(renderer, /\[unicode-bidi:isolate\]/);
  assert.match(renderer, /underline/);
  assert.match(renderer, /focus-visible:outline/);
  assert.match(renderer, /break-all/);
  assert.match(renderer, /\[overflow-wrap:anywhere\]/);
  assert.match(renderer, /text-inherit/);
  assert.doesNotMatch(renderer, /dangerouslySetInnerHTML\s*=/);
}

{
  const frame = read("client/src/pages/WidgetFrame.tsx");
  const media = read("client/src/components/webchat/WebchatMediaBubble.tsx");
  const preview = read("client/src/components/webchat/WebchatChromePreview.tsx");
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(frame, /WebchatLinkedText/);
  assert.match(frame, /text=\{msg\.content\}/);
  assert.match(frame, /dir="auto"/);
  assert.match(frame, /dir=\{widgetChromeDir/);
  assert.match(frame, /whitespace-pre-wrap break-words \[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(frame, /dangerouslySetInnerHTML\s*=/);
  assert.match(media, /WebchatLinkedText/);
  assert.match(preview, /WebchatLinkedText/);
  assert.doesNotMatch(inbox, /WebchatLinkedText/);
  assert.doesNotMatch(read("shared/webchatMessageLinks.ts"), /dangerouslySetInnerHTML/);
}

console.log("webchat-message-links.test.ts: all assertions passed");
