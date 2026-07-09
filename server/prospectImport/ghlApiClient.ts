import { eq } from "drizzle-orm";
import { integrations, type Integration } from "@shared/schema";
import { db } from "../../drizzle/db";
import { storage } from "../storage";

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

export async function getValidGhlToken(integration: Integration): Promise<string | null> {
  const isExpired =
    integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) < new Date();
  if (!isExpired && integration.accessToken) return integration.accessToken;

  const clientId = process.env.GHL_CLIENT_ID ?? "";
  const clientSecret = process.env.GHL_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret || !integration.refreshToken) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: integration.refreshToken,
  });
  const resp = await fetch(GHL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });
  const data = (await resp.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!resp.ok || !data.access_token) return null;

  await storage.updateIntegration(integration.id, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? integration.refreshToken,
    tokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
    lastSyncAt: new Date(),
  });
  return data.access_token;
}

export function readGhlLocationId(integration: Integration): string | null {
  const config = (integration.config || {}) as Record<string, unknown>;
  const id = String(config.locationId || "").trim();
  return id || null;
}

export async function searchGhlContacts(params: {
  token: string;
  locationId: string;
  page: number;
  pageLimit: number;
  query?: string;
}): Promise<{ contacts: GhlRawContact[]; total?: number }> {
  const body: Record<string, unknown> = {
    locationId: params.locationId,
    page: params.page,
    pageLimit: params.pageLimit,
  };
  if (params.query?.trim()) body.query = params.query.trim();

  const data = (await ghlFetch(`${GHL_API_BASE}/contacts/search`, params.token, {
    method: "POST",
    body: JSON.stringify(body),
  })) as { contacts?: GhlRawContact[]; total?: number };

  return { contacts: data.contacts ?? [], total: data.total };
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
