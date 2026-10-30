import { sql } from "drizzle-orm";
import { JOURNEY_POLICY, isPostPurchaseJourney, POST_PURCHASE_JOURNEYS, type PostPurchaseJourney } from "../../shared/postPurchase";

/**
 * A selected message is an existing, owned, Meta-approved library template ID.
 * This is a saved no-send draft binding: changing it never edits a live Meta template,
 * grants consent, approves a message or enables delivery.
 */
export type PostPurchaseTemplateBindings = Partial<Record<PostPurchaseJourney, string>>;
export type TemplateBindingChange = { journey: PostPurchaseJourney; templateId: string | null };

export function parsePostPurchaseTemplateBindingChange(input: unknown): TemplateBindingChange | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  if (Object.keys(row).length !== 3 || row.action !== "save_post_purchase_template" ||
      !isPostPurchaseJourney(row.journey)) return null;
  if (row.templateId !== null &&
      (typeof row.templateId !== "string" || row.templateId.length < 1 ||
       row.templateId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(row.templateId))) return null;
  return { journey: row.journey, templateId: row.templateId };
}

export function readPostPurchaseTemplateBindings(config: unknown): PostPurchaseTemplateBindings {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  const raw = (config as Record<string, unknown>).ecommercePostPurchaseTemplates;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const bindings: PostPurchaseTemplateBindings = {};
  for (const journey of POST_PURCHASE_JOURNEYS) {
    const id = record[journey];
    if (typeof id === "string" && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id)) bindings[journey] = id;
  }
  return bindings;
}

/** This intentionally mirrors the supported local shape in matchPostPurchaseTemplate.
 * The eligibility worker later rechecks the live Meta API's name, language, body and
 * category exactly, so this library-level check NEVER proves live approval.
 */
export function eligiblePostPurchaseLibraryTemplate(row: Record<string, unknown> | undefined, journey: PostPurchaseJourney): boolean {
  if (!row || typeof row.id !== "string" || !row.id ||
      typeof row.twilio_sid !== "string" || !row.twilio_sid.startsWith("meta_") ||
      String(row.status || "").toLowerCase() !== "approved" ||
      String(row.category || "").toUpperCase() !== JOURNEY_POLICY[journey].category ||
      typeof row.body_text !== "string" || row.body_text.length < 1 || row.body_text.length > 4096 ||
      /\{\{(?!1\}\})/.test(row.body_text)) return false;
  const type = row.template_type;
  const header = row.header_type;
  if (type != null && String(type).toLowerCase() !== "text") return false;
  if (header != null && String(header).toLowerCase() !== "none") return false;
  if (row.buttons != null && (!Array.isArray(row.buttons) || row.buttons.length > 0)) return false;
  if (row.carousel_cards != null && (!Array.isArray(row.carousel_cards) || row.carousel_cards.length > 0)) return false;
  return true;
}

/** Must be called while holding the existing shop uninstall/privacy lock. */
export function eligiblePostPurchaseTemplateLookupQuery(accountId: string, templateId: string) {
  return sql`SELECT id, twilio_sid, status, category, body_text, template_type, header_type, buttons, carousel_cards
    FROM message_templates WHERE id=${templateId} AND user_id=${accountId} LIMIT 2 FOR SHARE`;
}

/** Atomic per-journey merge; preserve every other workflow or secret configuration. */
export function savePostPurchaseTemplateBindingQuery(input: {
  integrationId: string; accountId: string; shop: string;
  journey: PostPurchaseJourney; templateId: string | null;
}) {
  return sql`UPDATE integrations SET config=jsonb_set(
      COALESCE(config, '{}'::jsonb), '{ecommercePostPurchaseTemplates}',
      ((CASE WHEN jsonb_typeof(config->'ecommercePostPurchaseTemplates')='object'
        THEN config->'ecommercePostPurchaseTemplates' ELSE '{}'::jsonb END)
      - ${input.journey}::text)
      || (CASE WHEN ${input.templateId}::text IS NULL THEN '{}'::jsonb
             ELSE jsonb_build_object(${input.journey}::text,${input.templateId}::text) END),
      true
    ) WHERE id=${input.integrationId} AND user_id=${input.accountId}
      AND type='shopify' AND is_active IS TRUE
      AND (config->>'shop' IS NULL OR config->>'shop'=${input.shop})
    RETURNING config->'ecommercePostPurchaseTemplates' AS bindings`;
}
