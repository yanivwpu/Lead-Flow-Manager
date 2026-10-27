import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { CatalogDb } from "../salesCatalog/commerceStore";
import { agentProfile } from "../salesCatalog/shopify/agenticProbe";
import { TestChatError, type TestOwner } from "./sessions";
import { privateTestShoppingAllowed } from "./shoppingAllowance";

// Requires a separately approved source change AND a pre-provisioned, single-use grant.
// Neither this preparation nor environment variables authorize activation.
export const SHOPIFY_AGENTIC_PROBE_ONE_SHOT_APPROVED = false;
export const PILOT_PROBE_SHOP = "whachatcrm.myshopify.com";
export type ProbeGrantScope = TestOwner & {authorizationId:string;shop:string;integrationId:string;contextDigest:string};
export function probeGrantScope(auth:TestOwner,snapshot:{binding:string;install:{shop:string;integrationId:string}},httpSessionId:string,env:NodeJS.ProcessEnv):ProbeGrantScope {
  return {...auth,authorizationId:env.SHOPIFY_AGENTIC_PROBE_ONE_SHOT_ID!,shop:snapshot.install.shop,integrationId:snapshot.install.integrationId,
    contextDigest:createHash("sha256").update(JSON.stringify([snapshot.binding,httpSessionId,
      env.SHOPIFY_AGENTIC_PROBE_ONE_SHOT_ID,env.ECOMMERCE_PILOT_ENABLED,env.ECOMMERCE_PILOT_WORKSPACE_ID,
      env.ECOMMERCE_PILOT_OWNER_EMAIL,env.APP_URL,env.RAILWAY_ENVIRONMENT_NAME])).digest("hex")};
}
/** Private, non-network configuration check. Presence alone never establishes authorization. */
export function probePrivateConfiguration(owner:{id:string;email?:string|null}|undefined,auth:TestOwner,env:NodeJS.ProcessEnv,
  pilotAllowed=privateTestShoppingAllowed): "ready" | "pilot_owner_required" | "probe_identity_configuration_required" | "agent_profile_required" | "one_shot_authorization_required" {
  if(!owner || auth.actorUserId!==auth.workspaceUserId || owner.id!==auth.workspaceUserId || !pilotAllowed(owner,env))return "pilot_owner_required";
  if(env.SHOPIFY_AGENTIC_PROBE_WORKSPACE_ID!==owner.id || !z.string().email().safeParse(env.SHOPIFY_AGENTIC_PROBE_OWNER_EMAIL).success ||
    owner.email?.trim().toLowerCase()!==env.SHOPIFY_AGENTIC_PROBE_OWNER_EMAIL?.trim().toLowerCase() ||
    env.SHOPIFY_AGENTIC_PROBE_SHOP!==PILOT_PROBE_SHOP)return "probe_identity_configuration_required";
  if(!agentProfile(env.SHOPIFY_AGENTIC_PROBE_AGENT_PROFILE))return "agent_profile_required";
  if(!z.string().uuid().safeParse(env.SHOPIFY_AGENTIC_PROBE_ONE_SHOT_ID).success)return "one_shot_authorization_required";
  return "ready";
}
export function createProbeGrantJournal(db:CatalogDb) {
  const where=(scope:ProbeGrantScope)=>sql`singleton=1 AND authorization_id=${scope.authorizationId}::uuid
    AND workspace_id=${scope.workspaceUserId} AND operator_id=${scope.actorUserId} AND shop=${scope.shop}
    AND integration_id=${scope.integrationId} AND context_digest=${scope.contextDigest}
    AND authorized_at<=now() AND expires_at>now() AND revoked_at IS NULL`;
  async function setup() {
    // Require the reviewed journal and its immutable trigger. No auto migration.
    const result=await db.execute(sql`SELECT
      EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisprimary AND i.indisunique AND i.indisvalid
        AND i.indnkeyatts=1 AND pg_get_indexdef(i.indexrelid,1,true)='singleton') AS singleton_key,
      EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='c' AND k.convalidated
        AND pg_get_expr(k.conbin,k.conrelid)='(singleton = 1)') AS singleton_check,
      EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='preserve_agentic_probe_one_shot'
        AND NOT t.tgisinternal AND t.tgenabled='O') AS immutable
      FROM pg_class c WHERE c.oid=to_regclass('shopify_agentic_probe_one_shot')`);
    if(result.rows[0]?.immutable!==true || result.rows[0]?.singleton_key!==true || result.rows[0]?.singleton_check!==true)throw new TestChatError(503,"probe_authorization_setup_required");
  }
  return {
    async ready(scope:ProbeGrantScope) {
      await setup();
      const result=await db.execute(sql`SELECT EXISTS(SELECT 1 FROM shopify_agentic_probe_one_shot WHERE ${where(scope)} AND claimed_at IS NULL) AS ready`);
      return result.rows[0]?.ready===true;
    },
    async assertActive(scope:ProbeGrantScope) {
      const result=await db.execute(sql`SELECT EXISTS(SELECT 1 FROM shopify_agentic_probe_one_shot
        WHERE ${where(scope)} AND claimed_at IS NOT NULL) AS active`);
      if(result.rows[0]?.active!==true)throw new TestChatError(409,"probe_authorization_expired_or_revoked");
    },
    async claim(scope:ProbeGrantScope) {
      await setup();
      // One autocommit UPDATE commits BEFORE any provider request. Lost acknowledgements are never retried.
      const result=await db.execute(sql`UPDATE shopify_agentic_probe_one_shot SET claimed_at=now()
        WHERE ${where(scope)} AND claimed_at IS NULL RETURNING singleton`);
      if(result.rows.length!==1)throw new TestChatError(409,"probe_authorization_unavailable_or_spent");
    },
  };
}
