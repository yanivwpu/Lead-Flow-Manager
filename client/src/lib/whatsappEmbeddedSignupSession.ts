/**
 * Meta Embedded Signup session `window.message` listener helpers.
 * Origins must be exact HTTPS Facebook hosts — no substring matching.
 */
import {
  isTrustedMetaEmbeddedSignupOrigin,
  parseEmbeddedSignupSessionMessageData,
  type ParsedEmbeddedSignupSessionEvent,
} from "@shared/whatsappEmbeddedSignupVersion";

export type EmbeddedSignupSessionListener = {
  /** Detach the window listener. Idempotent. */
  dispose: () => void;
  getLastEvent: () => ParsedEmbeddedSignupSessionEvent | null;
};

export function attachEmbeddedSignupSessionListener(params: {
  onEvent?: (event: ParsedEmbeddedSignupSessionEvent) => void;
}): EmbeddedSignupSessionListener {
  let last: ParsedEmbeddedSignupSessionEvent | null = null;
  let active = true;

  const handler = (ev: MessageEvent) => {
    if (!active) return;
    if (typeof ev.origin !== "string" || !isTrustedMetaEmbeddedSignupOrigin(ev.origin)) {
      return;
    }
    const parsed = parseEmbeddedSignupSessionMessageData(ev.data);
    if (!parsed) return;
    last = parsed;
    params.onEvent?.(parsed);
  };

  window.addEventListener("message", handler);

  return {
    dispose: () => {
      if (!active) return;
      active = false;
      window.removeEventListener("message", handler);
    },
    getLastEvent: () => last,
  };
}

export function sessionEventSummaryForServer(
  event: ParsedEmbeddedSignupSessionEvent | null,
): { event?: string; wabaId?: string; phoneNumberId?: string } | undefined {
  if (!event) return undefined;
  return {
    event: event.rawEvent,
    wabaId: event.wabaId,
    phoneNumberId: event.phoneNumberId,
  };
}
