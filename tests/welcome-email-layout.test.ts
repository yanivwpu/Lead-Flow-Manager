/**
 * Welcome email HTML/plain-text layout: Outlook-safe container, CTA, closing copy.
 * Run: npx tsx --test tests/welcome-email-layout.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_INBOX_PATH,
  APP_INTEGRATIONS_PATH,
  APP_PROSPECT_AI_PATH,
  APP_TEMPLATES_PATH,
} from "../shared/appProductPaths";
import { settingsChannelsHref } from "../shared/settingsChannelsNavigation";
import {
  EMAIL_BRAND_GREEN,
  EMAIL_CONTAINER_MAX_WIDTH_PX,
  EMAIL_CONTENT_PADDING_DESKTOP_PX,
  EMAIL_CONTENT_PADDING_MOBILE_PX,
  emailButton,
  renderBrandedEmail,
} from "../server/emailTemplates";
import {
  renderWelcomeEmailHtml,
  renderWelcomeEmailText,
  WHACHATCRM_SUPPORT_EMAIL,
} from "../server/email";

const root = process.cwd();
const appUrl = "https://app.whachatcrm.com";
const html = renderWelcomeEmailHtml("Alex Rivera", { appUrl });
const text = renderWelcomeEmailText("Alex Rivera", { appUrl });
const templateSrc = readFileSync(join(root, "server/emailTemplates.ts"), "utf8");
const emailSrc = readFileSync(join(root, "server/email.ts"), "utf8");

function hrefs(documentHtml: string): string[] {
  return [...documentHtml.matchAll(/\bhref="([^"]+)"/g)].map((m) =>
    m[1]!.replaceAll("&amp;", "&"),
  );
}

test("centered 600px table container with 100% responsive width", () => {
  assert.equal(EMAIL_CONTAINER_MAX_WIDTH_PX, 600);
  assert.match(html, /class="email-container"/);
  assert.match(html, /width="600"/);
  assert.match(html, /max-width:\s*600px/);
  assert.match(html, /align="center"/);
  assert.match(html, /margin:\s*0 auto/);
  assert.match(html, /width:\s*100%/);
  assert.match(html, /role="presentation"/);
  assert.doesNotMatch(templateSrc, /display:\s*flex/i);
  assert.doesNotMatch(templateSrc, /display:\s*grid/i);
});

test("desktop padding 24–32px and safe mobile padding", () => {
  assert.equal(EMAIL_CONTENT_PADDING_DESKTOP_PX, 32);
  assert.equal(EMAIL_CONTENT_PADDING_MOBILE_PX, 16);
  assert.match(html, /padding: 24px 32px 32px/);
  assert.match(html, /padding: 28px 32px 12px/);
  assert.match(html, /padding: 18px 32px/);
  assert.match(html, /padding: 24px 16px/);
  assert.match(html, /@media only screen and \(max-width: 620px\)/);
  assert.match(
    html,
    new RegExp(
      `padding-left: ${EMAIL_CONTENT_PADDING_MOBILE_PX}px !important; padding-right: ${EMAIL_CONTENT_PADDING_MOBILE_PX}px !important;`,
    ),
  );
  assert.match(html, /\.email-container \{ width: 100% !important/);
});

test("no horizontal overflow: wrapping CSS and no oversized fixed widths", () => {
  assert.match(html, /overflow-wrap:\s*break-word/);
  assert.match(html, /word-break:\s*break-word/);
  assert.match(html, /word-wrap:\s*break-word/);
  const htmlWithoutCss = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  const pxWidths = [...htmlWithoutCss.matchAll(/\bwidth:\s*(\d+)px/g)].map((m) => Number(m[1]));
  const attrWidths = [...htmlWithoutCss.matchAll(/\bwidth="(\d+)"/g)].map((m) => Number(m[1]));
  for (const width of [...pxWidths, ...attrWidths]) {
    assert.ok(
      width <= EMAIL_CONTAINER_MAX_WIDTH_PX,
      `fixed width ${width}px exceeds ${EMAIL_CONTAINER_MAX_WIDTH_PX}px container`,
    );
  }
  assert.doesNotMatch(html, /white-space:\s*nowrap/);
});

test("Outlook-compatible CTA uses brand color, white text, and padded table button", () => {
  const cta = emailButton(`${appUrl}${APP_PROSPECT_AI_PATH}`, "Explore Prospect AI");
  assert.match(cta, /class="email-cta"/);
  assert.match(cta, /<!--\[if mso\]>/);
  assert.match(cta, /mso-padding-alt/);
  assert.match(cta, new RegExp(`bgcolor="${EMAIL_BRAND_GREEN}"`));
  assert.match(cta, /color:\s*#ffffff/);
  assert.match(cta, /padding:\s*14px 32px/);
  assert.match(cta, /min-height:\s*44px/);
  assert.match(cta, /border-radius:\s*8px/);
  assert.match(cta, /font-size:\s*16px/);
  assert.match(cta, /Explore Prospect AI/);
  assert.ok(html.includes(cta));
  assert.ok(html.includes(`${appUrl}${APP_PROSPECT_AI_PATH}`));
  assert.doesNotMatch(html, /utm_/i);
  assert.doesNotMatch(html, /Try Prospect AI/);
});

test("welcome and founder signature copy sit before the footer", () => {
  const thankYouAt = html.indexOf("Thank you for signing up for WhachatCRM");
  const helpAt = html.indexOf("We're here to help.");
  const sincerelyAt = html.indexOf("Sincerely,");
  const yanivAt = html.indexOf("Yaniv Haramaty");
  const founderAt = html.indexOf("Founder, WhachatCRM");
  const footerAt = html.indexOf("You're receiving this because you signed up for WhachatCRM.");
  assert.ok(thankYouAt > 0);
  assert.ok(helpAt > thankYouAt);
  assert.ok(sincerelyAt > helpAt);
  assert.ok(yanivAt > sincerelyAt);
  assert.ok(founderAt > yanivAt);
  assert.ok(footerAt > founderAt);
  assert.match(
    html,
    /powerful and practical tool for growing your business and managing customer conversations/,
  );
  assert.match(html, /class="email-welcome-close"/);
});

test("existing product, support, and compliance links stay valid", () => {
  const links = hrefs(html);
  assert.ok(links.includes(appUrl));
  assert.ok(links.includes(`${appUrl}${APP_PROSPECT_AI_PATH}`));
  assert.ok(links.includes(`${appUrl}${APP_INBOX_PATH}`));
  assert.ok(links.includes(`${appUrl}${APP_INTEGRATIONS_PATH}`));
  assert.ok(links.includes(`${appUrl}${APP_TEMPLATES_PATH}`));
  assert.ok(links.includes(`${appUrl}${settingsChannelsHref()}`));
  assert.ok(links.includes(`${appUrl}/unsubscribe`));
  assert.ok(links.includes(`${appUrl}/privacy-policy`));
  assert.ok(links.includes(`mailto:${WHACHATCRM_SUPPORT_EMAIL}`));
  assert.match(html, /View in browser/);
  assert.match(html, /14-day Pro trial with AI Brain/);
  assert.match(html, /Prospect AI is included on Free/);
  for (const href of links) {
    assert.match(href, /^(https:\/\/|mailto:)/);
    assert.doesNotMatch(href, /\s/);
  }
});

test("plain-text sibling keeps the same destinations, CTA, and closing copy", () => {
  assert.match(text, /^View in browser:/m);
  assert.ok(text.includes(appUrl));
  assert.ok(text.includes(`Explore Prospect AI:\n${appUrl}${APP_PROSPECT_AI_PATH}`));
  assert.ok(text.includes(`${appUrl}${APP_INBOX_PATH}`));
  assert.ok(text.includes(`${appUrl}${APP_INTEGRATIONS_PATH}`));
  assert.ok(text.includes(`${appUrl}${APP_TEMPLATES_PATH}`));
  assert.ok(text.includes(`${appUrl}${settingsChannelsHref()}`));
  assert.ok(text.includes(`${appUrl}/unsubscribe`));
  assert.ok(text.includes("Yaniv Haramaty"));
  assert.ok(text.includes("Founder, WhachatCRM"));
  assert.ok(text.includes("Thank you for signing up for WhachatCRM."));
  assert.ok(emailSrc.includes("text: renderWelcomeEmailText(name)"));
  assert.doesNotMatch(text, /Try Prospect AI/);
});

test("branded shell stays table-based without flex/grid wrappers", () => {
  const shell = renderBrandedEmail({ title: "Layout probe", bodyHtml: "<p>Body</p>" });
  assert.match(shell, /<table role="presentation"/);
  assert.doesNotMatch(shell, /display:\s*flex/i);
  assert.doesNotMatch(shell, /display:\s*grid/i);
  assert.match(shell, /xmlns:v="urn:schemas-microsoft-com:vml"/);
});
