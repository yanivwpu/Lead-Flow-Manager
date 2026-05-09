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

function mergeSortedUniquePlaceholders(lists: string[][]): string[] {
  const set = new Set<string>();
  for (const list of lists) {
    for (const p of list) set.add(p);
  }
  return Array.from(set).sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return na - nb;
  });
}

/**
 * Replace `{{n}}` placeholders using the same normalization rules as Meta send (`normalizeTemplateVariableMap`).
 * Used for CRM display copy and client-side preview.
 */
export function substituteTemplateVariablesForDisplay(
  text: string | null | undefined,
  variableValues: Record<string, string>
): string {
  const vv = normalizeTemplateVariableMap(variableValues);
  if (!text) return "";
  let out = text;
  for (const [key, val] of Object.entries(vv)) {
    if (!key) continue;
    out = out.split(key).join(val ?? "");
  }
  return out.trim();
}

/**
 * Every `{{n}}` referenced from synced template components (body, text/media header, URL buttons, carousel cards).
 * Matches server-side `buildMetaLibraryTemplateSendComponents` requirements.
 */
export function collectRequiredLibraryTemplatePlaceholders(template: TemplateRowForMetaSend): string[] {
  const parts: string[][] = [];

  parts.push(extractSortedPlaceholders(template.bodyText));

  const ht = (template.headerType || "").toLowerCase();
  const hc = template.headerContent;
  if (ht === "text" || ["image", "video", "document"].includes(ht)) {
    parts.push(extractSortedPlaceholders(hc));
  }

  const buttons = template.buttons;
  if (Array.isArray(buttons)) {
    for (const btn of buttons as Array<{ url?: string }>) {
      parts.push(extractSortedPlaceholders(String(btn?.url || "")));
    }
  }

  const tt = (template.templateType || "").toLowerCase();
  const cardsRaw = template.carouselCards;
  const hasCarousel =
    tt === "carousel" || (Array.isArray(cardsRaw) && cardsRaw.length > 0);
  if (hasCarousel && Array.isArray(cardsRaw)) {
    for (const card of cardsRaw) {
      const c = card as { components?: unknown[] };
      const comps = Array.isArray(c.components) ? c.components : [];
      for (const comp of comps as Record<string, unknown>[]) {
        const ctype = String(comp.type || "").toUpperCase();
        if (ctype === "BODY") {
          parts.push(extractSortedPlaceholders(String(comp.text || "")));
        }
        if (ctype === "BUTTONS" && Array.isArray(comp.buttons)) {
          for (const b of comp.buttons as Array<{ url?: string }>) {
            parts.push(extractSortedPlaceholders(String(b?.url || "")));
          }
        }
        if (ctype === "HEADER") {
          const txt = comp.text != null ? String(comp.text) : "";
          parts.push(extractSortedPlaceholders(txt));
        }
      }
    }
  }

  return mergeSortedUniquePlaceholders(parts);
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
        "This template includes image, video, or document content in the header. Open Message Templates, add the media link in your variables, and send from there.",
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

/** Meta library send — shapes used for logging only (UI-free). */
export type MetaTemplateSendShape =
  | "simple_text"
  | "text_header"
  | "media_header"
  | "buttons"
  | "carousel"
  | "mixed";

export function inferMetaTemplateShape(template: TemplateRowForMetaSend): MetaTemplateSendShape {
  const tt = (template.templateType || "").toLowerCase();
  if (tt === "carousel" || (Array.isArray(template.carouselCards) && template.carouselCards.length > 0)) {
    return "carousel";
  }
  const ht = (template.headerType || "").toLowerCase();
  if (["image", "video", "document"].includes(ht)) return "media_header";
  if (ht === "text" && (template.headerContent || "").trim()) return "text_header";
  if (Array.isArray(template.buttons) && template.buttons.length > 0) return "buttons";
  return "simple_text";
}

function pushUrlButtonComponents(
  buttons: unknown[],
  vv: Record<string, string>,
  components: Record<string, unknown>[]
): { error?: string } {
  for (let index = 0; index < buttons.length; index++) {
    const btn = buttons[index] as Record<string, unknown>;
    const btnType = String(btn?.type || "").toUpperCase();
    if (btnType !== "URL") continue;
    const url = String(btn?.url || "");
    const urlPh = extractSortedPlaceholders(url);
    for (const ph of urlPh) {
      if (!(vv[ph] ?? "").trim()) {
        return { error: `Missing URL button variable ${ph}` };
      }
    }
    if (urlPh.length) {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(index),
        parameters: urlPh.map((ph) => ({
          type: "text",
          text: vv[ph] ?? "",
        })),
      });
    }
  }
  return {};
}

