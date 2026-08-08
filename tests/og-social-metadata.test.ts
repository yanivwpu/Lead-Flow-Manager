/**
 * Default homepage social (OG/Twitter) metadata + brand OG asset.
 * Run: npx tsx tests/og-social-metadata.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const indexHtml = readFileSync(join(root, "client/index.html"), "utf8");
const brandLogo = join(root, "client/public/brand/whachatcrm-w-logo.png");
const ogImage = join(root, "client/public/og/og-whachatcrm.png");

const SOCIAL_TITLE = "WhachatCRM – AI Sales & Automation Platform";
const SOCIAL_DESCRIPTION =
  "Find prospects, personalize outreach, manage conversations, and automate follow-up with your AI Sales Team.";
const SEO_TITLE = "WhachatCRM – WhatsApp CRM & Automation Platform";
const SEO_DESCRIPTION =
  "Convert conversations into customers with WhachatCRM — a WhatsApp CRM and automation platform that unifies messaging, lead qualification, and follow-ups across multiple channels.";

assert.ok(existsSync(brandLogo), "brand W logo asset missing");
assert.ok(existsSync(ogImage), "og-whachatcrm.png missing");

const ogMeta = await sharp(ogImage).metadata();
assert.equal(ogMeta.width, 1200, "OG width");
assert.equal(ogMeta.height, 630, "OG height");

// Page SEO title/description unchanged
assert.match(indexHtml, new RegExp(`<title>${escapeRegExp(SEO_TITLE)}</title>`));
assert.match(
  indexHtml,
  new RegExp(`<meta name="description" content="${escapeRegExp(SEO_DESCRIPTION)}" />`),
);

// Social tags updated + separated from SEO
assert.ok(
  indexHtml.includes(`property="og:title" content="${SOCIAL_TITLE}"`),
  "og:title",
);
assert.ok(
  indexHtml.includes(`property="og:description" content="${SOCIAL_DESCRIPTION}"`),
  "og:description",
);
assert.ok(
  indexHtml.includes(`content="https://www.whachatcrm.com/og/og-whachatcrm.png?v=4"`),
  "og:image v=4",
);
assert.ok(indexHtml.includes(`name="twitter:card" content="summary_large_image"`), "twitter:card");
assert.ok(indexHtml.includes(`name="twitter:title" content="${SOCIAL_TITLE}"`), "twitter:title");
assert.ok(
  indexHtml.includes(`name="twitter:description" content="${SOCIAL_DESCRIPTION}"`),
  "twitter:description",
);
assert.ok(
  indexHtml.includes(`name="twitter:image" content="https://www.whachatcrm.com/og/og-whachatcrm.png?v=4"`),
  "twitter:image",
);

// Ensure social title did not overwrite SEO title
assert.ok(!indexHtml.includes(`<title>${SOCIAL_TITLE}</title>`), "SEO title must stay separate");

console.log("PASS og-social-metadata.test.ts");

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
