/** One explicit merchant action. No channel, checkout or workflow activation inputs. */
export function parseOrderSupportQuickStart(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const request = input as Record<string, unknown>;
  return Object.keys(request).length === 1 && request.action === "start_order_support";
}

/** Only the already-verified internal order support path can be made one click.
 * An operator gate is independent of merchant opt-in and may not be bypassed.
 */
export function orderSupportQuickStartAvailable(env: NodeJS.ProcessEnv): boolean {
  return env.RAILWAY_ENVIRONMENT_NAME === "staging" &&
    env.APP_URL?.replace(/\/$/, "") === "https://whachatcrm-staging-app-staging.up.railway.app" &&
    env.ECOMMERCE_EVENT_RECORDING_ENABLED === "true" &&
    env.ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED === "true";
}
