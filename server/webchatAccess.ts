/**
 * Public widget request hardening: existence, enabled, origin, payload, rate limits.
 * Origin allowlist is an abuse control — not the only security boundary.
 */

import type { Request } from "express";
import {
  normalizeAllowedOriginsList,
  originMatchesAllowlist,
  parseAllowAnyOrigin,
  publicWidgetEmbedDecision,
} from "@shared/webchatOriginPolicy";
import { parseHttpUrl } from "@shared/webchatPageContext";
import { consumeRateLimit, getClientIp } from "./rateLimitMiddleware";
import { getWidgetOwnerByPublicId, type WidgetOwner } from "./widgetIdentity";

export const WEBCHAT_GENERIC_NOT_FOUND = { error: "Not found" };
export const WEBCHAT_GENERIC_DISABLED = { error: "Widget unavailable" };
export const WEBCHAT_GENERIC_RATE_LIMIT = { error: "Too many requests. Please try again shortly." };

const MAX_MESSAGE = 4000;
const MAX_NAME = 120;
const MAX_VISITOR_ID = 80;
const MAX_TITLE = 300;

export type WidgetSettingsShape = {
  enabled?: boolean;
  allowedOrigins?: unknown;
};

export function isWidgetEnabled(settings: Record<string, unknown> | undefined): boolean {
  if (!settings) return true;
  return settings.enabled !== false;
}

export function parseAllowedOrigins(settings: Record<string, unknown> | undefined): string[] {
  return normalizeAllowedOriginsList(settings?.allowedOrigins);
}

