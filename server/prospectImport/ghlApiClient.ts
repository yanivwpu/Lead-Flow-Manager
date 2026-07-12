import { eq } from "drizzle-orm";
import { integrations, type Integration } from "@shared/schema";
import { readGhlMarketplaceAppIdPrefix } from "@shared/ghlMarketplaceOAuth";
import { db } from "../../drizzle/db";
import { storage } from "../storage";
import { getAppOrigin } from "../urlOrigins";
import { fetchGhlWithRetry } from "./ghlApiRetry";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_TOKEN_URL = `${GHL_API_BASE}/oauth/token`;
const GHL_API_VERSION = "2021-07-28";

export type GhlRawContact = {
  id: string;
  locationId?: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  tags?: string[];
  source?: string;
  dateAdded?: string;
  dateUpdated?: string;
  lastActivity?: string;
  assignedTo?: string;
};

async function ghlFetch(url: string, token: string, init?: RequestInit): Promise<unknown> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_API_VERSION,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`GHL API ${resp.status}: ${body.substring(0, 400)}`);
  }
  return resp.json().catch(() => ({}));
}

export async function getIntegrationById(integrationId: string): Promise<Integration | null> {
  const rows = await db.select().from(integrations).where(eq(integrations.id, integrationId)).limit(1);
  return rows[0] ?? null;
}

export async function getValidGhlAgencyAccessToken(
  integration: Integration,
  deps?: { fetchImpl?: typeof fetch },
): Promise<string | null> {
  const fetchFn = deps?.fetchImpl ?? fetch;
  const isExpired =
    integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) < new Date();
  if (!isExpired && integration.accessToken) return integration.accessToken;

  const clientId = process.env.GHL_CLIENT_ID ?? "";
  const clientSecret = process.env.GHL_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret || !integration.refreshToken) return null;

  const config = (integration.config || {}) as Record<string, unknown>;
  const userType = String(config.userType || "").trim();

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: integration.refreshToken,
  });
  if (userType) params.set("user_type", userType);
  const redirectUri = process.env.GHL_REDIRECT_URI || `${getAppOrigin()}/api/ext/callback`;
  if (redirectUri) params.set("redirect_uri", redirectUri);

  const resp = await fetchFn(GHL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });
  const data = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!resp.ok || !data.access_token) return null;

  await storage.updateIntegration(integration.id, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? integration.refreshToken,
    tokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
    lastSyncAt: new Date(),
  });
  return data.access_token;
}

/** Refresh and return the stored agency/location integration access token (never a derived location token). */
export async function getValidGhlToken(
  integration: Integration,
  deps?: { fetchImpl?: typeof fetch },
): Promise<string | null> {
  return getValidGhlAgencyAccessToken(integration, deps);
}

export function readGhlLocationId(integration: Integration): string | null {
  const config = (integration.config || {}) as Record<string, unknown>;
  const id = String(config.locationId || "").trim();
  return id || null;
}

export function readGhlCompanyId(integration: Integration): string | null {
  const config = (integration.config || {}) as Record<string, unknown>;
  const id = String(config.companyId || "").trim();
  return id || null;
}

export function readGhlUserType(integration: Integration): string | null {
  const config = (integration.config || {}) as Record<string, unknown>;
  const userType = String(config.userType || "").trim();
  return userType || null;
}

/** True when OAuth token is agency/company-scoped (no sub-account locationId on the integration). */
export function isGhlCompanyScopedIntegration(integration: Integration): boolean {
  if (readGhlLocationId(integration)) return false;
  const userType = (readGhlUserType(integration) || "").toLowerCase();
  return userType === "company" || userType === "agency" || Boolean(readGhlCompanyId(integration));
}

/** True when OAuth token is sub-account/location-scoped. */
export function isGhlLocationScopedIntegration(integration: Integration): boolean {
  if (isGhlCompanyScopedIntegration(integration)) return false;
  const userType = (readGhlUserType(integration) || "").toLowerCase();
  return userType === "location" || userType === "sub-account" || Boolean(readGhlLocationId(integration));
}

