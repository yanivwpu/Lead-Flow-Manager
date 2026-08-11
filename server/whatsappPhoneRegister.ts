/**
 * Register a verified WhatsApp Cloud API phone number (standard Embedded Signup only).
 * Never logs PIN or access tokens.
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration
 */
import { getMetaGraphApiBase, getMetaGraphVersionSegment } from "./metaGraphVersion";
import { getMetaAccessToken, fetchMetaWhatsAppPhoneNumberGraphSnapshot, fetchWhatsAppPhoneNumberParentWabaId, findMetaPhoneNumberConflict } from "./userMeta";
import { storage } from "./storage";
import { mergeUserMetaOAuthDebug, subscribeAppToWaba } from "./whatsappEmbeddedSignup";
import {
  extractMetaPhoneGraphRegistrationFields,
  isMetaPhoneCloudApiOperational,
  isMetaPhoneCloudApiRegistrationRequired,
  isValidWhatsAppTwoStepPin,
} from "@shared/whatsappPhoneRegistration";
import { classifyMetaWhatsAppPhone, buildMetaWhatsAppPhoneClassificationInput } from "./metaWhatsAppPhoneKind";

export type PhoneRegisterFailureCategory =
  | "invalid_pin_format"
  | "incorrect_pin"
  | "already_registered"
  | "registration_pending"
  | "access_denied"
  | "token_expired"
  | "phone_waba_mismatch"
  | "rate_limited"
  | "meta_transient"
  | "not_required"
  | "coexistence_forbidden"
  | "unauthorized"
  | "unknown";

function sanitizeMetaErr(body: any): {
  code?: number;
  type?: string;
  message?: string;
  subcode?: number;
} | null {
  const err = body?.error;
  if (!err || typeof err !== "object") return null;
  return {
    code: typeof err.code === "number" ? err.code : undefined,
    type: typeof err.type === "string" ? err.type : undefined,
    message: typeof err.message === "string" ? err.message.slice(0, 300) : undefined,
    subcode: typeof err.error_subcode === "number" ? err.error_subcode : undefined,
  };
}

export function classifyWhatsAppPhoneRegisterMetaError(params: {
  httpStatus?: number;
  meta?: { code?: number; type?: string; message?: string; subcode?: number } | null;
}): PhoneRegisterFailureCategory {
  const msg = String(params.meta?.message || "").toLowerCase();
  const code = params.meta?.code;
  const status = params.httpStatus;
  if (code === 133016 || msg.includes("rate") || status === 429) return "rate_limited";
  if (code === 190 || msg.includes("expired") || msg.includes("session has expired")) return "token_expired";
  if (code === 100 && msg.includes("pin")) return "incorrect_pin";
  if (msg.includes("pin") || msg.includes("two-step") || msg.includes("two step")) return "incorrect_pin";
  if (msg.includes("already registered") || msg.includes("already been registered")) return "already_registered";
  if (code === 200 || msg.includes("permission") || status === 403) return "access_denied";
  if (status != null && status >= 500) return "meta_transient";
  if (code === 1 || code === 2) return "meta_transient";
  return "unknown";
}

/** POST /{phone-number-id}/register — PIN never logged. */
export async function registerWhatsAppCloudApiPhoneNumber(params: {
  accessToken: string;
  phoneNumberId: string;
  pin: string;
}): Promise<
  | { ok: true; graphVersion: string }
  | {
      ok: false;
      category: PhoneRegisterFailureCategory;
      httpStatus: number;
      meta: ReturnType<typeof sanitizeMetaErr>;
      graphVersion: string;
    }
