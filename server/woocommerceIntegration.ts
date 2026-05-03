/**
 * WooCommerce REST API helpers (store URL + consumer key/secret).
 * Never log credentials or raw response bodies that may contain secrets.
 */

const WC_SYSTEM_STATUS_PATH = "/wp-json/wc/v3/system_status";
const WC_ORDERS_PATH = "/wp-json/wc/v3/orders?per_page=5";

export function normalizeWooCommerceStoreUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let withProto = trimmed;
  if (!/^https?:\/\//i.test(withProto)) {
    withProto = `https://${withProto}`;
  }
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return `${u.protocol}//${u.host}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function basicAuthHeader(consumerKey: string, consumerSecret: string): string {
  const token = Buffer.from(`${consumerKey}:${consumerSecret}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

export async function verifyWooCommerceRestCredentials(
  storeBaseUrl: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<{ ok: true } | { ok: false; status: number }> {
  const url = `${storeBaseUrl}${WC_SYSTEM_STATUS_PATH}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: basicAuthHeader(consumerKey, consumerSecret),
    },
    redirect: "follow",
  });
  if (res.ok) return { ok: true };
  return { ok: false, status: res.status };
}

export type WooSampleOrder = { id: number; status: string; dateCreated: string | null };

export async function fetchWooCommerceSampleOrders(
  storeBaseUrl: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<WooSampleOrder[]> {
  const url = `${storeBaseUrl}${WC_ORDERS_PATH}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: basicAuthHeader(consumerKey, consumerSecret),
    },
    redirect: "follow",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data.map((o: any) => ({
    id: Number(o?.id),
    status: String(o?.status ?? ""),
    dateCreated: o?.date_created != null ? String(o.date_created) : null,
  }));
}
