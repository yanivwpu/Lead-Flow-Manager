/**
 * Public webchat message polling budget.
 *
 * Visible interval is 2.5s → 360 requests / 15 minutes / active visitor.
 * Hidden or closed widgets do not poll (Page Visibility). Errors use bounded backoff.
 *
 * Supported concurrent *visible* visitors (hidden tabs are free):
 * - per NAT IP: 25
 * - per widget: 50
 *
 * 15-minute buckets:
 * - visitor 480  (360 + retry/headroom)
 * - IP 12_000     (25 × 360 + settings/retries)
 * - widget 21_600 (50 × 360 + headroom)
 */

export const WEBCHAT_POLL_WINDOW_MS = 15 * 60 * 1000;
export const WEBCHAT_POLL_VISIBLE_MS = 2500;
export const WEBCHAT_POLL_HIDDEN_MS = 0;
export const WEBCHAT_POLL_BACKOFF_MS = [2500, 5000, 10_000, 20_000, 30_000] as const;

export const WEBCHAT_POLL_VISIBLE_PER_WINDOW = Math.floor(WEBCHAT_POLL_WINDOW_MS / WEBCHAT_POLL_VISIBLE_MS);

export const WEBCHAT_POLL_ASSUMED_VISIBLE_VISITORS_PER_IP = 25;
export const WEBCHAT_POLL_ASSUMED_VISIBLE_VISITORS_PER_WIDGET = 50;

export const WEBCHAT_POLL_LIMIT_VISITOR = 480;
export const WEBCHAT_POLL_LIMIT_IP =
  WEBCHAT_POLL_ASSUMED_VISIBLE_VISITORS_PER_IP * WEBCHAT_POLL_VISIBLE_PER_WINDOW + 3000;
export const WEBCHAT_POLL_LIMIT_WIDGET =
  WEBCHAT_POLL_ASSUMED_VISIBLE_VISITORS_PER_WIDGET * WEBCHAT_POLL_VISIBLE_PER_WINDOW + 3600;

/** Global per-IP GET /api/webchat* (poll + settings). Must not be tighter than WEBCHAT_POLL_LIMIT_IP. */
export const WEBCHAT_POLL_GLOBAL_IP_LIMIT = WEBCHAT_POLL_LIMIT_IP;
