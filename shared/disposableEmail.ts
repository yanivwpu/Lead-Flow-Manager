/**
 * Server-side disposable / temporary email detection for public self-service signup.
 * Uses the maintained `disposable-email-domains` package plus an explicit blocklist.
 * Does not block normal free providers (Gmail, Outlook, Yahoo, iCloud, Proton, etc.).
 */
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Resolve package data via createRequire from the app root.
 * Avoids import.meta.url (empty in the CJS production bundle built by esbuild).
 */
function loadDomainLists(): { domains: string[]; wildcards: string[] } {
  const require = createRequire(join(process.cwd(), "package.json"));
  const domains = require("disposable-email-domains") as string[];
  const wildcards = require("disposable-email-domains/wildcard.json") as string[];
  return { domains, wildcards };
}

const { domains: packageDomains, wildcards: packageWildcards } = loadDomainLists();

/** Domains observed in abuse that may lag the upstream package list. */
const EXTRA_BLOCKED_DOMAINS = new Set([
  "web-library.net",
  "mail.tm",
  "mail.gw",
]);

const DOMAIN_SET = new Set<string>([
  ...packageDomains.map((d) => d.toLowerCase()),
  ...EXTRA_BLOCKED_DOMAINS,
]);

const WILDCARD_SET = new Set<string>(packageWildcards.map((d) => d.toLowerCase()));

/** Free / personal providers that must never be blocked by this check. */
const ALLOWED_FREE_PROVIDERS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "aol.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
]);

export function normalizeEmailAddress(raw: string): string {
  const t = (typeof raw === "string" ? raw : "").trim().toLowerCase();
  try {
    return t.normalize("NFKC");
  } catch {
    return t;
  }
}

export function extractEmailDomain(email: string): string | null {
  const normalized = normalizeEmailAddress(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

/**
 * True when the email domain (or a parent domain for subdomains) is a known disposable provider.
 */
export function isDisposableEmail(email: string): boolean {
  const domain = extractEmailDomain(email);
  if (!domain) return false;
  if (ALLOWED_FREE_PROVIDERS.has(domain)) return false;

  if (DOMAIN_SET.has(domain) || WILDCARD_SET.has(domain)) return true;

  // Subdomain of a blocked domain: foo.web-library.net → web-library.net
  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join(".");
    if (ALLOWED_FREE_PROVIDERS.has(parent)) return false;
    if (DOMAIN_SET.has(parent) || WILDCARD_SET.has(parent)) return true;
  }

  return false;
}
