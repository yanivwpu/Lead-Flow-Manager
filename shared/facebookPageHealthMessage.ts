/**
 * User-facing Facebook Page / channel-health messages from sanitized Meta Graph errors.
 */

export type FacebookPageHealthIssueKind =
  | "invalid_token"
  | "missing_authorization"
  | "missing_permissions"
  | "page_unavailable"
  | "temporary_failure"
  | "subscription_failure"
  | "unknown";

export type SanitizedGraphErrorLike = {
  httpStatus?: number | null;
  code?: number | string | null;
  errorSubcode?: number | string | null;
  error_subcode?: number | string | null;
  type?: string | null;
  message?: string | null;
};

function asCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

export function classifyFacebookPageGraphError(
  err: SanitizedGraphErrorLike | null | undefined,
  outcome?: "success" | "http_error" | "timeout" | "network" | string | null,
): FacebookPageHealthIssueKind {
  if (outcome === "timeout" || outcome === "network") return "temporary_failure";
  const code = asCode(err?.code);
  const sub = asCode(err?.errorSubcode ?? err?.error_subcode);
  const msg = (err?.message || "").toLowerCase();
  const status = typeof err?.httpStatus === "number" ? err.httpStatus : null;

  if (code === 190 || code === 102 || msg.includes("session has expired") || msg.includes("invalid oauth")) {
    return "invalid_token";
  }
  // (#10) permission / (#200) permissions / (#230) requires pages_messaging etc.
  if (
    code === 10 ||
    code === 200 ||
    code === 230 ||
    sub === 2018001 ||
    msg.includes("permission") ||
    msg.includes("not authorized") ||
    msg.includes("pages_messaging") ||
    msg.includes("pages_show_list")
  ) {
    if (msg.includes("not been authorized") || msg.includes("authorize") || msg.includes("business integration")) {
      return "missing_authorization";
    }
    return "missing_permissions";
  }
  if (
    code === 100 ||
    code === 803 ||
    msg.includes("unsupported get request") ||
    msg.includes("does not exist") ||
    msg.includes("unpublished") ||
    msg.includes("cannot be loaded")
  ) {
    // Common when Page wasn't shared with the app during Meta authorization.
    if (
      msg.includes("unsupported get request") ||
      msg.includes("does not exist") ||
      status === 400
    ) {
      return "missing_authorization";
    }
    return "page_unavailable";
  }
  if (status != null && status >= 500) return "temporary_failure";
  if (status === 400 || status === 403) return "missing_authorization";
  return "unknown";
}

export function facebookPageHealthUserMessage(
  kind: FacebookPageHealthIssueKind,
): { issue: string; recovery: string } {
  switch (kind) {
    case "invalid_token":
      return {
        issue: "Facebook access expired or was revoked.",
        recovery: "Reconnect with Facebook in Settings to refresh access.",
      };
    case "missing_authorization":
      return {
        issue: "This Facebook Page is not authorized for WhachatCRM.",
        recovery:
          "In Facebook authorization, grant access to this Page (or choose All current and future Pages), then select it here.",
      };
    case "missing_permissions":
      return {
        issue: "WhachatCRM is missing required Facebook Page permissions.",
        recovery: "Reconnect with Facebook and approve all requested permissions.",
      };
    case "page_unavailable":
      return {
        issue: "This Facebook Page is unavailable or unpublished.",
        recovery: "Confirm the Page is published in Meta, then reconnect if needed.",
      };
    case "temporary_failure":
      return {
        issue: "Facebook is temporarily unreachable.",
        recovery: "Try again in a few minutes. Your connection may still be fine.",
      };
    case "subscription_failure":
      return {
        issue: "Webhook subscription for this Page is incomplete.",
        recovery: "Use Resubscribe webhooks in Facebook channel settings, or reconnect the Page.",
      };
    default:
      return {
        issue: "Facebook Page health check failed.",
        recovery: "Reconnect with Facebook in Settings, or contact support if it continues.",
      };
  }
}
