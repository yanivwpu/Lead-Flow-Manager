/**
 * HubSpot CRM API (private app bearer token).
 * Never log tokens or Authorization headers.
 */

const HUBSPOT_API = "https://api.hubapi.com";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
  };
}

/** True if the token can read contacts (valid private app with CRM scope). */
export async function hubspotValidatePrivateAppToken(token: string): Promise<boolean> {
  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts?limit=1`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  return res.ok;
}

export async function hubspotFetchContactPropertyNames(token: string): Promise<Set<string>> {
  const res = await fetch(`${HUBSPOT_API}/crm/v3/properties/contacts`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  if (!res.ok) return new Set();
  const data = (await res.json().catch(() => ({}))) as { results?: { name?: string }[] };
  const names = new Set<string>();
  for (const r of data.results || []) {
    if (typeof r.name === "string" && r.name) names.add(r.name);
  }
  return names;
}

export async function hubspotSearchContactByEmail(
  token: string,
  email: string
): Promise<string | undefined> {
  const value = email.trim().toLowerCase();
  if (!value) return undefined;
  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value }] }],
      properties: ["email"],
      limit: 1,
    }),
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { results?: { id?: string }[] };
  const id = data.results?.[0]?.id;
  return typeof id === "string" ? id : undefined;
}

export async function hubspotSearchContactByPhone(
  token: string,
  phone: string
): Promise<string | undefined> {
  const value = phone.trim();
  if (!value) return undefined;
  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value }] }],
      properties: ["phone"],
      limit: 1,
    }),
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { results?: { id?: string }[] };
  const id = data.results?.[0]?.id;
  return typeof id === "string" ? id : undefined;
}

export async function hubspotCreateContact(
  token: string,
  properties: Record<string, string>
): Promise<{ ok: boolean; status: number; id?: string; message?: string }> {
  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ properties }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    return { ok: false, status: res.status, message: data.message || "Create failed" };
  }
  return { ok: true, status: res.status, id: data.id };
}

export async function hubspotPatchContact(
  token: string,
  contactId: string,
  properties: Record<string, string>
): Promise<{ ok: boolean; status: number; message?: string }> {
  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ properties }),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    return { ok: false, status: res.status, message: data.message || "Update failed" };
  }
  return { ok: true, status: res.status };
}
