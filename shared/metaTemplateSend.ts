/**
 * Meta WhatsApp Cloud API — template send helpers (sync with Graph message_templates shape).
 */

export type TemplateRowForMetaSend = {
  bodyText: string | null | undefined;
  headerType: string | null | undefined;
  headerContent: string | null | undefined;
  buttons: unknown;
  templateType: string | null | undefined;
  carouselCards: unknown;
  category: string | null | undefined;
};

/** Normalize keys so "{{1}}", "1", "{1}" resolve consistently */
export function normalizeTemplateVariableMap(
  raw: Record<string, string> | undefined | null
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const trimmed = (v ?? "") as string;
    const digits = k.replace(/\D/g, "");
    if (!digits) continue;
    const canonical = `{{${digits}}}`;
    out[canonical] = trimmed;
  }
  return out;
}

export function extractSortedPlaceholders(text: string | null | undefined): string[] {
  if (!text) return [];
  const m = text.match(/\{\{\d+\}\}/g) || [];
  const uniq = Array.from(new Set(m));
  uniq.sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return na - nb;
  });
  return uniq;
}

function headerNeedsUnsupportedDynamicMedia(headerType: string | null | undefined, headerContent: string | null | undefined): boolean {
  const ht = (headerType || "").toLowerCase();
  if (!["image", "video", "document"].includes(ht)) return false;
  const hc = headerContent || "";
  return /\{\{/.test(hc);
}

/**
 * Build `components` for POST /{phone-number-id}/messages type:template (WhatsApp Cloud API).
 * Order: header → body → button(s), matching Meta’s approved template structure.
 */
export function buildMetaCloudTemplateSendComponents(
  template: TemplateRowForMetaSend,
  variableValues: Record<string, string>
): { components?: Record<string, unknown>[]; error?: string } {
  const vv = normalizeTemplateVariableMap(variableValues);

  if (headerNeedsUnsupportedDynamicMedia(template.headerType, template.headerContent)) {
    return {
      error:
        "This template uses a dynamic media header (image/video/document variables). Sending it requires the full Templates flow with media URLs.",
    };
  }

  const components: Record<string, unknown>[] = [];

  const ht = (template.headerType || "").toLowerCase();
  if (ht === "text" && template.headerContent) {
    const headerPh = extractSortedPlaceholders(template.headerContent);
    if (headerPh.length) {
      components.push({
        type: "header",
        parameters: headerPh.map((ph) => ({
          type: "text",
          text: vv[ph] ?? "",
        })),
      });
    }
  }

  const bodyPh = extractSortedPlaceholders(template.bodyText);
  if (bodyPh.length) {
    components.push({
      type: "body",
      parameters: bodyPh.map((ph) => ({
        type: "text",
        text: vv[ph] ?? "",
      })),
    });
  }

  const buttons = template.buttons;
  if (Array.isArray(buttons)) {
    buttons.forEach((btn: Record<string, unknown>, index: number) => {
      const btnType = String(btn?.type || "").toUpperCase();
      if (btnType !== "URL") return;
      const url = String(btn?.url || "");
      const urlPh = extractSortedPlaceholders(url);
      if (!urlPh.length) return;
      components.push({
        type: "button",
        sub_type: "url",
        index: String(index),
        parameters: urlPh.map((ph) => ({
          type: "text",
          text: vv[ph] ?? "",
        })),
      });
    });
  }

  return { components: components.length ? components : undefined };
}

/** Input shape matches `UnifiedInbox.tsx` template picker (`bodyText`, `headerType`, …). */
export type InboxTemplateSendBlockInput = TemplateRowForMetaSend;

function buttonsHaveDynamicUrlPlaceholder(buttons: unknown): boolean {
  if (!Array.isArray(buttons)) return false;
  return buttons.some((b) => /\{\{\d+\}\}/.test(String((b as { url?: string })?.url || "")));
}

/**
 * Inbox picker: block templates we cannot send reliably from the compact UI
 * (avoids Meta #132012 / cryptic parameter errors). Simple text templates like `hello_world` stay allowed.
 */
export function getInboxTemplateSendBlockReason(
  template: InboxTemplateSendBlockInput
): { blocked: boolean; reason?: string } {
  const tt = (template.templateType || "").toLowerCase();
  if (tt === "carousel") {
    return {
      blocked: true,
      reason:
        "This template is a carousel and can’t be sent from the inbox yet. Use Templates → Send Template.",
    };
  }
  if (Array.isArray(template.carouselCards) && template.carouselCards.length > 0) {
    return {
      blocked: true,
      reason:
        "This template uses carousel cards and can’t be sent from the inbox yet. Use Templates → Send Template.",
    };
  }
  const cat = (template.category || "").toLowerCase();
  if (cat === "authentication") {
    return {
      blocked: true,
      reason:
        "Authentication (OTP) templates can’t be sent from the inbox yet. Use the Templates page.",
    };
  }
  if (headerNeedsUnsupportedDynamicMedia(template.headerType, template.headerContent)) {
    return {
      blocked: true,
      reason:
        "This template needs a dynamic image, video, or document header and can’t be sent from the inbox yet. Use the Templates page.",
    };
  }
  const ht = (template.headerType || "").toLowerCase();
  if (ht === "text" && extractSortedPlaceholders(template.headerContent).length > 0) {
    return {
      blocked: true,
      reason:
        "This template has header text variables and can’t be sent from the inbox yet. Use the Templates page.",
    };
  }
  if (buttonsHaveDynamicUrlPlaceholder(template.buttons)) {
    return {
      blocked: true,
      reason:
        "This template has URL button variables and can’t be sent from the inbox yet. Use the Templates page.",
    };
  }
  return { blocked: false };
}