export function resolveGhlProspectLocationId(
  integration: Integration,
  selectedLocationId?: string | null,
): string | null {
  const override = String(selectedLocationId || "").trim();
  if (override) return override;
  return readGhlLocationId(integration);
}

export type GhlInstalledLocation = {
  locationId: string;
  name: string;
};

function readGhlMarketplaceAppId(): string | null {
  const clientId = String(process.env.GHL_CLIENT_ID || "").trim();
  if (!clientId) return null;
  return readGhlMarketplaceAppIdPrefix(clientId);
}

export async function fetchGhlInstalledLocations(params: {
  token: string;
  companyId: string;
  appId?: string | null;
}): Promise<GhlInstalledLocation[]> {
  const companyId = params.companyId.trim();
  const appId = (params.appId || readGhlMarketplaceAppId() || "").trim();
  if (!companyId || !appId) return [];

  const collected: GhlInstalledLocation[] = [];
  let skip = 0;
  const limit = 100;

  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({
      companyId,
      appId,
      limit: String(limit),
      skip: String(skip),
      isInstalled: "true",
    });
    const data = (await ghlFetch(
      `${GHL_API_BASE}/oauth/installedLocations?${query.toString()}`,
      params.token,
    )) as {
      locations?: Array<Record<string, unknown>>;
    };

    const batch = (data.locations ?? [])
      .map((row) => {
        const locationId = String(row.locationId || row._id || "").trim();
        if (!locationId) return null;
        const name = String(row.name || row.locationName || row.businessName || locationId).trim();
        return { locationId, name: name || locationId };
      })
      .filter((row): row is GhlInstalledLocation => Boolean(row));

    collected.push(...batch);
    if (batch.length < limit) break;
    skip += limit;
  }

  const seen = new Set<string>();
  return collected.filter((row) => {
    if (seen.has(row.locationId)) return false;
    seen.add(row.locationId);
    return true;
  });
}

export async function searchGhlContacts(params: {
  token: string;
  locationId: string;
  page: number;
  pageLimit: number;
  query?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ contacts: GhlRawContact[]; total?: number }> {
  const body: Record<string, unknown> = {
    locationId: params.locationId,
    page: params.page,
    pageLimit: params.pageLimit,
  };
  if (params.query?.trim()) body.query = params.query.trim();

  const { data } = await fetchGhlWithRetry(
    `${GHL_API_BASE}/contacts/search`,
    params.token,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    { fetchImpl: params.fetchImpl },
  );

  const parsed = data as { contacts?: GhlRawContact[]; total?: number };
  return { contacts: parsed.contacts ?? [], total: parsed.total };
}

export async function fetchGhlLocationTags(token: string, locationId: string): Promise<string[]> {
  try {
    const data = (await ghlFetch(`${GHL_API_BASE}/locations/${locationId}/tags`, token)) as {
      tags?: { name?: string }[];
    };
    return (data.tags ?? []).map((t) => String(t.name || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchGhlPipelines(
  token: string,
  locationId: string,
): Promise<{ id: string; name: string; stages: { id: string; name: string }[] }[]> {
  try {
    const data = (await ghlFetch(
      `${GHL_API_BASE}/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
      token,
    )) as { pipelines?: { id: string; name: string; stages?: { id: string; name: string }[] }[] };
    return (data.pipelines ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      stages: p.stages ?? [],
    }));
  } catch {
    return [];
  }
}

export async function fetchGhlLocationUsers(
  token: string,
  locationId: string,
): Promise<{ id: string; name: string; email?: string }[]> {
  try {
    const data = (await ghlFetch(
      `${GHL_API_BASE}/users/?locationId=${encodeURIComponent(locationId)}`,
      token,
    )) as { users?: { id: string; name?: string; firstName?: string; lastName?: string; email?: string }[] };
    return (data.users ?? []).map((u) => ({
      id: u.id,
      name: u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || u.id,
      email: u.email,
    }));
  } catch {
    return [];
  }
}

export function normalizeGhlContactName(c: GhlRawContact): string {
  return (
    c.contactName ||
    c.name ||
    `${c.firstName || ""} ${c.lastName || ""}`.trim() ||
    c.email ||
    c.phone ||
    "Unknown"
  );
}
