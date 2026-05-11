import { hostLooksLikeTransientMetaCdn } from "./templateMediaNormalization";

/**
 * Saved template defaults must be stable public URLs (R2 / app uploads) — not Meta CDN,
 * localhost, signed URLs, or authenticated media proxies.
 */
export function isPersistableWhatsAppTemplateDefaultUrl(urlStr: string): boolean {
  const u = urlStr.trim();
  if (!/^https:\/\//i.test(u)) return false;
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase();
    if (hostLooksLikeTransientMetaCdn(host)) return false;
    if (host === "localhost" || host.startsWith("127.")) return false;
    const path = parsed.pathname.toLowerCase();
    const search = parsed.search.toLowerCase();
    if (path.includes("/api/media/proxy")) return false;
    if (search.includes("x-amz-credential=") || search.includes("x-amz-signature=")) return false;

    if (host.endsWith(".r2.dev")) return true;
    const r2Base = (process.env.CLOUDFLARE_R2_PUBLIC_URL || "").replace(/\/$/, "");
    if (r2Base && u.startsWith(r2Base)) return true;
    if (path.includes("/objects/uploads/")) return true;
    const app = (process.env.APP_URL || "").replace(/\/$/, "");
    if (app && u.startsWith(`${app}/uploads/`)) return true;
    return false;
  } catch {
    return false;
  }
}
