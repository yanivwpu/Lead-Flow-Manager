const DEFAULT_APP_URL = "https://app.whachatcrm.com";
const DEFAULT_MARKETING_URL = "https://www.whachatcrm.com";

function normalizeOrigin(input: string | undefined, fallback: string): string {
  const raw = (input || "").trim().replace(/\/+$/, "");
  if (!raw) return fallback;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    return fallback;
  }
}

export function getAppOrigin(): string {
  return normalizeOrigin(process.env.APP_URL, DEFAULT_APP_URL);
}

export function getMarketingOrigin(): string {
  return normalizeOrigin(process.env.MARKETING_URL, DEFAULT_MARKETING_URL);
}

export function getRequestOrigin(req: { protocol?: string; get?: (h: string) => string | undefined }): string {
  const proto = req.protocol || "https";
  const host = req.get?.("host") || "";
  if (!host) return getAppOrigin();
  return normalizeOrigin(`${proto}://${host}`, getAppOrigin());
}
