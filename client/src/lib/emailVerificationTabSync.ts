/**
 * Browser handshake between /check-email (waiting) and /verify-email (link tab).
 * Uses BroadcastChannel with a localStorage heartbeat/signal fallback. No PII.
 */

import {
  CHECK_EMAIL_SESSION_POLL_MS,
  EMAIL_VERIFICATION_ACK_WAIT_MS,
  EMAIL_VERIFICATION_CHANNEL_NAME,
  EMAIL_VERIFICATION_SIGNAL_KEY,
  EMAIL_VERIFICATION_WAITER_KEY,
  EMAIL_VERIFICATION_WAITER_TTL_MS,
  detectOriginalVerificationTab,
  emailVerificationTabMessage,
  isSafeEmailVerificationTabMessage,
  isWaiterHeartbeatLive,
} from "@shared/emailVerificationTabs";

export {
  CHECK_EMAIL_SESSION_POLL_MS,
  decideVerificationLinkFollowUp,
  shouldAutoCloseVerificationTab,
  tryCloseScriptOpenedTab,
  verificationContinuePath,
} from "@shared/emailVerificationTabs";

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function removeLocal(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

function openChannel(): BroadcastChannel | null {
  try {
    if (typeof BroadcastChannel === "undefined") return null;
    return new BroadcastChannel(EMAIL_VERIFICATION_CHANNEL_NAME);
  } catch {
    return null;
  }
}

/** Claim the original waiting tab. onVerified receives no payload. */
export function startEmailVerificationWaiter(onVerified: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const writeBeat = () => writeLocal(EMAIL_VERIFICATION_WAITER_KEY, String(Date.now()));
  writeBeat();
  const beat = window.setInterval(writeBeat, Math.max(2_000, Math.floor(EMAIL_VERIFICATION_WAITER_TTL_MS / 4)));

  const channel = openChannel();
  if (channel) {
    channel.onmessage = (ev) => {
      if (!isSafeEmailVerificationTabMessage(ev.data)) return;
      if (ev.data.type !== "verified") return;
      try {
        channel.postMessage(emailVerificationTabMessage("waiter-ack"));
      } catch {
        /* ignore */
      }
      onVerified();
    };
    try {
      channel.postMessage(emailVerificationTabMessage("waiter-hello"));
    } catch {
      /* ignore */
    }
  }

  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== EMAIL_VERIFICATION_SIGNAL_KEY || !ev.newValue) return;
    onVerified();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    window.clearInterval(beat);
    window.removeEventListener("storage", onStorage);
    removeLocal(EMAIL_VERIFICATION_WAITER_KEY);
    try {
      channel?.close();
    } catch {
      /* ignore */
    }
  };
}

/** Notify same-origin waiting tabs after verification succeeds. Returns whether one answered. */
export async function announceVerifiedAndAwaitOriginalTab(
  ackTimeoutMs = EMAIL_VERIFICATION_ACK_WAIT_MS,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const now = Date.now();
  writeLocal(EMAIL_VERIFICATION_SIGNAL_KEY, String(now));

  if (detectOriginalVerificationTab({ now, waiterHeartbeat: readLocal(EMAIL_VERIFICATION_WAITER_KEY) })) {
    const channel = openChannel();
    try {
      channel?.postMessage(emailVerificationTabMessage("verified"));
    } catch {
      /* ignore */
    }
    try {
      channel?.close();
    } catch {
      /* ignore */
    }
    return true;
  }

  return new Promise((resolve) => {
    let settled = false;
    const channel = openChannel();
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      try {
        channel?.close();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    if (channel) {
      channel.onmessage = (ev) => {
        if (!isSafeEmailVerificationTabMessage(ev.data)) return;
        if (ev.data.type === "waiter-ack" || ev.data.type === "waiter-hello") finish(true);
      };
      try {
        channel.postMessage(emailVerificationTabMessage("verified"));
      } catch {
        finish(false);
        return;
      }
    }

    window.setTimeout(() => {
      finish(
        isWaiterHeartbeatLive(readLocal(EMAIL_VERIFICATION_WAITER_KEY), Date.now()),
      );
    }, ackTimeoutMs);
  });
}
