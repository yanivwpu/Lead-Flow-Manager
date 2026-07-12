import { GMAIL_OAUTH_SCOPES, type NormalizedEmailAddress, type NormalizedEmailMessage } from "@shared/emailChannel";
import type {
  EmailHistoryResult,
  EmailMailboxProfile,
  EmailMailboxTokens,
  EmailProvider,
  EmailSendResult,
  EmailSyncPageResult,
} from "./provider";
import { htmlToPlainText } from "./htmlSanitize";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

function requireGmailEnv(): { clientId: string; clientSecret: string } {
  const clientId = String(process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_EMAIL_CLIENT_ID || "").trim();
  const clientSecret = String(
    process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_EMAIL_CLIENT_SECRET || "",
  ).trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Gmail OAuth is not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (separate Google Cloud OAuth client recommended).",
    );
  }
  return { clientId, clientSecret };
}

function parseEmailHeader(raw: string | undefined | null): NormalizedEmailAddress | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  const angle = v.match(/^(.*)<([^>]+)>$/);
  if (angle) {
    const email = angle[2].trim().toLowerCase();
    const name = angle[1].replace(/^["']|["']$/g, "").trim() || null;
    if (!email.includes("@")) return null;
    return { email, name };
  }
  if (v.includes("@")) return { email: v.toLowerCase(), name: null };
  return null;
}

function parseAddressList(raw: string | undefined | null): NormalizedEmailAddress[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((p) => parseEmailHeader(p.trim()))
    .filter((x): x is NormalizedEmailAddress => !!x);
}

function headerMap(headers: Array<{ name?: string; value?: string }> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers || []) {
    const n = String(h.name || "").toLowerCase();
    if (!n) continue;
    out[n] = String(h.value || "");
  }
  return out;
}

