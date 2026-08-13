/**
 * Architecture v4 Embedded Signup asset resolution.
 *
 * v4 Login for Business configs typically grant only WhatsApp Cloud API scopes
 * (management + messaging) and do NOT grant portfolio-wide Business Manager
 * enumeration permission — so portfolio business listing endpoints fail with Graph error 100 Missing Permission.
 *
 * Prefer Meta session FINISH waba_id / phone_number_id, then validate directly
 * against Graph with the exchanged token (never trust browser IDs alone).
 */
import { getMetaGraphApiBase, getMetaGraphVersionSegment } from "./metaGraphVersion";
import { fetchWhatsAppPhoneNumberParentWabaId } from "./userMeta";
import {
  META_WABA_PHONE_DISCOVERY_FIELD_SETS,
  mapGraphPhoneRowToDiscoveryFields,
} from "./metaWhatsAppPhoneKind";

export type V4AssetErrorCode =
  | "session_assets_missing"
  | "waba_discovery_missing_permission"
  | "waba_access_denied"
  | "phone_not_under_waba"
  | "phone_setup_incomplete"
  | "phone_ambiguous"
  | "discovery_failed";

export type V4ResolvedAssets = {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  wabaName?: string;
};

export type V4AssetResolutionResult =
  | {
      ok: true;
      resolved: V4ResolvedAssets;
      method: "session_waba_and_phone" | "session_waba_single_phone";
      graphVersion: string;
      endpointsUsed: string[];
      debugTokenScopes?: string[];
      debugTokenType?: string | null;
    }
  | {
      ok: false;
      errorCode: V4AssetErrorCode;
      error: string;
      graphVersion: string;
      failedEndpoint?: string;
      endpointsUsed: string[];
      meta?: { code?: number; type?: string; message?: string; subcode?: number } | null;
      debugTokenScopes?: string[];
      debugTokenType?: string | null;
      wabaId?: string | null;
      phoneCount?: number;
    };

export function shouldUseV4DirectAssetValidation(params: {
  architecture: string;
  tokenExchange: "sdk" | "redirect";
}): boolean {
  return params.architecture === "v4" && params.tokenExchange === "sdk";
}

/**
 * Prefer FINISH session assets + direct Graph validation (never /me/businesses).
 * - Standard Embedded Signup architecture v4 + SDK
 * - Coexistence + SDK (architecture label remains v2 by design)
 * Legacy Standard v2 SDK/redirect keeps Business Manager enumeration.
 */
export function shouldUseDirectSessionAssetValidation(params: {
  architecture: string;
  tokenExchange: "sdk" | "redirect";
  flow?: string | null;
}): boolean {
  if (params.tokenExchange !== "sdk") return false;
  if (params.flow === "coexistence") return true;
  return shouldUseV4DirectAssetValidation({
    architecture: params.architecture,
    tokenExchange: params.tokenExchange,
  });
}

export function classifyV4DiscoveryGraphError(params: {
  httpStatus?: number;
  meta?: { code?: number; type?: string; message?: string; subcode?: number } | null;
  context: "waba" | "phones" | "phone_parent" | "businesses";
}): V4AssetErrorCode {
  const msg = String(params.meta?.message || "").toLowerCase();
  const code = params.meta?.code;
  if (
    code === 100 &&
    (msg.includes("missing permission") || msg.includes("permission"))
  ) {
    return params.context === "businesses" || params.context === "waba"
      ? "waba_discovery_missing_permission"
      : "waba_access_denied";
  }
  if (code === 100 || params.httpStatus === 403 || params.httpStatus === 400) {
    return params.context === "waba" ? "waba_access_denied" : "discovery_failed";
  }
  return "discovery_failed";
}

function normalizeMetaId(v: unknown): string {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  return /^\d+$/.test(s) ? s : "";
}

