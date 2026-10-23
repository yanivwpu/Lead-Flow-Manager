import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PURPOSE = "leadflow:marketing-optout:v1";
export type OptOutIdentity = { workspace: string; email: string };
export function normalizeMarketingEmail(value: string): string {
  const email = value.trim().normalize("NFC").toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email) || email.length > 254) throw new Error("Invalid recipient");
  return email;
}
function tokenKey(secret = process.env.MARKETING_OPTOUT_SECRET || "") {
  if (Buffer.byteLength(secret) < 32) throw new Error("Configure MARKETING_OPTOUT_SECRET (at least 32 bytes)");
  return createHash("sha256").update(secret).digest();
}
/** Authenticated encryption: no email, contact ID or tenant ID is readable in URLs. */
export function issueOptOutToken(identity: OptOutIdentity, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(secret), iv);
  cipher.setAAD(Buffer.from(PURPOSE));
  const body = Buffer.concat([cipher.update(JSON.stringify({ ...identity, email: normalizeMarketingEmail(identity.email) }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}
export function readOptOutToken(token: string, secret?: string): OptOutIdentity {
  if (!/^[A-Za-z0-9_-]{40,2048}$/.test(token)) throw new Error("Invalid unsubscribe link");
  try {
    const bytes = Buffer.from(token, "base64url");
    if (bytes.toString("base64url") !== token) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", tokenKey(secret), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(PURPOSE));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
    if (typeof value.workspace !== "string" || !value.workspace || value.workspace.length > 256) throw new Error();
    return { workspace: value.workspace, email: normalizeMarketingEmail(value.email) };
  } catch { throw new Error("Invalid unsubscribe link"); }
}
export function assertStagingMarketingRecipient(recipients: string[], env = process.env): void {
  if (env.NODE_ENV === "production" || env.MARKETING_SENDS_ENABLED !== "staging-only" || env.APP_ENV !== "staging") {
    throw new Error("Marketing sending disabled. Release approval and staging acceptance are required.");
  }
  const approved = normalizeMarketingEmail(env.MARKETING_TEST_RECIPIENT || "");
  if (recipients.length !== 1 || normalizeMarketingEmail(recipients[0]) !== approved) throw new Error("Only the approved staging test recipient may receive marketing");
}
export function marketingPublicOrigin(raw = process.env.MARKETING_PUBLIC_ORIGIN || ""): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Configure an HTTPS MARKETING_PUBLIC_ORIGIN without a path");
  return url.origin;
}
export function escapeMarketingHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
export function addMarketingFooter(input: { text: string; html?: string | null; address: string; brand: string; url: string }) {
  if (!input.address.trim() || !input.brand.trim() || /[\r\n]/.test(input.url)) throw new Error("Marketing sender setup incomplete");
  const u = new URL(input.url);
  if (u.protocol !== "https:" || u.username || u.password) throw new Error("Unsafe unsubscribe URL");
  const e = escapeMarketingHtml;
  return {
    text: `${input.text}\n\n${input.brand}\n${input.address}\nUnsubscribe: ${input.url}`,
    html: `${input.html || `<div>${e(input.text).replace(/\n/g, "<br>")}</div>`}<footer><p>${e(input.brand)}<br>${e(input.address).replace(/\n/g, "<br>")}</p><p><a href="${e(input.url)}">Unsubscribe from marketing emails</a></p></footer>`,
  };
}

export function normalizeMarketingPhone(raw: string): string {
  const value = raw.replace(/^whatsapp:/, "").replace(/[ ()\-.]/g, "");
  if (!/^\+[1-9][0-9]{7,14}$/.test(value)) throw new Error("International phone number required");
  return value;
}

/** Internal CRM phone fields may store provider E.164 identifiers without +. */
export function normalizeStoredMarketingPhone(raw: string): string {
  const value = raw.replace(/^whatsapp:/, "").replace(/[ ()\-.]/g, "");
  return normalizeMarketingPhone(value.startsWith("+") ? value : "+" + value);
}

/** The authenticated inbound provider phone is authoritative, optional CRM fields are independent. */
export function inboundStopIdentity(providerPhone: string, contactEmail?: string | null) {
  const phone = normalizeStoredMarketingPhone(providerPhone);
  let email: string | undefined;
  try { if (contactEmail) email = normalizeMarketingEmail(contactEmail); } catch {}
  return {phone,email};
}
