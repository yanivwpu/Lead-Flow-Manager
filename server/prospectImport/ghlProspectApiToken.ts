import type { Integration } from "@shared/schema";
import { getAppOrigin } from "../urlOrigins";
import {
  getValidGhlAgencyAccessToken,
  isGhlCompanyScopedIntegration,
  isGhlLocationScopedIntegration,
  readGhlCompanyId,
  readGhlUserType,
  resolveGhlProspectLocationId,
} from "./ghlApiClient";
import {
  getCachedGhlLocationToken,
  setCachedGhlLocationToken,
} from "./ghlLocationTokenCache";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

const GHL_LOCATION_TOKEN_URLS = [
  `${GHL_API_BASE}/oauth/locationToken`,
  `${GHL_API_BASE}/oauth/location-token`,
];

export class GhlProspectTokenError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "GhlProspectTokenError";
    this.code = code;
  }
}

export function logGhlProspectImportTokenDiagnostic(
  event: string,
  data: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      tag: "[GHL-ProspectImport-Token]",
      event,
      at: new Date().toISOString(),
      ...data,
    }),
  );
}

export type GhlProspectApiTokenResult = {
  token: string;
  locationId: string;
  integrationTokenType: string;
  usedTokenType: "Location";
  locationTokenExchangeAttempted: boolean;
  locationTokenExchangeSucceeded: boolean;
  fromCache: boolean;
};

type ExchangeDeps = {
  fetchImpl?: typeof fetch;
};

