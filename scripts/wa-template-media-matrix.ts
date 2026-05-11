/**
 * Dev matrix: production media validation for WhatsApp template URLs (no Graph call).
 *
 * Usage:
 *   WA_MATRIX_IMAGE_URL=https://.../a.jpg \
 *   WA_MATRIX_PDF_URL=https://.../a.pdf \
 *   WA_MATRIX_VIDEO_URL=https://.../a.mp4 \
 *   WA_MATRIX_CAROUSEL_IMAGE_URL=https://.../b.jpg \
 *   npm run wa:template-media-matrix
 */

import "dotenv/config";
import { getBundledFfmpegPath } from "../server/templateVideoTranscode";
import { validateProductionTemplateMediaUrl } from "../server/templateMediaProductionValidator";

async function main() {
  const out: Record<string, unknown> = {
    ffmpegAvailable: !!getBundledFfmpegPath(),
    r2PublicBaseConfigured: !!(process.env.CLOUDFLARE_R2_PUBLIC_URL || "").trim(),
    graphAccepted: "not_called",
    webhookDelivered: "not_observed",
    finalStatus: "preflight_only",
  };

  const cases: Array<{
    key: string;
    envKey: string;
    paramType: "image" | "video" | "document";
    inCarousel: boolean;
  }> = [
    { key: "image_template", envKey: "WA_MATRIX_IMAGE_URL", paramType: "image", inCarousel: false },
    { key: "pdf_template", envKey: "WA_MATRIX_PDF_URL", paramType: "document", inCarousel: false },
    { key: "video_template", envKey: "WA_MATRIX_VIDEO_URL", paramType: "video", inCarousel: false },
    { key: "carousel_card_image", envKey: "WA_MATRIX_CAROUSEL_IMAGE_URL", paramType: "image", inCarousel: true },
  ];

  for (const c of cases) {
    const url = (process.env[c.envKey] || "").trim();
    if (!url) {
      out[c.key] = { skipped: true, hint: `Set ${c.envKey}` };
      continue;
    }
    const v = await validateProductionTemplateMediaUrl({
      url,
      inCarousel: c.inCarousel,
      paramType: c.paramType,
    });
    out[c.key] = v.ok
      ? {
          preflightPassed: true,
          httpStatus: v.httpStatus,
          contentType: v.contentType,
          contentLength: v.contentLength,
        }
      : { preflightPassed: false, errorCode: v.code, detail: v.detail };
  }

  out.text_template = { skipped: true, note: "No media URL for text-only templates" };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
