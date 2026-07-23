/**
 * Extract ONLY publicly displayed contact details from HTML.
 * Never invent/synthesize emails (info@, hello@, sales@, etc.).
 *
 * Email pipeline (deterministic, no LLM):
 * 1. mailto links
 * 2. standard visible-text / HTML email regex (after entity decode)
 * 3. obfuscated visible-text normalization
 * 4. validation + case-insensitive dedupe
 */

import type { ProspectPublicContacts } from "@shared/prospectEnrichment";
import { isValidProspectEmail } from "@shared/prospectContactEnrichment";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const TEL_HREF_RE = /(?:tel|sms):([+\d][\d\s().-]{6,})/gi;
const MAILTO_RE = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
const WHATSAPP_RE =
  /(?:https?:\/\/)?(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp\.com\/send\?phone=)(\+?\d{7,15})/gi;
const SOCIAL_RE =
  /https?:\/\/(?:www\.)?(?:facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com)\/[^\s"'<>]+/gi;
const BOOKING_RE =
  /https?:\/\/(?:www\.)?(?:calendly\.com|cal\.com|acuityscheduling\.com|booksy\.com|setmore\.com|squareup\.com\/appointments)\/[^\s"'<>]+/gi;

/**
 * Local + AT marker + domain-ish tail.
 * AT markers: @, [at], (at), {at}, standalone " at ".
 * Domain must include a literal "." or obfuscated "dot" so spaced brands
 * like "Marketing 1on1.com" are captured past the first space.
 */
const OBFUSCATED_CANDIDATE_RE = new RegExp(
  String.raw`(?<![a-zA-Z0-9._%+-])` +
    String.raw`([a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9_+-])?)` +
    String.raw`(?:\s*@\s*|\s*\[\s*at\s*\]\s*|\s*\(\s*at\s*\)\s*|\s*\{\s*at\s*\}\s*|\s+\bat\b\s+)` +
    String.raw`(` +
    String.raw`[a-zA-Z0-9][a-zA-Z0-9.\-\s\[\](){}]{0,60}?` +
    String.raw`(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|\s+dot\s+)` +
    String.raw`[a-zA-Z0-9.\-\s\[\](){}]{0,40}[a-zA-Z]{2,24}` +
    String.raw`)` +
    String.raw`(?=$|[\s,;:<>"'|])`,
  "gi",
);

const NOISE_EMAILS = /^(noreply|no-reply|donotreply|mailer-daemon|postmaster)@/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|ico)(\?|$)/i;
const DOMAIN_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export type ProspectEmailExtractionMethod = "mailto" | "standard_text" | "obfuscated_text";

export type ProspectExtractedEmail = {
  email: string;
  method: ProspectEmailExtractionMethod;
  sourceUrl?: string;
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

/** Decode common email-related HTML entities before regex extraction. */
export function decodeHtmlEntitiesForEmailExtract(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&commat;/gi, "@")
    .replace(/&#0*64;/g, "@")
    .replace(/&#x0*40;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/&#0*46;/g, ".")
    .replace(/&#x0*2e;/gi, ".")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d{1,3});/g, (_, n) => {
      const code = Number(n);
      if (!Number.isFinite(code) || code < 32 || code > 126) return "";
      return String.fromCharCode(code);
    })
    .replace(/&#x([0-9a-f]{1,3});/gi, (_, h) => {
      const code = parseInt(h, 16);
      if (!Number.isFinite(code) || code < 32 || code > 126) return "";
      return String.fromCharCode(code);
    });
}

function htmlToVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function hostnameFromPageUrl(pageUrl?: string | null): string | null {
  if (!pageUrl) return null;
  try {
    return new URL(pageUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function isValidLocalPart(local: string): boolean {
  if (!local || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (local.includes("..")) return false;
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9_+%-])?$/.test(local) ||
    /^[a-zA-Z0-9._%+-]+$/.test(local);
}

function collapseDomainSpaces(raw: string): string {
  return raw
    .replace(/([a-zA-Z0-9])\s+([a-zA-Z0-9])/g, "$1$2")
    .replace(/\s+/g, "")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();
}

function normalizeDomainCandidate(
  rawDomain: string,
  hostnameHint?: string | null,
): string | null {
  let d = String(rawDomain || "").trim();
  if (!d) return null;

  // Sentence boundaries first — "office. Visit" must not become a domain.
  d = d.split(/\.\s+/)[0]?.trim() || "";
  if (!d) return null;

  d = d
    .replace(/\s*\[\s*dot\s*\]\s*/gi, ".")
    .replace(/\s*\(\s*dot\s*\)\s*/gi, ".")
    .replace(/\s*\{\s*dot\s*\}\s*/gi, ".")
    .replace(/\s+\bdot\b\s+/gi, ".");

  const hint = hostnameHint?.toLowerCase().replace(/^www\./, "") || null;

  const finalize = (prefix: string): string | null => {
    let c = collapseDomainSpaces(prefix);
    if (!c || c.includes("..") || !c.includes(".")) return null;
    if (hint) {
      const compact = c.replace(/\./g, "");
      const hintCompact = hint.replace(/\./g, "");
      if (compact === hintCompact || c === hint) c = hint;
    }
    if (!DOMAIN_RE.test(c)) return null;
    const tld = c.split(".").pop() || "";
    if (!/^[a-z]{2,24}$/i.test(tld)) return null;
    return c;
  };

  // Prefer the longest prefix ending in .tld (so example.co.uk beats example.co).
  let best: string | null = null;
  const tldEnds = /\.[a-zA-Z]{2,24}\b/g;
  let m: RegExpExecArray | null;
  while ((m = tldEnds.exec(d)) !== null) {
    const cand = finalize(d.slice(0, m.index + m[0].length));
    if (cand) best = cand;
  }
  if (!best) best = finalize(d);
  return best;
}

/** Validate + normalize a fully formed email (domain lowercased). Preserves plus-addressing. */
export function normalizeExtractedEmail(raw: string): string | null {
  const trimmed = String(raw || "")
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/[>,;]+$/g, "")
    .replace(/^[<("']+/, "");
  if (!trimmed || !trimmed.includes("@")) return null;
  if (NOISE_EMAILS.test(trimmed)) return null;
  if (IMAGE_EXT.test(trimmed)) return null;
  if (trimmed.length > 120) return null;

  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (!isValidLocalPart(local)) return null;
  if (!DOMAIN_RE.test(domain) || domain.includes("..")) return null;

  // Store lowercased (matches prior extractor); plus-tags remain in the local part.
  return `${local}@${domain}`.toLowerCase();
}

function finalizeEmail(raw: string): string | null {
  return normalizeExtractedEmail(raw);
}

/**
 * Normalize a single obfuscated candidate (local + raw domain) using optional hostname hint.
 * Exported for unit tests.
 */
export function normalizeObfuscatedEmailCandidate(
  localRaw: string,
  domainRaw: string,
  hostnameHint?: string | null,
): string | null {
  const local = String(localRaw || "").trim();
  if (!isValidLocalPart(local)) return null;
  // Reject local parts that are common English words used with "at" in prose
  // when domain also looks like prose (handled by domain validation).
  const domain = normalizeDomainCandidate(domainRaw, hostnameHint);
  if (!domain) return null;
  return finalizeEmail(`${local}@${domain}`);
}

function pushEmail(
  bag: ProspectExtractedEmail[],
  seen: Set<string>,
  raw: string,
  method: ProspectEmailExtractionMethod,
  sourceUrl?: string,
): void {
  const email = finalizeEmail(raw);
  if (!email) return;
  if (seen.has(email)) return;
  seen.add(email);
  bag.push({ email, method, sourceUrl: sourceUrl || undefined });
}

/** Extract emails with method metadata (mailto → standard → obfuscated). */
export function extractEmailsFromHtml(
  html: string,
  pageUrl?: string,
): ProspectExtractedEmail[] {
  const decoded = decodeHtmlEntitiesForEmailExtract(html);
  const hostnameHint = hostnameFromPageUrl(pageUrl);
  const found: ProspectExtractedEmail[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  MAILTO_RE.lastIndex = 0;
  while ((m = MAILTO_RE.exec(decoded)) !== null) {
    pushEmail(found, seen, m[1], "mailto", pageUrl);
  }

  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(decoded)) !== null) {
    pushEmail(found, seen, m[0], "standard_text", pageUrl);
  }

  const visible = htmlToVisibleText(decoded);
  OBFUSCATED_CANDIDATE_RE.lastIndex = 0;
  while ((m = OBFUSCATED_CANDIDATE_RE.exec(visible)) !== null) {
    const normalized = normalizeObfuscatedEmailCandidate(m[1], m[2], hostnameHint);
    if (normalized) pushEmail(found, seen, normalized, "obfuscated_text", pageUrl);
  }

  return found;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const justDigits = digits.replace(/\D/g, "");
  if (justDigits.length < 7 || justDigits.length > 15) return null;
  return digits.startsWith("+") ? `+${justDigits}` : justDigits;
}

/** Pure HTML → public contacts. Only values literally present in the document. */
export function extractPublicContactsFromHtml(html: string, pageUrl?: string): ProspectPublicContacts {
  const phones: string[] = [];
  const whatsappNumbers: string[] = [];
  const socialProfiles: string[] = [];
  const bookingUrls: string[] = [];
  const contactPageUrls: string[] = [];

  const decoded = decodeHtmlEntitiesForEmailExtract(html);
  const extractedEmails = extractEmailsFromHtml(html, pageUrl);

  let m: RegExpExecArray | null;

  TEL_HREF_RE.lastIndex = 0;
  while ((m = TEL_HREF_RE.exec(decoded)) !== null) {
    const p = normalizePhone(m[1]);
    if (p) phones.push(p);
  }

  WHATSAPP_RE.lastIndex = 0;
  while ((m = WHATSAPP_RE.exec(decoded)) !== null) {
    const p = normalizePhone(m[1]);
    if (p) {
      whatsappNumbers.push(p);
      phones.push(p);
    }
  }

  SOCIAL_RE.lastIndex = 0;
  while ((m = SOCIAL_RE.exec(decoded)) !== null) {
    socialProfiles.push(m[0].replace(/["'<>].*$/, ""));
  }

  BOOKING_RE.lastIndex = 0;
  while ((m = BOOKING_RE.exec(decoded)) !== null) {
    bookingUrls.push(m[0].replace(/["'<>].*$/, ""));
  }

  if (pageUrl && /\/(contact|contact-us|get-in-touch)(\/|$|\?)/i.test(pageUrl)) {
    contactPageUrls.push(pageUrl);
  }

  if (extractedEmails.length > 0) {
    console.info(
      JSON.stringify({
        tag: "[ProspectEnrichment]",
        event: "emails_extracted",
        sourceUrl: pageUrl || null,
        count: extractedEmails.length,
        methods: extractedEmails.map((e) => e.method),
      }),
    );
  }

  return {
    emails: extractedEmails.map((e) => e.email).slice(0, 20),
    phones: unique(phones).slice(0, 20),
    whatsappNumbers: unique(whatsappNumbers).slice(0, 10),
    socialProfiles: unique(socialProfiles).slice(0, 20),
    bookingUrls: unique(bookingUrls).slice(0, 10),
    contactPageUrls: unique(contactPageUrls).slice(0, 5),
    emailExtractions: extractedEmails.slice(0, 20),
  };
}

export function detectWebsiteSignals(html: string): {
  chatWidgetDetected: boolean;
  whatsappButtonDetected: boolean;
  contactFormsDetected: boolean;
  technologyClues: string[];
} {
  const technologyClues: string[] = [];
  if (/wp-content|wordpress/i.test(html)) technologyClues.push("WordPress");
  if (/cdn\.shopify|Shopify\.theme/i.test(html)) technologyClues.push("Shopify");
  if (/wix\.com|X-Wix/i.test(html)) technologyClues.push("Wix");
  if (/squarespace/i.test(html)) technologyClues.push("Squarespace");
  if (/webflow/i.test(html)) technologyClues.push("Webflow");
  if (/react|__NEXT_DATA__|next\.js/i.test(html)) technologyClues.push("Modern JS framework");

  return {
    chatWidgetDetected:
      /tawk\.to|tidio|intercom|crisp\.chat|drift\.com|zendesk|livechat|id=["']tawk|class=["'][^"']*tawk/i.test(
        html,
      ),
    whatsappButtonDetected: /wa\.me|whatsapp\.com\/send|api\.whatsapp\.com/i.test(html),
    contactFormsDetected: /<form[\s\S]*?(email|message|contact)[\s\S]*?<\/form>/i.test(html),
    technologyClues: Array.from(new Set(technologyClues)),
  };
}

/** Never invent common mailbox prefixes — only accept emails found in HTML. */
export function isInventedMailboxGuess(email: string, foundEmails: string[]): boolean {
  const e = email.trim().toLowerCase();
  if (foundEmails.map((x) => x.toLowerCase()).includes(e)) return false;
  return /^(info|hello|sales|support|contact|admin|office)@/.test(e);
}

/**
 * Scraped email may fill a contact only when the CRM email is missing/invalid.
 * Manual / existing valid emails are never overwritten.
 */
export function shouldApplyScrapedProspectEmail(
  existingEmail: string | null | undefined,
  scrapedEmail: string | null | undefined,
): boolean {
  return Boolean(scrapedEmail && isValidProspectEmail(scrapedEmail) && !isValidProspectEmail(existingEmail));
}