export async function exchangeGhlLocationAccessToken(params: {
  agencyAccessToken: string;
  companyId: string;
  locationId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const fetchFn = params.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    companyId: params.companyId.trim(),
    locationId: params.locationId.trim(),
  });

  let lastStatus = 0;
  let lastError = "unknown error";

  for (const url of GHL_LOCATION_TOKEN_URLS) {
    const resp = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.agencyAccessToken}`,
        Version: GHL_API_VERSION,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const text = await resp.text().catch(() => "");
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }

    if (resp.ok && typeof data.access_token === "string" && data.access_token.trim()) {
      return {
        accessToken: data.access_token.trim(),
        expiresIn: typeof data.expires_in === "number" ? data.expires_in : 86400,
      };
    }

    lastStatus = resp.status;
    const message =
      typeof data.message === "string"
        ? data.message
        : typeof data.error === "string"
          ? data.error
          : text.substring(0, 400);
    lastError = message || `HTTP ${resp.status}`;

    if (resp.status === 404) continue;
    break;
  }

  throw new GhlProspectTokenError(
    `Could not obtain a Location access token for Prospect Import (HTTP ${lastStatus}): ${lastError}`,
    "location_token_exchange_failed",
  );
}

export async function getGhlProspectApiToken(
  integration: Integration,
  selectedLocationId?: string | null,
  deps?: ExchangeDeps,
): Promise<GhlProspectApiTokenResult> {
  const locationId = resolveGhlProspectLocationId(integration, selectedLocationId);
  if (!locationId) {
    throw new GhlProspectTokenError(
      "GHL token or location unavailable. Select a sub-account location for Company-scoped CRM tokens.",
      "location_unavailable",
    );
  }

  const integrationTokenType =
    readGhlUserType(integration) ||
    (isGhlCompanyScopedIntegration(integration) ? "Company" : "Location");

  logGhlProspectImportTokenDiagnostic("prospect_import_token_resolve_start", {
    integrationId: integration.id,
    integrationTokenType,
    selectedLocationId: locationId,
  });

  if (isGhlLocationScopedIntegration(integration)) {
    const token = await getValidGhlAgencyAccessToken(integration, deps);
    if (!token) {
      throw new GhlProspectTokenError(
        "GHL Location token is unavailable or could not be refreshed.",
        "location_token_unavailable",
      );
    }

    logGhlProspectImportTokenDiagnostic("prospect_import_token_resolve_ok", {
      integrationId: integration.id,
      integrationTokenType,
      selectedLocationId: locationId,
      locationTokenExchangeAttempted: false,
      locationTokenExchangeSucceeded: true,
      usedTokenType: "Location",
      fromCache: false,
    });

    return {
      token,
      locationId,
      integrationTokenType,
      usedTokenType: "Location",
      locationTokenExchangeAttempted: false,
      locationTokenExchangeSucceeded: true,
      fromCache: false,
    };
  }

  if (!isGhlCompanyScopedIntegration(integration)) {
    throw new GhlProspectTokenError(
      "Unsupported GHL integration token type for Prospect Import.",
      "unsupported_token_type",
    );
  }

  const companyId = readGhlCompanyId(integration);
  if (!companyId) {
    throw new GhlProspectTokenError(
      "Company-scoped GHL integration is missing companyId.",
      "company_id_missing",
    );
  }

  const cached = getCachedGhlLocationToken(integration.id, locationId);
  if (cached) {
    logGhlProspectImportTokenDiagnostic("prospect_import_token_resolve_ok", {
      integrationId: integration.id,
      integrationTokenType,
      selectedLocationId: locationId,
      companyId,
      locationTokenExchangeAttempted: false,
      locationTokenExchangeSucceeded: true,
      usedTokenType: "Location",
      fromCache: true,
    });

    return {
      token: cached,
      locationId,
      integrationTokenType,
      usedTokenType: "Location",
      locationTokenExchangeAttempted: false,
      locationTokenExchangeSucceeded: true,
      fromCache: true,
    };
  }

  logGhlProspectImportTokenDiagnostic("prospect_import_location_token_exchange", {
    integrationId: integration.id,
    integrationTokenType,
    selectedLocationId: locationId,
    companyId,
    locationTokenExchangeAttempted: true,
  });

  const agencyToken = await getValidGhlAgencyAccessToken(integration, deps);
  if (!agencyToken) {
    logGhlProspectImportTokenDiagnostic("prospect_import_location_token_exchange_failed", {
      integrationId: integration.id,
      integrationTokenType,
      selectedLocationId: locationId,
      companyId,
      locationTokenExchangeAttempted: true,
      locationTokenExchangeSucceeded: false,
      error: "agency_token_unavailable",
    });
    throw new GhlProspectTokenError(
      "GHL Company token is unavailable or could not be refreshed.",
      "agency_token_unavailable",
    );
  }

  try {
    const exchanged = await exchangeGhlLocationAccessToken({
      agencyAccessToken: agencyToken,
      companyId,
      locationId,
      fetchImpl: deps?.fetchImpl,
    });

    setCachedGhlLocationToken(integration.id, locationId, exchanged.accessToken, exchanged.expiresIn);

    logGhlProspectImportTokenDiagnostic("prospect_import_location_token_exchange_ok", {
      integrationId: integration.id,
      integrationTokenType,
      selectedLocationId: locationId,
      companyId,
      locationTokenExchangeAttempted: true,
      locationTokenExchangeSucceeded: true,
      usedTokenType: "Location",
      expiresIn: exchanged.expiresIn,
      fromCache: false,
    });

    return {
      token: exchanged.accessToken,
      locationId,
      integrationTokenType,
      usedTokenType: "Location",
      locationTokenExchangeAttempted: true,
      locationTokenExchangeSucceeded: true,
      fromCache: false,
    };
  } catch (err) {
    logGhlProspectImportTokenDiagnostic("prospect_import_location_token_exchange_failed", {
      integrationId: integration.id,
      integrationTokenType,
      selectedLocationId: locationId,
      companyId,
      locationTokenExchangeAttempted: true,
      locationTokenExchangeSucceeded: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: err instanceof GhlProspectTokenError ? err.code : "location_token_exchange_failed",
    });
    throw err;
  }
}

export function resolveGhlRefreshRedirectUri(): string {
  return process.env.GHL_REDIRECT_URI || `${getAppOrigin()}/api/ext/callback`;
}