> {
  const graphVersion = getMetaGraphVersionSegment();
  const base = getMetaGraphApiBase();
  const phoneNumberId = params.phoneNumberId.trim();
  const url = `${base}/${encodeURIComponent(phoneNumberId)}/register`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      pin: params.pin,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await resp.json().catch(() => ({}))) as any;
  if (resp.ok && !json?.error && (json?.success === true || json?.success === undefined)) {
    // Prefer explicit success:true; some Graph versions return empty/`success` only.
    if (json?.success === true || Object.keys(json || {}).length === 0 || json?.success === undefined) {
      if (!json?.error) return { ok: true, graphVersion };
    }
  }
  if (resp.ok && json?.success === true) {
    return { ok: true, graphVersion };
  }
  const meta = sanitizeMetaErr(json);
  return {
    ok: false,
    category: classifyWhatsAppPhoneRegisterMetaError({ httpStatus: resp.status, meta }),
    httpStatus: resp.status,
    meta,
    graphVersion,
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Short bounded poll until Graph reports Cloud API operational, or timeout. */
export async function pollPhoneGraphUntilOperational(params: {
  accessToken: string;
  phoneNumberId: string;
  attempts?: number;
  delayMs?: number;
}): Promise<{
  operational: boolean;
  snapshot: Awaited<ReturnType<typeof fetchMetaWhatsAppPhoneNumberGraphSnapshot>>;
  attemptsUsed: number;
}> {
  const attempts = params.attempts ?? 5;
  const delayMs = params.delayMs ?? 1200;
  let last = await fetchMetaWhatsAppPhoneNumberGraphSnapshot(params.accessToken, params.phoneNumberId);
  for (let i = 0; i < attempts; i++) {
    const fields = extractMetaPhoneGraphRegistrationFields(
      last.ok ? { data: last.data as Record<string, unknown> } : null,
    );
    if (last.ok && isMetaPhoneCloudApiOperational(fields)) {
      return { operational: true, snapshot: last, attemptsUsed: i + 1 };
    }
    if (i < attempts - 1) {
      await sleep(delayMs);
      last = await fetchMetaWhatsAppPhoneNumberGraphSnapshot(params.accessToken, params.phoneNumberId);
    }
  }
  const fields = extractMetaPhoneGraphRegistrationFields(
    last.ok ? { data: last.data as Record<string, unknown> } : null,
  );
  return {
    operational: last.ok && isMetaPhoneCloudApiOperational(fields),
    snapshot: last,
    attemptsUsed: attempts,
  };
}

export async function registerPhoneForAuthenticatedUser(params: {
  userId: string;
  pin: string;
}): Promise<
  | { success: true; fullyReady: boolean }
  | { success: false; error: string; errorCode: PhoneRegisterFailureCategory; retryable: boolean }
> {
  const { userId, pin } = params;
  if (!isValidWhatsAppTwoStepPin(pin)) {
    return {
      success: false,
      error: "Enter a six-digit PIN (numbers only).",
      errorCode: "invalid_pin_format",
      retryable: true,
    };
  }

  const user = await storage.getUserForSession(userId);
  if (!user) {
    return { success: false, error: "Unauthorized", errorCode: "unauthorized", retryable: false };
  }
  if (user.metaConnectionType === "coexistence") {
    await mergeUserMetaOAuthDebug(userId, {
      phase: "phone_registration_failed",
      ok: false,
      errorCode: "coexistence_forbidden",
      discoveryFailureCategory: "coexistence_forbidden",
    });
    return {
      success: false,
      error: "WhatsApp Business App coexistence numbers use a different registration path.",
      errorCode: "coexistence_forbidden",
      retryable: false,
    };
  }

  const wabaId = (user.metaBusinessAccountId || "").trim();
  const phoneNumberId = (user.metaPhoneNumberId || "").trim();
  if (!wabaId || !phoneNumberId) {
    return {
      success: false,
      error: "WhatsApp Business Account or phone number is not saved. Reconnect with Continue with Meta.",
      errorCode: "unknown",
      retryable: false,
    };
  }

  const conflict = await findMetaPhoneNumberConflict(phoneNumberId, userId);
  if (conflict) {
    return {
      success: false,
      error: "This WhatsApp phone number is already connected to another workspace.",
      errorCode: "phone_waba_mismatch",
      retryable: false,
    };
  }

  const token = await getMetaAccessToken(userId);
  if (!token) {
    return {
      success: false,
      error: "WhatsApp access token is missing or expired. Reconnect with Continue with Meta.",
      errorCode: "token_expired",
      retryable: false,
    };
  }

  const parent = await fetchWhatsAppPhoneNumberParentWabaId(token, phoneNumberId);
  if (parent.ok && parent.wabaId !== wabaId) {
    await mergeUserMetaOAuthDebug(userId, {
      phase: "phone_registration_failed",
      ok: false,
      errorCode: "phone_waba_mismatch",
    });
    return {
      success: false,
      error: "Saved phone number does not belong to the saved WhatsApp Business Account.",
      errorCode: "phone_waba_mismatch",
      retryable: false,
    };
  }

  const preSnap = await fetchMetaWhatsAppPhoneNumberGraphSnapshot(token, phoneNumberId);
  const preFields = extractMetaPhoneGraphRegistrationFields(
    preSnap.ok ? { data: preSnap.data as Record<string, unknown> } : null,
  );
  const phoneKind = classifyMetaWhatsAppPhone(
    buildMetaWhatsAppPhoneClassificationInput(user, preSnap.ok ? { data: preSnap.data } : null),
  );

  if (!isMetaPhoneCloudApiRegistrationRequired(preFields, { coexistence: false, isTestNumber: phoneKind.kind === "test" })) {
    if (isMetaPhoneCloudApiOperational(preFields)) {
      // Refuse re-registration / PIN changes through this onboarding endpoint.
      await storage.updateUser(userId, {
        metaIntegrationStatus: "connected",
        metaLastErrorCode: null,
        metaLastErrorMessage: null,
      });
      await mergeUserMetaOAuthDebug(userId, {
        phase: "phone_registration_complete",
        ok: true,
        note: "already_operational_register_refused",
        phoneGraphSnapshot: {
          fetchedAt: new Date().toISOString(),
          phoneNumberId,
          ...preSnap,
        },
      });
      return {
        success: false,
        error:
          "This WhatsApp number is already registered for Cloud API. PIN changes are not supported through this setup step.",
        errorCode: "already_registered",
        retryable: false,
      };
    }
    return {
      success: false,
      error: "This phone number does not require Cloud API registration right now.",
      errorCode: "not_required",
      retryable: false,
    };
  }

  await mergeUserMetaOAuthDebug(userId, {
    phase: "phone_registration_started",
    ok: true,
    wabaId,
    phoneNumberId,
    graphStatus: preFields.status || null,
    platformType: preFields.platformType || null,
    // never store pin
  });

  const reg = await registerWhatsAppCloudApiPhoneNumber({
    accessToken: token,
    phoneNumberId,
    pin,
  });

  if (!reg.ok) {
    const already = reg.category === "already_registered";
    if (already) {
      // Treat as success path → verify Graph.
    } else {
      await mergeUserMetaOAuthDebug(userId, {
        phase: "phone_registration_failed",
        ok: false,
        errorCode: reg.category,
        discoveryFailureCategory: reg.category,
        httpStatus: reg.httpStatus,
        meta: reg.meta,
        graphVersion: reg.graphVersion,
      });
      await storage.updateUser(userId, {
        metaIntegrationStatus: "needs_phone_registration",
        metaLastErrorCode: reg.category,
        metaLastErrorMessage: (reg.meta?.message || "Phone registration failed. Check your PIN and try again.").slice(
          0,
          500,
        ),
      });
      return {
        success: false,
        error:
          reg.category === "incorrect_pin"
            ? "That PIN was not accepted. Enter the six-digit WhatsApp two-step PIN for this number."
            : reg.category === "rate_limited"
              ? "Too many registration attempts. Wait and try again later."
              : reg.category === "token_expired"
                ? "WhatsApp access expired. Reconnect with Continue with Meta, then register the phone."
                : "Could not register the phone number with Meta. Try again.",
        errorCode: reg.category,
        retryable: reg.category !== "token_expired" && reg.category !== "access_denied",
      };
    }
  }

  await mergeUserMetaOAuthDebug(userId, {
    phase: "phone_registration_pending",
    ok: true,
    note: reg.ok ? "register_accepted" : "already_registered_verify_graph",
  });

  const polled = await pollPhoneGraphUntilOperational({
    accessToken: token,
    phoneNumberId,
  });

  await mergeUserMetaOAuthDebug(userId, {
    phoneGraphSnapshot: {
      fetchedAt: new Date().toISOString(),
      phoneNumberId,
      ...polled.snapshot,
    },
  });

  if (!polled.operational) {
    await storage.updateUser(userId, {
      metaIntegrationStatus: "needs_phone_registration",
      metaLastErrorCode: "registration_pending",
      metaLastErrorMessage:
        "Meta accepted registration, but Cloud API is not fully active yet. Wait a moment, then use Refresh — or try the PIN again if still pending.",
    });
    await mergeUserMetaOAuthDebug(userId, {
      phase: "phone_registration_pending",
      ok: false,
      errorCode: "registration_pending",
      attemptsUsed: polled.attemptsUsed,
    });
    return {
      success: false,
      error:
        "Registration was submitted, but Meta has not marked the number CONNECTED yet. Wait briefly and refresh, or retry with the correct PIN.",
      errorCode: "registration_pending",
      retryable: true,
    };
  }

  await subscribeAppToWaba(wabaId, token).catch(() => false);
  await storage.updateUser(userId, {
    metaConnected: true,
    whatsappProvider: "meta",
    metaConnectionType: user.metaConnectionType === "coexistence" ? "coexistence" : "embedded",
    metaIntegrationStatus: "connected",
    metaLastErrorCode: null,
    metaLastErrorMessage: null,
    metaWebhookLastCheckedAt: new Date(),
  });
  await mergeUserMetaOAuthDebug(userId, {
    phase: "phone_registration_complete",
    ok: true,
    errorCode: null,
    attemptsUsed: polled.attemptsUsed,
  });
  try {
    const { recordPhoneRegistrationCompleted } = await import("./whatsappEmbeddedSignupRolloutMetrics");
    recordPhoneRegistrationCompleted();
  } catch {
    /* metrics optional */
  }

  return { success: true, fullyReady: true };
}
