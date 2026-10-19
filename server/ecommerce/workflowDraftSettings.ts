import { sql } from "drizzle-orm";

/** Merchant-owned WORKFLOW DRAFTS, never a runtime enable switch.
 * This module contains no execution, scheduler, checkout, or messaging capability.
 */
export const ECOMMERCE_DRAFT_JOURNEYS = [
  "orderSupport", "fulfillmentSupport", "orderCancelled", "abandonedCart",
] as const;
export type DraftJourney = typeof ECOMMERCE_DRAFT_JOURNEYS[number];
export type WorkflowDraftSettings = Record<DraftJourney, boolean>;
const EMPTY_DRAFTS: Readonly<WorkflowDraftSettings> = {
  orderSupport: false,
  fulfillmentSupport: false,
  orderCancelled: false,
  abandonedCart: false,
};

export function readWorkflowDraftSettings(config: unknown): WorkflowDraftSettings {
  if (!config || typeof config !== "object" || Array.isArray(config)) return { ...EMPTY_DRAFTS };
  const saved = (config as Record<string, unknown>).ecommerceGrowthEngineDrafts;
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { ...EMPTY_DRAFTS };
  const flags = saved as Record<string, unknown>;
  return {
    orderSupport: flags.orderSupport === true,
    fulfillmentSupport: flags.fulfillmentSupport === true,
    orderCancelled: flags.orderCancelled === true,
    abandonedCart: flags.abandonedCart === true,
  };
}

export function parseWorkflowDraftChange(input: unknown): { journey: DraftJourney; prepared: boolean } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  if (Object.keys(o).length !== 3 || o.action !== "save_draft" ||
    typeof o.journey !== "string" || !ECOMMERCE_DRAFT_JOURNEYS.includes(o.journey as DraftJourney) ||
    typeof o.prepared !== "boolean") return null;
  return { journey: o.journey as DraftJourney, prepared: o.prepared };
}

/** Update exactly one flag without overwriting Shopify tokens, sync options,
 * another concurrent draft flag, or another tenant's integration.
 * Caller must also verify authenticated merchant, active installation and shop,
 * and hold the shop uninstall/privacy advisory lock in the same transaction.
 */
export function saveWorkflowDraftQuery(params: {
  integrationId: string;
  accountId: string;
  shop: string;
  journey: DraftJourney;
  prepared: boolean;
}) {
  const {integrationId, accountId, shop, journey, prepared} = params;
  return sql`
    UPDATE integrations
    SET config = jsonb_set(
      COALESCE(config, '{}'::jsonb),
      '{ecommerceGrowthEngineDrafts}',
      (CASE WHEN jsonb_typeof(config->'ecommerceGrowthEngineDrafts') = 'object'
        THEN config->'ecommerceGrowthEngineDrafts'
        ELSE '{}'::jsonb END) || jsonb_build_object(${journey}::text, ${prepared}::boolean),
      true
    )
    WHERE id = ${integrationId} AND user_id = ${accountId}
      AND type = 'shopify' AND is_active IS TRUE
      AND (config->>'shop' IS NULL OR config->>'shop' = ${shop})
    RETURNING config->'ecommerceGrowthEngineDrafts' AS drafts
  `;
}
