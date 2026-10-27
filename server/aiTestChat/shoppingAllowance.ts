import type { ShoppingSettings } from "@shared/shoppingAssistant";
import { isEcommercePilotOwner, type EcommercePilotEnv, type EcommercePilotOwner } from "../ecommerce/pilotAccess";

/** Only private Test Chat may consume this grant, after its normal admin + Brain gates.
 * Owner identity must come from the database. This never persists Shopping settings.
 */
export function privateTestShoppingAllowed(owner: EcommercePilotOwner | null | undefined, env: EcommercePilotEnv): boolean {
  // Two independently configured server-side grants must agree. Neither comes from the request.
  return !!owner && owner.id === env.PRIVATE_SHOPPING_PILOT_WORKSPACE_ID && isEcommercePilotOwner(owner, env);
}

export function privateTestShoppingSettings(saved: ShoppingSettings, allowed: boolean): ShoppingSettings {
  return allowed
    ? { ...saved, enabled: true, allowedChannels: ["webchat"], checkoutEnabled: false, handoffOnFailure: false }
    : saved;
}