function decodeBase64Url(data: string | undefined | null): string {
  if (!data) return "";
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function extractBodies(payload: any): { text: string | null; html: string | null } {
  let text: string | null = null;
  let html: string | null = null;

  const walk = (part: any) => {
    if (!part) return;
    const mime = String(part.mimeType || "").toLowerCase();
    if (mime === "text/plain" && part.body?.data && !text) {
      text = decodeBase64Url(part.body.data);
    }
    if (mime === "text/html" && part.body?.data && !html) {
      html = decodeBase64Url(part.body.data);
    }
    for (const child of part.parts || []) walk(child);
  };
  walk(payload);
  return { text, html };
}

function extractAttachments(payload: any): NormalizedEmailMessage["attachments"] {
  const out: NormalizedEmailMessage["attachments"] = [];
  const walk = (part: any) => {
    if (!part) return;
    const filename = String(part.filename || "").trim();
    const attId = part.body?.attachmentId;
    if (filename && attId) {
      out.push({
        filename,
        mimeType: part.mimeType || null,
        size: typeof part.body?.size === "number" ? part.body.size : null,
        providerAttachmentId: String(attId),
      });
    }
    for (const child of part.parts || []) walk(child);
  };
  walk(payload);
  return out;
}

function toRfc2822(params: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string | null;
  inReplyTo?: string | null;
  references?: string[] | null;
}): string {
  const lines: string[] = [];
  lines.push(`From: ${params.from}`);
  lines.push(`To: ${params.to.join(", ")}`);
  if (params.cc?.length) lines.push(`Cc: ${params.cc.join(", ")}`);
  if (params.bcc?.length) lines.push(`Bcc: ${params.bcc.join(", ")}`);
  lines.push(`Subject: ${params.subject}`);
  lines.push("MIME-Version: 1.0");
  if (params.inReplyTo) lines.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references?.length) lines.push(`References: ${params.references.join(" ")}`);

  const html = params.htmlBody?.trim();
  if (html) {
    const boundary = `whachat_${Date.now()}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("");
    lines.push(params.textBody);
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/html; charset=UTF-8");
    lines.push("");
    lines.push(html);
    lines.push(`--${boundary}--`);
  } else {
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("");
    lines.push(params.textBody);
  }
  return lines.join("\r\n");
}

function encodeRawMessage(rfc2822: string): string {
  return Buffer.from(rfc2822)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function normalizeGmailApiMessage(
  raw: any,
  mailboxEmail: string,
): NormalizedEmailMessage | null {
  const id = String(raw?.id || "").trim();
  const threadId = String(raw?.threadId || "").trim();
  if (!id || !threadId) return null;

  const headers = headerMap(raw?.payload?.headers);
  const from = parseEmailHeader(headers.from) || { email: "unknown@invalid", name: null };
  const to = parseAddressList(headers.to);
  const cc = parseAddressList(headers.cc);
  const bcc = parseAddressList(headers.bcc);
  const replyTo = parseEmailHeader(headers["reply-to"]);
  const subject = headers.subject || null;
  const rfcMessageId = headers["message-id"] || null;
  const inReplyTo = headers["in-reply-to"] || null;
  const references = headers.references
    ? headers.references.split(/\s+/).map((s) => s.trim()).filter(Boolean)
    : [];

  const bodies = extractBodies(raw.payload);
  const attachments = extractAttachments(raw.payload);
  const mailbox = mailboxEmail.trim().toLowerCase();
  const fromEmail = from.email.toLowerCase();
  const direction: "inbound" | "outbound" = fromEmail === mailbox ? "outbound" : "inbound";

  const textBody =
    bodies.text?.trim() ||
    (bodies.html ? htmlToPlainText(bodies.html) : null) ||
    String(raw.snippet || "").trim() ||
    null;

  const internalDate = raw.internalDate ? new Date(Number(raw.internalDate)) : new Date();

  return {
    provider: "gmail",
    providerMessageId: id,
    providerThreadId: threadId,
    direction,
    subject,
    snippet: raw.snippet || textBody?.slice(0, 200) || null,
    textBody,
    htmlBody: bodies.html,
    from,
    to,
    cc,
    bcc,
    replyTo,
    rfcMessageId,
    inReplyTo,
    references,
    sentAt: Number.isNaN(internalDate.getTime()) ? new Date() : internalDate,
    hasAttachments: attachments.length > 0,
    attachments,
    selectedHeaders: {
      from: headers.from || "",
      to: headers.to || "",
      cc: headers.cc || "",
      subject: headers.subject || "",
      date: headers.date || "",
    },
  };
}

export class GmailEmailProvider implements EmailProvider {
  readonly id = "gmail" as const;

  getAuthorizationUrl(params: { state: string; redirectUri: string; codeChallenge?: string }): string {
    const { clientId } = requireGmailEnv();
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: params.redirectUri,
      response_type: "code",
      scope: GMAIL_OAUTH_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: params.state,
    });
    if (params.codeChallenge) {
      q.set("code_challenge", params.codeChallenge);
      q.set("code_challenge_method", "S256");
    }
    return `${GOOGLE_AUTH}?${q.toString()}`;
  }

  async exchangeAuthorizationCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<EmailMailboxTokens & EmailMailboxProfile> {
    const { clientId, clientSecret } = requireGmailEnv();
    const body = new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    });
    if (params.codeVerifier) body.set("code_verifier", params.codeVerifier);

    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const tokenJson = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error("Gmail OAuth token exchange failed");
    }

    const accessToken = String(tokenJson.access_token);
    const refreshToken = tokenJson.refresh_token ? String(tokenJson.refresh_token) : null;
    const expiresIn = Number(tokenJson.expires_in || 3600);
    const profile = await this.getMailboxProfile(accessToken);

    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      scopes: tokenJson.scope ? String(tokenJson.scope) : GMAIL_OAUTH_SCOPES.join(" "),
      ...profile,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<EmailMailboxTokens> {
    const { clientId, clientSecret } = requireGmailEnv();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const tokenJson = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error("Gmail token refresh failed — reconnect required");
    }
    const expiresIn = Number(tokenJson.expires_in || 3600);
    return {
      accessToken: String(tokenJson.access_token),
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      scopes: tokenJson.scope ? String(tokenJson.scope) : null,
    };
  }

  async getMailboxProfile(accessToken: string): Promise<EmailMailboxProfile> {
    const res = await fetch(`${GMAIL_API}/users/me/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error("Failed to load Gmail profile");
    const emailAddress = String(json.emailAddress || "").trim().toLowerCase();
    if (!emailAddress) throw new Error("Gmail profile missing emailAddress");

    let displayName: string | null = null;
    try {
      const ui = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (ui.ok) {
        const u = (await ui.json()) as { name?: string };
        displayName = u.name?.trim() || null;
      }
    } catch {
      /* optional */
    }

    return {
      emailAddress,
      displayName,
      providerAccountId: emailAddress,
    };
  }

  async listRecentMessages(params: {
    accessToken: string;
    afterDate: Date | null;
    pageToken?: string | null;
    maxResults?: number;
  }): Promise<EmailSyncPageResult> {
    const qParts = ["(in:inbox OR in:sent)"];
    if (params.afterDate) {
      const epoch = Math.floor(params.afterDate.getTime() / 1000);
      qParts.push(`after:${epoch}`);
    }
    const qs = new URLSearchParams({
      q: qParts.join(" "),
      maxResults: String(Math.min(Math.max(params.maxResults || 50, 1), 100)),
    });
    if (params.pageToken) qs.set("pageToken", params.pageToken);

    const listRes = await fetch(`${GMAIL_API}/users/me/messages?${qs}`, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
    const listJson = (await listRes.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      nextPageToken?: string;
      resultSizeEstimate?: number;
    };
    if (!listRes.ok) {
      throw new Error("Gmail messages.list failed");
    }

    const profile = await this.getMailboxProfile(params.accessToken);
    const messages: NormalizedEmailMessage[] = [];
    for (const row of listJson.messages || []) {
      const msg = await this.getMessage(params.accessToken, row.id);
      if (msg) messages.push(msg);
    }

    // historyId from profile endpoint is better; fetch once
    let historyId: string | null = null;
    try {
      const prof = await fetch(`${GMAIL_API}/users/me/profile`, {
        headers: { Authorization: `Bearer ${params.accessToken}` },
      });
      if (prof.ok) {
        const p = (await prof.json()) as { historyId?: string };
        historyId = p.historyId ? String(p.historyId) : null;
      }
    } catch {
      /* ignore */
    }

    void profile;
    return {
      messages,
      nextPageToken: listJson.nextPageToken || null,
      historyId,
    };
  }

  async getMessage(accessToken: string, providerMessageId: string): Promise<NormalizedEmailMessage | null> {
    const res = await fetch(
      `${GMAIL_API}/users/me/messages/${encodeURIComponent(providerMessageId)}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const raw = await res.json();
    const profileRes = await fetch(`${GMAIL_API}/users/me/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = profileRes.ok
      ? ((await profileRes.json()) as { emailAddress?: string })
      : { emailAddress: "" };
    return normalizeGmailApiMessage(raw, String(profile.emailAddress || ""));
  }

  async historyList(params: {
    accessToken: string;
    startHistoryId: string;
  }): Promise<EmailHistoryResult> {
    const qs = new URLSearchParams({
      startHistoryId: params.startHistoryId,
      historyTypes: "messageAdded",
    });
    const res = await fetch(`${GMAIL_API}/users/me/history?${qs}`, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
    if (res.status === 404) {
      return { messageIds: [], historyId: null, needsBoundedResync: true };
    }
    const json = (await res.json().catch(() => ({}))) as {
      history?: Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>;
      historyId?: string;
      error?: { code?: number };
    };
    if (!res.ok) {
      if (json.error?.code === 404) {
        return { messageIds: [], historyId: null, needsBoundedResync: true };
      }
      throw new Error("Gmail history.list failed");
    }
    const ids = new Set<string>();
    for (const h of json.history || []) {
      for (const added of h.messagesAdded || []) {
        const id = added.message?.id;
        if (id) ids.add(id);
      }
    }
    return {
      messageIds: Array.from(ids),
      historyId: json.historyId ? String(json.historyId) : null,
      needsBoundedResync: false,
    };
  }

  async sendNewEmail(params: {
    accessToken: string;
    from: string;
    payload: import("@shared/emailChannel").EmailRichSendPayload;
    textBody: string;
    htmlBody?: string | null;
  }): Promise<EmailSendResult> {
    const to = params.payload.to || [];
    if (!to.length) return { success: false, error: "Recipient required" };
    const subject = String(params.payload.subject || "").trim();
    if (!subject) return { success: false, error: "Subject required" };

    const raw = encodeRawMessage(
      toRfc2822({
        from: params.from,
        to,
        cc: params.payload.cc,
        bcc: params.payload.bcc,
        subject,
        textBody: params.textBody,
        htmlBody: params.htmlBody,
      }),
    );

    const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      threadId?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { success: false, error: json.error?.message || "Gmail send failed" };
    }
    return {
      success: true,
      providerMessageId: json.id,
      providerThreadId: json.threadId,
    };
  }

  async replyToThread(params: {
    accessToken: string;
    from: string;
    threadId: string;
    payload: import("@shared/emailChannel").EmailRichSendPayload;
    textBody: string;
    htmlBody?: string | null;
  }): Promise<EmailSendResult> {
    const to = params.payload.to || [];
    if (!to.length) return { success: false, error: "Recipient required" };
    const subject = String(params.payload.subject || "").trim() || "Re:";

    const raw = encodeRawMessage(
      toRfc2822({
        from: params.from,
        to,
        cc: params.payload.cc,
        bcc: params.payload.bcc,
        subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
        textBody: params.textBody,
        htmlBody: params.htmlBody,
        inReplyTo: params.payload.inReplyTo,
        references: params.payload.references,
      }),
    );

    const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw, threadId: params.threadId }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      threadId?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { success: false, error: json.error?.message || "Gmail reply failed" };
    }
    return {
      success: true,
      providerMessageId: json.id,
      providerThreadId: json.threadId || params.threadId,
    };
  }
}

export const gmailEmailProvider = new GmailEmailProvider();

export function getEmailProvider(id: string = "gmail"): EmailProvider {
  if (id === "gmail") return gmailEmailProvider;
  throw new Error(`Email provider not implemented: ${id}`);
}