function sanitizeMetaError(body: any): {
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

/**
 * Choose a phone when FINISH returned WABA-only.
 * Exactly one → use it; zero → incomplete; multiple → ambiguous (no fabrication).
 */
export function selectPhoneFromV4WabaListing(phones: Array<{ id: string }>): {
  mode: "single" | "none" | "ambiguous";
  phoneId?: string;
} {
  const ids = phones.map((p) => normalizeMetaId(p.id)).filter(Boolean);
  if (ids.length === 0) return { mode: "none" };
  if (ids.length === 1) return { mode: "single", phoneId: ids[0] };
  return { mode: "ambiguous" };
}

async function safeDebugTokenSummary(accessToken: string): Promise<{
  scopes: string[];
  type: string | null;
  appId: string | null;
  isValid: boolean | null;
}> {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return { scopes: [], type: null, appId: null, isValid: null };
  }
  try {
    const base = getMetaGraphApiBase();
    const url =
      `${base}/debug_token?input_token=${encodeURIComponent(accessToken)}` +
      `&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const json = (await res.json().catch(() => ({}))) as any;
    const data = json?.data ?? {};
    const scopes = Array.isArray(data.scopes)
      ? data.scopes.map((s: unknown) => String(s)).filter(Boolean).slice(0, 40)
      : [];
    return {
      scopes,
      type: typeof data.type === "string" ? data.type : null,
      appId: data.app_id != null ? String(data.app_id) : null,
      isValid: typeof data.is_valid === "boolean" ? data.is_valid : null,
    };
  } catch {
    return { scopes: [], type: null, appId: null, isValid: null };
  }
}

async function fetchWabaNode(
  accessToken: string,
  wabaId: string,
): Promise<
  | { ok: true; id: string; name?: string; endpoint: string }
  | { ok: false; endpoint: string; httpStatus: number; meta: ReturnType<typeof sanitizeMetaError> }
> {
  const base = getMetaGraphApiBase();
  const fields = "id,name";
  const endpoint = `${base}/${encodeURIComponent(wabaId)}?fields=${fields}`;
  const res = await fetch(
    `${endpoint}&access_token=${encodeURIComponent(accessToken)}`,
    { signal: AbortSignal.timeout(12_000) },
  );
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || json?.error) {
    return { ok: false, endpoint, httpStatus: res.status, meta: sanitizeMetaError(json) };
  }
  const id = normalizeMetaId(json?.id);
  if (!id || id !== wabaId) {
    return {
      ok: false,
      endpoint,
      httpStatus: res.status,
      meta: { code: 100, type: "GraphMethodException", message: "WABA id mismatch in Graph response" },
    };
  }
  return {
    ok: true,
    id,
    name: typeof json?.name === "string" ? json.name : undefined,
    endpoint,
  };
}

async function fetchPhonesUnderWaba(
  accessToken: string,
  wabaId: string,
): Promise<
  | {
      ok: true;
      phones: Array<{ id: string; displayPhoneNumber?: string; verifiedName?: string }>;
      endpoint: string;
      fieldsRequested: string;
    }
  | { ok: false; endpoint: string; httpStatus: number; meta: ReturnType<typeof sanitizeMetaError>; fieldsRequested: string }
> {
  const base = getMetaGraphApiBase();
  let lastFail: {
    endpoint: string;
    httpStatus: number;
    meta: ReturnType<typeof sanitizeMetaError>;
    fieldsRequested: string;
  } | null = null;

  for (const fields of META_WABA_PHONE_DISCOVERY_FIELD_SETS) {
    const endpoint = `${base}/${encodeURIComponent(wabaId)}/phone_numbers?fields=${fields}&limit=50`;
    const res = await fetch(
      `${endpoint}&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || json?.error) {
      lastFail = {
        endpoint,
        httpStatus: res.status,
        meta: sanitizeMetaError(json),
        fieldsRequested: fields,
      };
      continue;
    }
    const rows: unknown[] = Array.isArray(json?.data) ? json.data : [];
    const phones = rows
      .map((row) => {
        const mapped = mapGraphPhoneRowToDiscoveryFields(row as Record<string, unknown>);
        if (!mapped.id) return null;
        return {
          id: mapped.id,
          displayPhoneNumber: mapped.displayPhoneNumber,
          verifiedName: mapped.verifiedName,
        };
      })
      .filter((p): p is NonNullable<typeof p> => !!p);
    return { ok: true, phones, endpoint, fieldsRequested: fields };
  }

  return {
    ok: false,
    endpoint: lastFail?.endpoint || `${base}/${wabaId}/phone_numbers`,
    httpStatus: lastFail?.httpStatus ?? 400,
    meta: lastFail?.meta ?? null,
    fieldsRequested: lastFail?.fieldsRequested || META_WABA_PHONE_DISCOVERY_FIELD_SETS[0],
  };
}