export function originFromHeader(value: string | undefined): string | null {
  if (!value) return null;
  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return new URL(value).origin.toLowerCase();
    }
    return `https://${value}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return null;
  }
}

export function requestOrigin(req: Request): string | null {
  const origin = originFromHeader(
    typeof req.headers.origin === "string" ? req.headers.origin : undefined,
  );
  if (origin) return origin;
  const referer = originFromHeader(
    typeof req.headers.referer === "string" ? req.headers.referer : undefined,
  );
  return referer;
}

export function originAllowed(
  allowed: string[],
  candidateOrigin: string | null,
  parentUrl?: string | null,
  opts?: { allowAny?: boolean },
): boolean {
  if (opts?.allowAny) return true;
  if (allowed.length === 0) return false;
  if (candidateOrigin && originMatchesAllowlist(allowed, candidateOrigin)) return true;
  const parent = parseHttpUrl(parentUrl || "");
  if (parent && originMatchesAllowlist(allowed, parent.origin.toLowerCase())) return true;
  return false;
}

export function parentUrlAllowed(
  allowed: string[],
  parentUrl: string | undefined,
  opts?: { allowAny?: boolean },
): boolean {
  if (!parentUrl) return true;
  const parsed = parseHttpUrl(parentUrl);
  if (!parsed) return false;
  if (opts?.allowAny) return true;
  if (allowed.length === 0) return false;
  return originAllowed(allowed, parsed.origin.toLowerCase(), parentUrl, opts);
}

export type WebchatInboundBody = {
  visitorId: string;
  message: string;
  name?: string;
  source?: string;
  parentUrl?: string;
  pageTitle?: string;
  referrer?: string;
};

export type MatchedWidgetPageRule = {
  urlContains: string;
  greeting?: string;
  prefilledMessage?: string;
  suggestedQuestions: string[];
  chatbotFlowId?: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

export function matchWidgetPageRule(
  settings: Record<string, unknown> | undefined,
  href: string,
): MatchedWidgetPageRule | null {
  const trimmedHref = (href || "").slice(0, 4000);
  const rules = Array.isArray(settings?.pageRules) ? settings!.pageRules : [];
  for (const raw of rules) {
    const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const q = String(r.urlContains ?? "").trim();
    if (q && trimmedHref.indexOf(q) !== -1) {
      const questions = Array.isArray(r.suggestedQuestions)
        ? r.suggestedQuestions
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 8)
        : [];
      const flowId = typeof r.chatbotFlowId === "string" ? r.chatbotFlowId.trim() : "";
      const ctaLabel = typeof r.ctaLabel === "string" ? r.ctaLabel.trim().slice(0, 80) : "";
      const ctaUrl = typeof r.ctaUrl === "string" ? r.ctaUrl.trim().slice(0, 2000) : "";
      return {
        urlContains: q.slice(0, 500),
        greeting: typeof r.greeting === "string" ? r.greeting : undefined,
        prefilledMessage: typeof r.prefilledMessage === "string" ? r.prefilledMessage : undefined,
        suggestedQuestions: questions,
        chatbotFlowId: flowId || undefined,
        ctaLabel: ctaLabel || undefined,
        ctaUrl: ctaUrl || undefined,
      };
    }
  }
  return null;
}

export function parseWebchatInboundBody(body: unknown): { ok: true; data: WebchatInboundBody } | { ok: false } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE) return { ok: false };
  let visitorId = typeof b.visitorId === "string" ? b.visitorId.trim() : "";
  if (!visitorId) visitorId = `visitor_${Date.now()}`;
  if (visitorId.length > MAX_VISITOR_ID) return { ok: false };
  if (!/^[a-zA-Z0-9._:-]+$/.test(visitorId)) return { ok: false };
  const name = typeof b.name === "string" ? b.name.trim().slice(0, MAX_NAME) : undefined;
  const source = typeof b.source === "string" ? b.source.trim().slice(0, 80) : undefined;
  const parentUrl = typeof b.parentUrl === "string" ? b.parentUrl.trim().slice(0, 2000) : undefined;
  if (parentUrl && !parseHttpUrl(parentUrl)) return { ok: false };
  const pageTitle = typeof b.pageTitle === "string" ? b.pageTitle.trim().slice(0, MAX_TITLE) : undefined;
  const referrer = typeof b.referrer === "string" ? b.referrer.trim().slice(0, 2000) : undefined;
  if (referrer && !parseHttpUrl(referrer)) return { ok: false };
  return {
    ok: true,
    data: { visitorId, message, name, source, parentUrl, pageTitle, referrer },
  };
}

export async function consumeWebchatRateLimits(params: {
  req: Request;
  widgetPublicId: string;
  visitorId?: string;
}): Promise<boolean> {
  const ip = getClientIp(params.req);
  const windowMs = 15 * 60 * 1000;
  const widget = await consumeRateLimit(`webchat:widget:${params.widgetPublicId}`, 120, windowMs);
  if (!widget.allowed) return false;
  const ipBucket = await consumeRateLimit(`webchat:ip:${ip}`, 60, windowMs);
  if (!ipBucket.allowed) return false;
  if (params.visitorId) {
    const vis = await consumeRateLimit(
      `webchat:visitor:${params.widgetPublicId}:${params.visitorId}`,
      40,
      windowMs,
    );
    if (!vis.allowed) return false;
  }
  return true;
}

export async function consumeWebchatContactCap(params: {
  widgetPublicId: string;
  visitorId: string;
  isNewContact: boolean;
}): Promise<boolean> {
  if (!params.isNewContact) return true;
  const cap = await consumeRateLimit(`webchat:newcontact:${params.widgetPublicId}`, 30, 60 * 60 * 1000);
  return cap.allowed;
}

export type ResolvedWidgetAccess =
  | { ok: true; owner: WidgetOwner; allowedOrigins: string[] }
  | { ok: false; status: number; body: Record<string, string> };

export async function resolvePublicWidgetAccess(
  req: Request,
  publicId: string,
  opts?: { parentUrl?: string | null; requireEnabled?: boolean; strictOrigin?: boolean },
): Promise<ResolvedWidgetAccess> {
  const owner = await getWidgetOwnerByPublicId(publicId);
  if (!owner) {
    return { ok: false, status: 404, body: WEBCHAT_GENERIC_NOT_FOUND };
  }
  const requireEnabled = opts?.requireEnabled !== false;
  const embed = publicWidgetEmbedDecision(owner.widgetSettings);
  if (requireEnabled && !embed.ok) {
    return { ok: false, status: 404, body: WEBCHAT_GENERIC_DISABLED };
  }
  const allowAny = parseAllowAnyOrigin(owner.widgetSettings);
  const allowedOrigins = embed.ok ? embed.allowedOrigins : parseAllowedOrigins(owner.widgetSettings);
  const origin = requestOrigin(req);
  const strictOrigin = opts?.strictOrigin !== false;
  const hasHint = Boolean(origin || opts?.parentUrl);
  if (!allowAny && (strictOrigin || hasHint)) {
    if (!originAllowed(allowedOrigins, origin, opts?.parentUrl, { allowAny })) {
      return { ok: false, status: 404, body: WEBCHAT_GENERIC_NOT_FOUND };
    }
    if (opts?.parentUrl && !parentUrlAllowed(allowedOrigins, opts.parentUrl, { allowAny })) {
      return { ok: false, status: 404, body: WEBCHAT_GENERIC_NOT_FOUND };
    }
  }
  return { ok: true, owner, allowedOrigins };
}
