/**
 * Meta WhatsApp Cloud API — template send helpers (sync with Graph message_templates shape).
 */

export type TemplateRowForMetaSend = {
  /** WhatsApp template name from Meta (e.g. `hello_world`, `jaspers_market_media_carousel_v1`) */
  name?: string | null;
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

const CAROUSEL_NAME_RE = /carousel|media_carousel|_carousel_|jaspers_market_media/i;

function logInboxGuardBlocked(template: InboxTemplateSendBlockInput, reason: string): void {
  try {
    console.warn(
      `[WA_INBOX_TEMPLATE_GUARD] ${JSON.stringify({ blocked: true, reason, template })}`
    );
  } catch {
    /* ignore */
  }
}

/**
 * Parse Meta Graph `message_templates` payload into DB fields (carousel detection, templateType).
 * Handles case-insensitive component `type` and CAROUSEL / nested `cards`.
 */
export function parseMetaGraphTemplateForLibrary(t: {
  name?: string;
  components?: Array<Record<string, unknown>>;
}): {
  templateType: "text" | "media" | "carousel";
  carouselCards: unknown[];
  bodyText: string;
  headerType: string | null;
  headerContent: string | null;
  footerText: string | null;
  buttons: unknown[];
  variables: string[];
  componentTypesUpper: string[];
} {
  let bodyText = "";
  let headerType: string | null = null;
  let headerContent: string | null = null;
  let footerText: string | null = null;
  let buttons: unknown[] = [];
  const variables: string[] = [];
  let carouselCards: unknown[] = [];
  let templateType: "text" | "media" | "carousel" = "text";
  const componentTypesUpper: string[] = [];

  for (const comp of t.components || []) {
    const ctype = String(comp.type ?? "").toUpperCase();
    componentTypesUpper.push(ctype);

    if (ctype === "CAROUSEL" || (Array.isArray(comp.cards) && (comp.cards as unknown[]).length > 0)) {
      templateType = "carousel";
      if (Array.isArray(comp.cards)) carouselCards = comp.cards;
    }

    if (ctype === "BODY") {
      bodyText = String(comp.text ?? "");
      const vars = bodyText.match(/\{\{\d+\}\}/g) || [];
      vars.forEach((v: string) => {
        if (!variables.includes(v)) variables.push(v);
      });
    } else if (ctype === "HEADER") {
      headerType = String(comp.format ?? "").toLowerCase() || null;
      if (String(comp.format ?? "").toUpperCase() === "TEXT") {
        headerContent = comp.text != null ? String(comp.text) : null;
        const hv = (headerContent || "").match(/\{\{\d+\}\}/g) || [];
        hv.forEach((v: string) => {
          if (!variables.includes(v)) variables.push(v);
        });
      } else if (
        (comp as { example?: { header_handle?: string[] } }).example?.header_handle?.[0]
      ) {
        headerContent = (comp as { example: { header_handle: string[] } }).example.header_handle[0];
      }
    } else if (ctype === "FOOTER") {
      footerText = comp.text != null ? String(comp.text) : null;
    } else if (ctype === "BUTTONS") {
      buttons = Array.isArray(comp.buttons) ? comp.buttons : [];
      for (const b of buttons as Array<{ url?: string }>) {
        const url = String(b?.url || "");
        const bv = url.match(/\{\{\d+\}\}/g) || [];
        bv.forEach((v: string) => {
          if (!variables.includes(v)) variables.push(v);
        });
      }
    }
  }

  if (templateType !== "carousel") {
    const hf = (headerType || "").toLowerCase();
    if (["image", "video", "document"].includes(hf)) {
      templateType = "media";
    }
  }

  const nm = String(t.name ?? "").toLowerCase();
  if (templateType === "text" && CAROUSEL_NAME_RE.test(nm)) {
    templateType = "carousel";
  }

  variables.sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return na - nb;
  });

  return {
    templateType,
    carouselCards,
    bodyText,
    headerType,
    headerContent,
    footerText,
    buttons,
    variables,
    componentTypesUpper,
  };
}

/**
 * Inbox picker: only **body-only** templates (like `hello_world`): no header/media row, no buttons,
 * not carousel/media/auth. Prevents Meta `#132012` from unsupported component payloads.
 */
export function getInboxTemplateSendBlockReason(
  template: InboxTemplateSendBlockInput
): { blocked: boolean; reason?: string } {
  const genericCarousel =
    "This template uses carousel/media components and can't be sent from inbox yet.";

  const nm = String(template.name ?? "").toLowerCase();
  if (CAROUSEL_NAME_RE.test(nm)) {
    logInboxGuardBlocked(template, genericCarousel);
    return { blocked: true, reason: genericCarousel };
  }

  const tt = (template.templateType || "").toLowerCase();
  if (tt === "carousel" || tt === "media") {
    logInboxGuardBlocked(template, genericCarousel);
    return { blocked: true, reason: genericCarousel };
  }

  if (Array.isArray(template.carouselCards) && template.carouselCards.length > 0) {
    logInboxGuardBlocked(template, genericCarousel);
    return { blocked: true, reason: genericCarousel };
  }

  const cat = (template.category || "").toLowerCase();
  if (cat === "authentication") {
    const reason =
      "Authentication (OTP) templates can't be sent from the inbox yet. Use the Templates page.";
    logInboxGuardBlocked(template, reason);
    return { blocked: true, reason };
  }

  const hasHeader = !!(template.headerType && String(template.headerType).trim());
  if (hasHeader || headerNeedsUnsupportedDynamicMedia(template.headerType, template.headerContent)) {
    logInboxGuardBlocked(template, genericCarousel);
    return { blocked: true, reason: genericCarousel };
  }

  if (Array.isArray(template.buttons) && template.buttons.length > 0) {
    logInboxGuardBlocked(template, genericCarousel);
    return { blocked: true, reason: genericCarousel };
  }

  return { blocked: false };
}
