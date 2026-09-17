/**
 * Approved Marketing Materials — workspace-owned flyers, brochures, images, PDFs.
 * The model may request a server-owned asset id. It must never invent a URL.
 */

import { inspectWebchatImageBuffer, WEBCHAT_IMAGE_MAX_BYTES } from "./webchatImagePolicy";
import { inspectWebchatPdfBuffer, WEBCHAT_PDF_MAX_BYTES } from "./webchatDocumentPolicy";

export const MARKETING_ASSET_LANGUAGES = ["en", "es", "he", "all"] as const;
export type MarketingAssetLanguage = (typeof MARKETING_ASSET_LANGUAGES)[number];

export const MARKETING_ASSET_KINDS = ["image", "document"] as const;
export type MarketingAssetKind = (typeof MARKETING_ASSET_KINDS)[number];

export const MARKETING_ASSET_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MARKETING_ASSET_PDF_MIME = "application/pdf";

export const MARKETING_ASSET_NAME_MAX = 120;
export const MARKETING_ASSET_DESCRIPTION_MAX = 280;
export const MARKETING_ASSET_TOPIC_MAX = 32;
export const MARKETING_ASSET_TOPICS_MAX = 12;

const ASSET_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MarketingAssetCatalogItem = {
  id: string;
  displayName: string;
  description: string | null;
  language: MarketingAssetLanguage;
  topics: string[];
  kind: MarketingAssetKind;
};

export type MarketingAssetPublicView = MarketingAssetCatalogItem & {
  enabled: boolean;
  mimeType: string;
  originalFilename: string;
  size: number;
  createdAt: string;
  updatedAt: string;
};

export type MarketingAssetWrite = {
  displayName: string;
  description: string | null;
  language: MarketingAssetLanguage;
  topics: string[];
  enabled: boolean;
};

export function isMarketingAssetId(value: unknown): value is string {
  return typeof value === "string" && ASSET_ID_RE.test(value.trim());
}

export function normalizeMarketingAssetLanguage(value: unknown): MarketingAssetLanguage | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .split("-")[0];
  if (raw === "en" || raw === "es" || raw === "he" || raw === "all") return raw;
  return null;
}

export function conversationLocaleToAssetLanguage(locale: unknown): Exclude<MarketingAssetLanguage, "all"> {
  const raw = String(locale || "en")
    .trim()
    .toLowerCase()
    .split("-")[0];
  if (raw === "es" || raw === "he") return raw;
  return "en";
}

export function marketingAssetMatchesLocale(
  assetLanguage: string | null | undefined,
  conversationLocale: unknown,
): boolean {
  const asset = normalizeMarketingAssetLanguage(assetLanguage);
  if (!asset) return false;
  if (asset === "all") return true;
  return asset === conversationLocaleToAssetLanguage(conversationLocale);
}

export function sanitizeMarketingTopics(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n]/)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const topic = String(item || "")
      .trim()
      .toLowerCase()
      .slice(0, MARKETING_ASSET_TOPIC_MAX);
    if (!topic || seen.has(topic)) continue;
    seen.add(topic);
    out.push(topic);
    if (out.length >= MARKETING_ASSET_TOPICS_MAX) break;
  }
  return out;
}

export function sanitizeMarketingDisplayName(value: unknown): string {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MARKETING_ASSET_NAME_MAX);
}

export function sanitizeMarketingDescription(value: unknown): string | null {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MARKETING_ASSET_DESCRIPTION_MAX);
  return text || null;
}

export function sanitizeMarketingFilename(original: unknown, mimeType: string): string {
  const ext =
    mimeType === "application/pdf"
      ? ".pdf"
      : mimeType === "image/png"
        ? ".png"
        : mimeType === "image/webp"
          ? ".webp"
          : ".jpg";
  const base = String(original || "file")
    .replace(/\\/g, "/")
    .split("/")
    .pop() || "file";
  const withoutExt = base.replace(/\.[^.]+$/, "");
  const safe = withoutExt
    .replace(/[^\w\u0590-\u05FF\u00C0-\u024F .()-]/g, "_")
    .replace(/_{2,}/g, "_")
    .trim()
    .slice(0, 80);
  return `${safe || "file"}${ext}`;
}

export function parseMarketingAssetWrite(raw: unknown):
  | { ok: true; data: MarketingAssetWrite }
  | { ok: false; error: string } {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const displayName = sanitizeMarketingDisplayName(input.displayName ?? input.name);
  if (!displayName) return { ok: false, error: "Display name is required" };
  const language = normalizeMarketingAssetLanguage(input.language) || "all";
  const enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  return {
    ok: true,
    data: {
      displayName,
      description: sanitizeMarketingDescription(input.description),
      language,
      topics: sanitizeMarketingTopics(input.topics ?? input.tags),
      enabled,
    },
  };
}