/**
 * Validate FINISH session assets with the exchanged v4 token.
 * Never calls portfolio business listing endpoints or other Business Manager enumeration APIs.
 */
export async function resolveV4EmbeddedSignupAssets(params: {
  accessToken: string;
  sessionWabaId?: string | null;
  sessionPhoneNumberId?: string | null;
}): Promise<V4AssetResolutionResult> {
  const graphVersion = getMetaGraphVersionSegment();
  const endpointsUsed: string[] = [];
  const sessionWabaId = normalizeMetaId(params.sessionWabaId);
  const sessionPhoneNumberId = normalizeMetaId(params.sessionPhoneNumberId);

  const dbg = await safeDebugTokenSummary(params.accessToken);
  const debugTokenScopes = dbg.scopes;
  const debugTokenType = dbg.type;

  if (!sessionWabaId && !sessionPhoneNumberId) {
    return {
      ok: false,
      errorCode: "session_assets_missing",
      error:
        "Meta finished signup but did not return a WhatsApp Business Account or phone number ID. Close Facebook windows and try Continue with Meta again.",
      graphVersion,
      endpointsUsed,
      debugTokenScopes,
      debugTokenType,
    };
  }

  // Phone-only (no WABA): resolve parent WABA via phone node, then continue.
  let wabaId = sessionWabaId;
  if (!wabaId && sessionPhoneNumberId) {
    const parent = await fetchWhatsAppPhoneNumberParentWabaId(params.accessToken, sessionPhoneNumberId);
    endpointsUsed.push(`GET /{phone_number_id}?fields=whatsapp_business_account`);
    if (!parent.ok) {
      return {
        ok: false,
        errorCode: "session_assets_missing",
        error:
          "Meta returned a phone number without a WhatsApp Business Account ID, and Graph could not resolve the parent WABA.",
        graphVersion,
        endpointsUsed,
        debugTokenScopes,
        debugTokenType,
      };
    }
    wabaId = parent.wabaId;
  }

  const wabaProbe = await fetchWabaNode(params.accessToken, wabaId!);
  endpointsUsed.push(wabaProbe.ok ? wabaProbe.endpoint : wabaProbe.endpoint);
  if (!wabaProbe.ok) {
    const errorCode = classifyV4DiscoveryGraphError({
      httpStatus: wabaProbe.httpStatus,
      meta: wabaProbe.meta,
      context: "waba",
    });
    return {
      ok: false,
      errorCode: errorCode === "waba_discovery_missing_permission" ? "waba_access_denied" : errorCode,
      error:
        wabaProbe.meta?.message ||
        "Could not access the WhatsApp Business Account returned by Meta Embedded Signup.",
      graphVersion,
      failedEndpoint: wabaProbe.endpoint,
      endpointsUsed,
      meta: wabaProbe.meta,
      debugTokenScopes,
      debugTokenType,
      wabaId,
    };
  }

  const phonesFetch = await fetchPhonesUnderWaba(params.accessToken, wabaId!);
  endpointsUsed.push(phonesFetch.ok ? phonesFetch.endpoint : phonesFetch.endpoint);
  if (!phonesFetch.ok) {
    const errorCode = classifyV4DiscoveryGraphError({
      httpStatus: phonesFetch.httpStatus,
      meta: phonesFetch.meta,
      context: "phones",
    });
    return {
      ok: false,
      errorCode,
      error: phonesFetch.meta?.message || "Could not list phone numbers under the selected WhatsApp Business Account.",
      graphVersion,
      failedEndpoint: phonesFetch.endpoint,
      endpointsUsed,
      meta: phonesFetch.meta,
      debugTokenScopes,
      debugTokenType,
      wabaId,
    };
  }

  let phoneNumberId = sessionPhoneNumberId;
  let method: "session_waba_and_phone" | "session_waba_single_phone" = "session_waba_and_phone";

  if (!phoneNumberId) {
    const pick = selectPhoneFromV4WabaListing(phonesFetch.phones);
    if (pick.mode === "none") {
      return {
        ok: false,
        errorCode: "phone_setup_incomplete",
        error:
          "WhatsApp Business Account was created, but no phone number is available yet. Finish phone setup in Meta Business Manager, then reconnect.",
        graphVersion,
        endpointsUsed,
        debugTokenScopes,
        debugTokenType,
        wabaId,
        phoneCount: 0,
      };
    }
    if (pick.mode === "ambiguous") {
      return {
        ok: false,
        errorCode: "phone_ambiguous",
        error:
          "Multiple phone numbers exist on this WhatsApp Business Account and Meta did not indicate which one was selected. Re-run Embedded Signup and finish phone selection, or remove unused numbers in Meta.",
        graphVersion,
        endpointsUsed,
        debugTokenScopes,
        debugTokenType,
        wabaId,
        phoneCount: phonesFetch.phones.length,
      };
    }
    phoneNumberId = pick.phoneId!;
    method = "session_waba_single_phone";
  }

  const listed = phonesFetch.phones.find((p) => p.id === phoneNumberId);
  if (!listed) {
    // Secondary ownership proof via phone → parent WABA edge.
    const parent = await fetchWhatsAppPhoneNumberParentWabaId(params.accessToken, phoneNumberId);
    endpointsUsed.push(`GET /{phone_number_id}?fields=whatsapp_business_account`);
    if (!parent.ok || parent.wabaId !== wabaId) {
      return {
        ok: false,
        errorCode: "phone_not_under_waba",
        error:
          "The phone number returned by Meta Embedded Signup is not under the selected WhatsApp Business Account.",
        graphVersion,
        endpointsUsed,
        debugTokenScopes,
        debugTokenType,
        wabaId,
        phoneCount: phonesFetch.phones.length,
      };
    }
  } else {
    // Still confirm parent edge when available (non-fatal if Graph omits it).
    const parent = await fetchWhatsAppPhoneNumberParentWabaId(params.accessToken, phoneNumberId);
    endpointsUsed.push(`GET /{phone_number_id}?fields=whatsapp_business_account`);
    if (parent.ok && parent.wabaId !== wabaId) {
      return {
        ok: false,
        errorCode: "phone_not_under_waba",
        error:
          "Graph reports the phone number belongs to a different WhatsApp Business Account than the FINISH session.",
        graphVersion,
        endpointsUsed,
        debugTokenScopes,
        debugTokenType,
        wabaId,
      };
    }
  }

  const phoneMeta =
    listed ||
    phonesFetch.phones.find((p) => p.id === phoneNumberId) ||
    ({ id: phoneNumberId } as { id: string; displayPhoneNumber?: string; verifiedName?: string });

  return {
    ok: true,
    resolved: {
      wabaId: wabaId!,
      phoneNumberId,
      displayPhoneNumber: phoneMeta.displayPhoneNumber,
      verifiedName: phoneMeta.verifiedName,
      wabaName: wabaProbe.name,
    },
    method,
    graphVersion,
    endpointsUsed,
    debugTokenScopes,
    debugTokenType,
  };
}
