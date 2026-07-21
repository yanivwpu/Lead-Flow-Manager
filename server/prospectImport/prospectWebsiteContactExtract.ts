/**
 * Extract ONLY publicly displayed contact details from HTML.
 * Never invent/synthesize emails (info@, hello@, sales@, etc.).
 */

import type { ProspectPublicContacts } from "@shared/prospectEnrichment";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const TEL_HREF_RE = /(?:tel|sms):([+\d][\d\s().-]{6,})/gi;
const MAILTO_RE = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
const WHATSAPP_RE =
  /(?:https?:\/\/)?(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp\.com\/send\?phone=)(\+?\d{7,15})/gi;
const SOCIAL_RE =
  /https?:\/\/(?:www\.)?(?:facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com)\/[^\s"'<>]+/gi;
const BOOKING_RE =
  /https?:\/\/(?:www\.)?(?:calendly\.com|cal\.com|acuityscheduling\.com|booksy\.com|setmore\.com|squareup\.com\/appointments)\/[^\s"'<>]+/gi;

const NOISE_EMAILS = /^(noreply|no-reply|donotreply|mailer-daemon|postmaster)@/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|ico)(\?|$)/i;

function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase().replace(/^mailto:/i, "");
  if (!e || !e.includes("@")) return null;
  if (NOISE_EMAILS.test(e)) return null;
  if (IMAGE_EXT.test(e)) return null;
  if (e.length > 120) return null;
  return e;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const justDigits = digits.replace(/\D/g, "");
  if (justDigits.length < 7 || justDigits.length > 15) return null;
  return digits.startsWith("+") ? `+${justDigits}` : justDigits;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

/** Pure HTML → public contacts. Only values literally present in the document. */
export function extractPublicContactsFromHtml(html: string, pageUrl?: string): ProspectPublicContacts {
  const emails: string[] = [];
  const phones: string[] = [];
  const whatsappNumbers: string[] = [];
  const socialProfiles: string[] = [];
  const bookingUrls: string[] = [];
  const contactPageUrls: string[] = [];

  let m: RegExpExecArray | null;
  MAILTO_RE.lastIndex = 0;
  while ((m = MAILTO_RE.exec(html)) !== null) {
    const e = normalizeEmail(m[1]);
    if (e) emails.push(e);
  }
  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(html)) !== null) {
    const e = normalizeEmail(m[0]);
    if (e) emails.push(e);
  }

  TEL_HREF_RE.lastIndex = 0;
  while ((m = TEL_HREF_RE.exec(html)) !== null) {
    const p = normalizePhone(m[1]);
    if (p) phones.push(p);
  }

  WHATSAPP_RE.lastIndex = 0;
  while ((m = WHATSAPP_RE.exec(html)) !== null) {
    const p = normalizePhone(m[1]);
    if (p) {
      whatsappNumbers.push(p);
      phones.push(p);
    }
  }

  SOCIAL_RE.lastIndex = 0;
  while ((m = SOCIAL_RE.exec(html)) !== null) {
    socialProfiles.push(m[0].replace(/["'<>].*$/, ""));
  }

  BOOKING_RE.lastIndex = 0;
  while ((m = BOOKING_RE.exec(html)) !== null) {
    bookingUrls.push(m[0].replace(/["'<>].*$/, ""));
  }

  if (pageUrl && /\/(contact|contact-us|get-in-touch)(\/|$|\?)/i.test(pageUrl)) {
    contactPageUrls.push(pageUrl);
  }

  const chatWidgetDetected = /tawk\.to|intercom|crisp\.chat|drift\.com|zendesk|livechat|hubspot.*chat/i.test(
    html,
  );
  void chatWidgetDetected;

  return {
    emails: unique(emails).slice(0, 20),
    phones: unique(phones).slice(0, 20),
    whatsappNumbers: unique(whatsappNumbers).slice(0, 10),
    socialProfiles: unique(socialProfiles).slice(0, 20),
    bookingUrls: unique(bookingUrls).slice(0, 10),
    contactPageUrls: unique(contactPageUrls).slice(0, 5),
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