export function inspectMarketingAssetBuffer(
  buf: Uint8Array,
  declaredMime?: string | null,
):
  | { ok: true; mime: string; kind: MarketingAssetKind; maxBytes: number }
  | { ok: false; reason: string; maxBytes?: number } {
  const declared = String(declaredMime || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (declared === "application/pdf" || sniffLooksPdf(buf)) {
    const pdf = inspectWebchatPdfBuffer(buf, declaredMime);
    if (!pdf.ok) {
      return {
        ok: false,
        reason: pdf.reason,
        maxBytes: pdf.reason === "too_large" ? WEBCHAT_PDF_MAX_BYTES : undefined,
      };
    }
    return { ok: true, mime: pdf.mime, kind: "document", maxBytes: WEBCHAT_PDF_MAX_BYTES };
  }
  const image = inspectWebchatImageBuffer(buf, declaredMime);
  if (!image.ok) {
    return {
      ok: false,
      reason: image.reason,
      maxBytes: image.reason === "too_large" ? WEBCHAT_IMAGE_MAX_BYTES : undefined,
    };
  }
  return { ok: true, mime: image.mime, kind: "image", maxBytes: WEBCHAT_IMAGE_MAX_BYTES };
}

function sniffLooksPdf(buf: Uint8Array): boolean {
  return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

export function toMarketingAssetCatalogItem(input: {
  id: string;
  displayName: string;
  description?: string | null;
  language?: string | null;
  topics?: unknown;
  kind?: string | null;
}): MarketingAssetCatalogItem | null {
  if (!isMarketingAssetId(input.id)) return null;
  const displayName = sanitizeMarketingDisplayName(input.displayName);
  if (!displayName) return null;
  const language = normalizeMarketingAssetLanguage(input.language) || "all";
  const kind = input.kind === "document" ? "document" : "image";
  return {
    id: input.id,
    displayName,
    description: sanitizeMarketingDescription(input.description),
    language,
    topics: sanitizeMarketingTopics(input.topics),
    kind,
  };
}

export function buildMarketingMaterialsPromptBlock(items: MarketingAssetCatalogItem[]): string {
  if (!items.length) {
    return `APPROVED MARKETING MATERIALS: none enabled for this visitor language.
- Do not invent a flyer, brochure, PDF, image, file, or attachment URL.
- If the visitor asks for a file, answer in text only.`;
  }
  const lines = items.map((item) => {
    const topics = item.topics.length ? item.topics.join(", ") : "none";
    const desc = item.description || "none";
    return `- id=${item.id} name="${item.displayName}" kind=${item.kind} language=${item.language} topics=${topics} description="${desc}"`;
  });
  return `APPROVED MARKETING MATERIALS (server-owned ids only — never invent files or URLs):
${lines.join("\n")}
- If the visitor asks for a matching flyer, brochure, PDF, or image, set sendApprovedAssetId to that exact id.
- Never invent an id, never type a media URL, and never substitute a different file.
- If nothing matches, omit sendApprovedAssetId and answer in text only.`;
}

export function parseSendApprovedAssetId(
  raw: unknown,
  catalogIds: ReadonlySet<string>,
): string | null {
  if (raw == null || raw === false) return null;
  const value = String(raw).trim();
  if (!value || value === "null" || value === "undefined" || value === "none") return null;
  if (!isMarketingAssetId(value)) return null;
  if (!catalogIds.has(value)) return null;
  return value;
}

const MEDIA_URL_RE = /https?:\/\/[^\s)]+/gi;
const MEDIA_PATH_HINT =
  /\.(?:jpg|jpeg|png|webp|pdf|gif|svg|mp4|mov)(?:\?|#|$)|\/(?:media|objects|uploads|files)\//i;

export function stripInventedMarketingMediaUrls(
  text: string,
  allowedUrls: ReadonlySet<string> = new Set(),
): string {
  const allowed = new Set(
    [...allowedUrls].map((u) => u.trim().toLowerCase()).filter(Boolean),
  );
  return String(text || "").replace(MEDIA_URL_RE, (found) => {
    const normalized = found.replace(/[.,;]+$/, "").trim();
    if (allowed.has(normalized.toLowerCase())) return found;
    if (MEDIA_PATH_HINT.test(normalized) || /cdn\.|r2\.|s3\.|storage\./i.test(normalized)) {
      return "";
    }
    return found;
  }).replace(/[ \t]{2,}/g, " ").trim();
}

export function extractEmbeddedApprovedAssetId(text: string): string | null {
  const match = String(text || "").match(
    /\{\s*"action"\s*:\s*"send_approved_asset"\s*,\s*"assetId"\s*:\s*"([0-9a-f-]{36})"\s*\}/i,
  );
  return match?.[1] && isMarketingAssetId(match[1]) ? match[1] : null;
}

export function stripApprovedAssetActionMarkup(text: string): string {
  return String(text || "")
    .replace(/\{\s*"action"\s*:\s*"send_approved_asset"[\s\S]*?\}/gi, "")
    .replace(/sendApprovedAssetId\s*[:=]\s*[0-9a-f-]{36}/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function marketingAssetUploadErrorMessage(reason: string, maxBytes?: number): string {
  if (reason === "too_large") {
    const mb = maxBytes ? Math.round(maxBytes / (1024 * 1024)) : 16;
    return `File is too large. Maximum size is ${mb} MB.`;
  }
  if (reason === "empty") return "No file provided";
  if (reason === "mismatch") return "File type does not match the uploaded contents.";
  return "Only JPG, PNG, WebP, and PDF files are allowed.";
}
