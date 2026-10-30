import { sql } from "drizzle-orm";
import type { JourneyPlan, PostPurchaseJourney } from "../../shared/postPurchase";

/** Caller holds existing shop privacy/uninstall lock and rechecks active ownership.
 * Atomic per-journey replacement preserves tokens, existing workflow drafts and
 * concurrent edits to other journeys. Deliberately has no runtime enable flag.
 */
export function savePostPurchasePlanQuery(input: {
  integrationId: string; accountId: string; shop: string;
  journey: PostPurchaseJourney; plan: JourneyPlan;
}) {
  return sql`
    UPDATE integrations SET config = jsonb_set(
      COALESCE(config, '{}'::jsonb), '{ecommercePostPurchasePlans}',
      (CASE WHEN jsonb_typeof(config->'ecommercePostPurchasePlans') = 'object'
        THEN config->'ecommercePostPurchasePlans' ELSE '{}'::jsonb END)
        || jsonb_build_object(${input.journey}::text, ${JSON.stringify(input.plan)}::jsonb), true)
    WHERE id = ${input.integrationId} AND user_id = ${input.accountId}
      AND type = 'shopify' AND is_active IS TRUE
      AND (config->>'shop' IS NULL OR config->>'shop' = ${input.shop})
    RETURNING config->'ecommercePostPurchasePlans' AS plans
  `;
}
