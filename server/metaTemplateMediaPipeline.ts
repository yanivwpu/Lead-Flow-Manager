import type { TemplateRowForMetaSend } from "@shared/metaTemplateSend";
import { inferMetaTemplateShape } from "@shared/metaTemplateSend";
import { normalizeTemplatePayloadMediaUrls } from "./templateMediaNormalization";
import {
  enumerateTemplateHttpsMediaLinks,
  validateProductionTemplateMediaUrl,
} from "./templateMediaProductionValidator";
import { WA_TEMPLATE_MEDIA_NEEDS_CONVERSION_MESSAGE } from "./waTemplateMediaUserMessages";

/**
 * Normalize + production-validate all HTTPS media links in Meta template `components`
 * before calling Graph. Mutates `components` in place (same as normalize-only).
 */
export async function prepareMetaTemplateComponentsForGraph(opts: {
  userId: string;
  templateName: string;
  components: Record<string, unknown>[] | undefined;
  templateRow: Pick<
    TemplateRowForMetaSend,
    "templateType" | "carouselCards" | "headerType" | "headerContent" | "buttons"
  >;
}): Promise<
  | { ok: true; components: Record<string, unknown>[] | undefined; urlMap: Record<string, string> }
  | { ok: false; errorCode: string; errorMessage: string }
> {
  const shape = inferMetaTemplateShape(opts.templateRow as TemplateRowForMetaSend);
  const carouselMode = shape === "carousel";

  const norm = await normalizeTemplatePayloadMediaUrls({
    userId: opts.userId,
    components: opts.components,
    carouselMode,
    templateName: opts.templateName,
  });
  if (!norm.ok) {
    return {
      ok: false,
      errorCode: norm.errorCode,
      errorMessage: WA_TEMPLATE_MEDIA_NEEDS_CONVERSION_MESSAGE,
    };
  }

  const links = enumerateTemplateHttpsMediaLinks(opts.components);
  for (const ctx of links) {
    const v = await validateProductionTemplateMediaUrl(ctx);
    if (!v.ok) {
      console.error(
        `[META_TEMPLATE_MEDIA_PIPELINE] ${JSON.stringify({
          templateName: opts.templateName,
          phase: "validate_failed",
          code: v.code,
          detail: v.detail,
        })}`
      );
      return { ok: false, errorCode: v.code, errorMessage: WA_TEMPLATE_MEDIA_NEEDS_CONVERSION_MESSAGE };
    }
  }

  return { ok: true, components: opts.components, urlMap: norm.urlMap };
}
