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
/**
 * Single-workspace, time-limited, reviewed prospect pilot. Does not enable general
 * marketing sends and cannot be configured by tenants or per-message metadata.
 * At most five exact contact/email pairs may be permitted for up to seven days.
 */
export function readProductionPilotConfig(env: NodeJS.ProcessEnv = process.env, nowMs = Date.now()): {
  workspace: string;
  mailbox: string;
  recipients: Array<{ contactId: string; email: string }>;
} {
  if (env.NODE_ENV !== "production" || env.APP_ENV !== "production" ||
      env.MARKETING_SENDS_ENABLED !== "production-pilot") {
    throw new Error("Marketing pilot is not enabled");
  }
  const workspace = env.MARKETING_PILOT_WORKSPACE_ID || "";
  const mailbox = env.MARKETING_PILOT_MAILBOX_ID || "";
  const expiration = String(env.MARKETING_PILOT_EXPIRES_AT || "");
  const expiresAt = Date.parse(expiration);
  if (!workspace || !mailbox || !/^\d{4}-\d{2}-\d{2}T/.test(expiration) ||
      !expiration.endsWith("Z") || !Number.isFinite(expiresAt) ||
      expiresAt <= nowMs || expiresAt > nowMs + 7 * 24 * 60 * 60 * 1000) {
    throw new Error("Pilot requires a pinned workspace, mailbox and expiry within seven days");
  }
  let raw: unknown;
  try { raw = JSON.parse(env.MARKETING_PILOT_CONTACTS_JSON || ""); }
  catch { throw new Error("Pilot requires a valid reviewed contact allowlist"); }
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 5) {
    throw new Error("Pilot may contain between one and five reviewed recipients");
  }
  const recipients: Array<{contactId: string;email: string}> = [];
  const contactIds = new Set<string>();
  const emails = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.contactId !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(row.contactId) ||
        typeof row.email !== "string") {
      throw new Error("Pilot contact allowlist is malformed");
    }
    const email = normalizeMarketingEmail(row.email);
    if (contactIds.has(row.contactId) || emails.has(email)) {
      throw new Error("Pilot requires unique contact identities and email addresses");
    }
    contactIds.add(row.contactId);
    emails.add(email);
    recipients.push({contactId: row.contactId, email});
  }
  return {workspace,mailbox,recipients};
}

export function marketingQueueProbeRecipient(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MARKETING_SENDS_ENABLED === "production-pilot") {
    return readProductionPilotConfig(env).recipients[0]!.email;
  }
  return env.MARKETING_TEST_RECIPIENT || "";
}

type MarketingAcceptanceContext = { workspace?: string; mailbox?: string; contactId?: string; phase?: "queue" | "send" };

/**
 * Default-deny marketing delivery. Staging can send only to its pre-approved test
 * recipient. Production can do the same for a specifically pinned workspace,
 * mailbox, contact ID and recipient; this is NOT general marketing activation.
 * The final send path must supply phase:"send" and contactId even if the queue
 * was started earlier. No optional bypass via untrusted message metadata.
 */
export function assertStagingMarketingRecipient(
  recipients: string[],
  env: NodeJS.ProcessEnv = process.env,
  context: MarketingAcceptanceContext = {},
): void {
  const staging = env.NODE_ENV !== "production" &&
    env.APP_ENV === "staging" &&
    env.MARKETING_SENDS_ENABLED === "staging-only";
  const productionTest = env.NODE_ENV === "production" &&
    env.APP_ENV === "production" &&
    env.MARKETING_SENDS_ENABLED === "production-test-only";
  const pilot = env.NODE_ENV === "production" && env.APP_ENV === "production" &&
    env.MARKETING_SENDS_ENABLED === "production-pilot";
  if (pilot) {
    const config = readProductionPilotConfig(env);
    if (context.workspace !== config.workspace || context.mailbox !== config.mailbox ||
        (context.phase !== "queue" && context.phase !== "send") ||
        recipients.length !== 1) {
      throw new Error("Pilot blocked: unapproved workspace, mailbox or multiple recipients");
    }
    const email = normalizeMarketingEmail(recipients[0]);
    const allowed = config.recipients.some(row =>
      row.email === email && (context.phase === "queue" || row.contactId === context.contactId)
    );
    if (!allowed) throw new Error("Pilot blocked: recipient/contact pair not reviewed");
    return;
  }
  if (!staging && !productionTest) {
    throw new Error("Marketing sending disabled. Release approval and staging acceptance are required.");
  }
  const approved = normalizeMarketingEmail(env.MARKETING_TEST_RECIPIENT || "");
  if (recipients.length !== 1 || normalizeMarketingEmail(recipients[0]) !== approved) {
    throw new Error("Only the approved marketing test recipient may receive marketing");
  }
  if (productionTest) {
    const expectedWorkspace = env.MARKETING_TEST_WORKSPACE_ID || "";
    const expectedMailbox = env.MARKETING_TEST_MAILBOX_ID || "";
    const expectedContact = env.MARKETING_TEST_CONTACT_ID || "";
    if (!expectedWorkspace || !expectedMailbox || !expectedContact ||
        context.workspace !== expectedWorkspace || context.mailbox !== expectedMailbox ||
        (context.phase === "send" && context.contactId !== expectedContact) ||
        (context.phase !== "queue" && context.phase !== "send")) {
      throw new Error("Production marketing acceptance is restricted to one verified workspace, mailbox and test contact");
    }
  }
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
