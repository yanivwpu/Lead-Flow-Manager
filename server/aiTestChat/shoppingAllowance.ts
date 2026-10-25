import type { ShoppingSettings } from "@shared/shoppingAssistant";
import { isEcommercePilotOwner, type EcommercePilotEnv, type EcommercePilotOwner } from "../ecommerce/pilotAccess";

const PRIVATE_SHOPPING_PILOT_ID = "6868785e-e8af-4152-8e2d-8d031c2e97d0";

/** Only private Test Chat may consume this grant, after its normal admin + Brain gates.
 * Owner identity must come from the database. This never persists Shopping settings.
 */
export function privateTestShoppingAllowed(owner: EcommercePilotOwner | null | undefined, env: EcommercePilotEnv): boolean {
  return owner?.id === PRIVATE_SHOPPING_PILOT_ID && isEcommercePilotOwner(owner, env);
}

export function privateTestShoppingSettings(saved: ShoppingSettings, allowed: boolean): ShoppingSettings {
  return allowed
    ? { ...saved, enabled: true, allowedChannels: ["webchat"], checkoutEnabled: false, handoffOnFailure: false }
    : saved;
}
