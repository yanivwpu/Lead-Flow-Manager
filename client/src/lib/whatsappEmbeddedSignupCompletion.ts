/**
 * Ordering-safe Embedded Signup completion: FB.login code + WA_EMBEDDED_SIGNUP session event
 * may arrive in either order. Completes exactly once; never implies a second Meta signup.
 */
import type { ParsedEmbeddedSignupSessionEvent } from "@shared/whatsappEmbeddedSignupVersion";
import { sessionEventSummaryForServer } from "./whatsappEmbeddedSignupSession";

export const EMBEDDED_SIGNUP_COUNTERPART_WAIT_MS = 2500;

export function isEmbeddedSignupFinishEvent(
  event: ParsedEmbeddedSignupSessionEvent | null | undefined,
): boolean {
  if (!event) return false;
  return (
    event.event === "FINISH" ||
    event.event === "FINISH_ONLY_WABA" ||
    event.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
  );
}

export function shouldAutoRedirectAfterSdkFailure(params: {
  architecture: string | null | undefined;
  fbLoginInvoked: boolean;
  finishEventSeen: boolean;
  completeSdkAttempted: boolean;
}): boolean {
  // Never open a second Meta session after SDK signup was launched or finished.
  // Pre-login failures (e.g. popup blocked before FB.login) may use redirect —
  // start-redirect now uses the same server-authoritative v2/v4 selection.
  if (params.fbLoginInvoked) return false;
  if (params.finishEventSeen) return false;
  if (params.completeSdkAttempted) return false;
  return true;
}

export type CompleteSdkPayload = {
  code: string;
  state: string;
  architecture: string;
  sessionEvent?: { event?: string; wabaId?: string; phoneNumberId?: string };
};

export type CompleteSdkResult =
  | { ok: true; needsWabaPick?: false; needsPhoneRegistration?: boolean }
  | { ok: true; needsWabaPick: true; state: string }
  | {
      ok: false;
      error: string;
      errorCode?: string | null;
      wabaId?: string | null;
      httpStatus: number;
    };

export type EmbeddedSignupCompletionCoordinatorOptions = {
  state: string;
  architecture: string;
  counterpartWaitMs?: number;
  completeSdk: (payload: CompleteSdkPayload) => Promise<CompleteSdkResult>;
  onDisposed?: () => void;
};

/**
 * Correlates auth code + session finish, calls complete-sdk once, disposes once.
 */
export function createEmbeddedSignupCompletionCoordinator(
  options: EmbeddedSignupCompletionCoordinatorOptions,
) {
  const waitMs = options.counterpartWaitMs ?? EMBEDDED_SIGNUP_COUNTERPART_WAIT_MS;
  let code: string | null = null;
  let sessionEvent: ParsedEmbeddedSignupSessionEvent | null = null;
  let finishEventSeen = false;
  let completeSdkAttempted = false;
  let settled = false;
  let disposing = false;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveDone: ((result: CompleteSdkResult) => void) | null = null;
  let rejectDone: ((err: unknown) => void) | null = null;

  const donePromise = new Promise<CompleteSdkResult>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  function clearWait(): void {
    if (waitTimer != null) {
      clearTimeout(waitTimer);
      waitTimer = null;
    }
  }

  function dispose(): void {
    if (disposing) return;
    disposing = true;
    clearWait();
    options.onDisposed?.();
  }

  async function runComplete(): Promise<void> {
    if (settled || completeSdkAttempted) return;
    if (!code) return;
    completeSdkAttempted = true;
    clearWait();
    try {
      const result = await options.completeSdk({
        code,
        state: options.state,
        architecture: options.architecture,
        sessionEvent: sessionEventSummaryForServer(sessionEvent),
      });
      settled = true;
      dispose();
      resolveDone?.(result);
    } catch (e) {
      settled = true;
      dispose();
      rejectDone?.(e);
    }
  }

  function scheduleCompleteAfterCounterpartWait(): void {
    if (settled || completeSdkAttempted) return;
    if (!code) return;
    if (isEmbeddedSignupFinishEvent(sessionEvent)) {
      void runComplete();
      return;
    }
    clearWait();
    waitTimer = setTimeout(() => {
      waitTimer = null;
      void runComplete();
    }, waitMs);
  }

  return {
    done: donePromise,
    getFinishEventSeen: () => finishEventSeen,
    getCompleteSdkAttempted: () => completeSdkAttempted,
    acceptSessionEvent(event: ParsedEmbeddedSignupSessionEvent): void {
      if (settled) return;
      sessionEvent = event;
      if (isEmbeddedSignupFinishEvent(event)) {
        finishEventSeen = true;
      }
      if (code) {
        scheduleCompleteAfterCounterpartWait();
      }
    },
    acceptAuthCode(nextCode: string): void {
      if (settled) return;
      code = nextCode;
      scheduleCompleteAfterCounterpartWait();
    },
    /** FB.login returned without a code — settle as cancellation/error without complete-sdk. */
    failWithoutCode(error: Error): void {
      if (settled) return;
      settled = true;
      dispose();
      rejectDone?.(error);
    },
    dispose,
  };
}
