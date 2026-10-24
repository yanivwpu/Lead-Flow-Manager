/** A rollout grant never grants billing entitlements or permission to send. */
export type EcommercePilotEnv = Record<string, string | undefined>;
export type EcommercePilotOwner = { id: string; email?: string | null };

export function ecommercePilotConfigured(env: EcommercePilotEnv): boolean {
  return env.ECOMMERCE_PILOT_ENABLED === "true" &&
    env.RAILWAY_ENVIRONMENT_NAME === "production" &&
    env.APP_URL?.replace(/\/$/, "") === "https://app.whachatcrm.com" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.ECOMMERCE_PILOT_WORKSPACE_ID || "") &&
    env.ECOMMERCE_PILOT_OWNER_EMAIL === "marketing@whachatcrm.com";
}

export function ecommercePilotAccountMatches(accountId: unknown, env: EcommercePilotEnv): accountId is string {
  return ecommercePilotConfigured(env) && typeof accountId === "string" &&
    accountId === env.ECOMMERCE_PILOT_WORKSPACE_ID;
}

/** The owner must be read from the database, never the request body or email alone. */
export function isEcommercePilotOwner(owner: EcommercePilotOwner | null | undefined, env: EcommercePilotEnv): boolean {
  return !!owner && ecommercePilotAccountMatches(owner.id, env) &&
    owner.email?.trim().toLowerCase() === env.ECOMMERCE_PILOT_OWNER_EMAIL;
}

export function ecommerceInternalTasksEnabled(env: EcommercePilotEnv): boolean {
  return ecommercePilotConfigured(env) && env.ECOMMERCE_EVENT_RECORDING_ENABLED === "true" &&
    env.ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED === "true";
}