function resolveStaticOrVariableMediaUrl(
  headerContent: string | null | undefined,
  vv: Record<string, string>
): { url?: string; error?: string } {
  const hc = (headerContent || "").trim();
  if (!hc)
    return {
      error:
        "This template requires a media header before it can be sent. If variables appear below, add your image, video, or file link there.",
    };
  const ph = extractSortedPlaceholders(hc);
  if (ph.length) {
    const u = (vv[ph[0]] ?? "").trim();
    if (!u)
      return {
        error: `This WhatsApp template includes header media. Enter a valid https link for ${ph[0]} before sending.`,
      };
    if (!/^https?:\/\//i.test(u))
      return {
        error: `Header media must use a secure https link. Update ${ph[0]} so it starts with https://`,
      };
    return { url: u };
  }
  if (/^https?:\/\//i.test(hc)) return { url: hc };
  return {
    error:
      "This WhatsApp template includes image, video, or document content. Add the required https media link in your variables before sending.",
  };
}

function mapCarouselCardComponents(
  cardRaw: unknown,
  cardIndex: number,
  vvStr: Record<string, string>
): { components: Record<string, unknown>[]; error?: string } {
  const card = cardRaw as Record<string, unknown>;
  const rawList = Array.isArray(card.components)
    ? (card.components as Record<string, unknown>[])
    : [];
  const out: Record<string, unknown>[] = [];

  /** Preview enrichment from UI / sync */
  const previewUrl =
    typeof card.headerUrl === "string" && /^https?:\/\//i.test(card.headerUrl) ? card.headerUrl : null;

  for (let ci = 0; ci < rawList.length; ci++) {
    const c = rawList[ci];
    const ctype = String(c.type || "").toUpperCase();

    if (ctype === "HEADER") {
      const fmt = String(c.format || "").toLowerCase();
      if (fmt === "image" || fmt === "IMAGE") {
        let link = previewUrl;
        const ex = (c as { example?: { header_handle?: string[] } }).example?.header_handle?.[0];
        if (!link && ex && /^https?:\/\//i.test(ex)) link = ex;
        const txt = c.text != null ? String(c.text) : "";
        if (!link && txt) {
          const tph = extractSortedPlaceholders(txt);
          if (tph.length && vvStr[tph[0]]) link = vvStr[tph[0]].trim();
        }
        if (!link || !/^https?:\/\//i.test(link)) {
          return {
            components: [],
            error: `Carousel slide ${cardIndex + 1}: add a valid https image URL for this card's header—fill the matching variable or choose media, then try again.`,
          };
        }
        out.push({
          type: "header",
          parameters: [{ type: "image", image: { link } }],
        });
      }
    }

    if (ctype === "BODY") {
      const text = String((c as { text?: string }).text || "");
      const bph = extractSortedPlaceholders(text);
      for (const ph of bph) {
        if (!(vvStr[ph] ?? "").trim()) {
          return {
            components: [],
            error: `Carousel card ${cardIndex + 1}: missing body variable ${ph}`,
          };
        }
      }
      if (bph.length) {
        out.push({
          type: "body",
          parameters: bph.map((ph) => ({ type: "text", text: vvStr[ph] ?? "" })),
        });
      }
    }

    if (ctype === "BUTTONS") {
      const btnArr = Array.isArray((c as { buttons?: unknown }).buttons)
        ? ((c as { buttons: unknown[] }).buttons as unknown[])
        : [];
      const err = pushUrlButtonComponents(btnArr, vvStr, out);
      if (err.error) return { components: [], error: `Carousel card ${cardIndex + 1}: ${err.error}` };
    }
  }

  if (!out.length) {
    return {
      components: [],
      error: `Carousel slide ${cardIndex + 1}: media couldn't be prepared. Refresh your templates from WhatsApp Manager, check your variables, and try again.`,
    };
  }

  return { components: out };
}

function buildCarouselLibraryPayload(
  template: TemplateRowForMetaSend,
  vv: Record<string, string>,
  shape: MetaTemplateSendShape
): { components?: Record<string, unknown>[]; error?: string; shape: MetaTemplateSendShape } {
  const cardsRaw = Array.isArray(template.carouselCards) ? template.carouselCards : [];
  if (!cardsRaw.length) {
    return {
      error:
        "This carousel template isn't ready to send yet. Refresh your templates from WhatsApp Manager and try again.",
      shape,
    };
  }

  const components: Record<string, unknown>[] = [];

  const bodyPh = extractSortedPlaceholders(template.bodyText);
  for (const ph of bodyPh) {
    if (!(vv[ph] ?? "").trim()) {
      return { error: `Missing body variable ${ph}`, shape };
    }
  }
  if (bodyPh.length) {
    components.push({
      type: "body",
      parameters: bodyPh.map((ph) => ({ type: "text", text: vv[ph] ?? "" })),
    });
  }

  const cardsOut: Record<string, unknown>[] = [];
  for (let i = 0; i < cardsRaw.length; i++) {
    const mapped = mapCarouselCardComponents(cardsRaw[i], i, vv);
    if (mapped.error) return { error: mapped.error, shape };
    cardsOut.push({
      card_index: i,
      components: mapped.components,
    });
  }

  components.push({
    type: "carousel",
    cards: cardsOut,
  });

  return { components, shape };
}

/**
 * Template Library (Meta) — full template shapes: media headers, URL buttons, carousel.
 * Uses synced template fields + normalized variable map only (no guessed UI copy).
 */
export function buildMetaLibraryTemplateSendComponents(
  template: TemplateRowForMetaSend,
  variableValues: Record<string, string>
): { components?: Record<string, unknown>[]; error?: string; shape: MetaTemplateSendShape } {
  const vv = normalizeTemplateVariableMap(variableValues);
  const shape = inferMetaTemplateShape(template);

  if ((template.category || "").toLowerCase() === "authentication") {
    return {
      error: "Authentication templates cannot be sent from this flow.",
      shape,
    };
  }

  const tt = (template.templateType || "").toLowerCase();
  if (tt === "carousel" || (Array.isArray(template.carouselCards) && template.carouselCards.length > 0)) {
    return buildCarouselLibraryPayload(template, vv, shape);
  }

  const components: Record<string, unknown>[] = [];
  const ht = (template.headerType || "").toLowerCase();
  const hc = template.headerContent;

  if (ht === "text" && (hc || "").trim()) {
    const headerPh = extractSortedPlaceholders(hc);
    for (const ph of headerPh) {
      if (!(vv[ph] ?? "").trim()) {
        return { error: `Missing header variable ${ph}`, shape };
      }
    }
    if (headerPh.length) {
      components.push({
        type: "header",
        parameters: headerPh.map((ph) => ({ type: "text", text: vv[ph] ?? "" })),
      });
    }
  } else if (["image", "video", "document"].includes(ht)) {
    const resolved = resolveStaticOrVariableMediaUrl(hc, vv);
    if (resolved.error) return { error: resolved.error, shape };
    const url = resolved.url!;
    if (ht === "image") {
      components.push({
        type: "header",
        parameters: [{ type: "image", image: { link: url } }],
      });
    } else if (ht === "video") {
      components.push({
        type: "header",
        parameters: [{ type: "video", video: { link: url } }],
      });
    } else {
      components.push({
        type: "header",
        parameters: [
          {
            type: "document",
            document: { link: url, filename: "document.pdf" },
          },
        ],
      });
    }
  }

  const bodyPh = extractSortedPlaceholders(template.bodyText);
  for (const ph of bodyPh) {
    if (!(vv[ph] ?? "").trim()) {
      return { error: `Missing body variable ${ph}`, shape };
    }
  }
  if (bodyPh.length) {
    components.push({
      type: "body",
      parameters: bodyPh.map((ph) => ({ type: "text", text: vv[ph] ?? "" })),
    });
  }

  const buttons = template.buttons;
  if (Array.isArray(buttons) && buttons.length > 0) {
    const err = pushUrlButtonComponents(buttons as unknown[], vv, components);
    if (err.error) return { error: err.error, shape };
  }

  return { components: components.length ? components : undefined, shape };
}
