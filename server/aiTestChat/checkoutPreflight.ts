import { createHash } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { aiTestSessions, catalogProducts, catalogSources, catalogVariants, users } from "@shared/schema";
import type { ShoppingState } from "@shared/shoppingAssistant";
import type { PrivateCheckoutPreflight } from "@shared/aiTestChat";
import type { CatalogDb } from "../salesCatalog/commerceStore";
import { resolveCatalogInstallation } from "../salesCatalog/shopify/installation";
import { shopifyCatalogRequest } from "../salesCatalog/shopify/api";
import { privateTestShoppingAllowed } from "./shoppingAllowance";
import { TestChatError, type TestOwner } from "./sessions";
import { configuredTestAccess, verifyCheckoutTestSetup } from "../shopping/checkout/adminTest";
import { runValidation, selectionSchema, SHOP } from "../shopping/checkout/controlledValidation";
import { badRequestDiagnostic } from "../shopping/checkout/badRequestDiagnostic";
import { CheckoutVerificationError, controlledFailureCode } from "../shopping/checkout/preflightDiagnostics";
import type { StorefrontCredential } from "../shopping/checkout/shopify";
import { PRIVATE_CART_SECOND_EXECUTION_ENABLED, privateCartReceiptCodec, secondCartAuthorization } from "./secondCartAuthorization";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Dedicated store-bound server configuration. No browser credentials or token-prefix guesses. */
export function privatePreflightCredential(env: NodeJS.ProcessEnv): StorefrontCredential {
  const token = env.SHOPIFY_STOREFRONT_TEST_TOKEN, kind = env.SHOPIFY_STOREFRONT_TEST_TOKEN_KIND;
  if (!token && !kind && !env.SHOPIFY_STOREFRONT_TEST_SHOP) return { kind: "tokenless" };
  if (!token || !["public", "private"].includes(kind ?? "") || env.SHOPIFY_STOREFRONT_TEST_SHOP !== SHOP || /\s/.test(token))
    throw new TestChatError(503, "storefront_test_credential_setup_required");
  return { kind: kind as "public" | "private", token };
}
export type PrivateCheckoutDependencies = {
  db: CatalogDb;
  entitled: (id: string) => Promise<boolean>;
  env?: NodeJS.ProcessEnv;
  requestFor?: typeof shopifyCatalogRequest;
  storefrontFetch?: typeof fetch;
  secondExecutionEnabled?: () => boolean;
};
/** Server-only snapshot: no Shopify mutation and no journal writes. */
export async function privateCheckoutSnapshot(deps: PrivateCheckoutDependencies, auth: TestOwner, sessionId: string, httpSessionId: string, inspection: { allowExpiredForInspection?: boolean } = {}) {
  const { db } = deps, env = deps.env ?? process.env;
  if (!httpSessionId) throw new TestChatError(403, "authenticated_session_required");
  if (!z.string().uuid().safeParse(sessionId).success) throw new TestChatError(400, "invalid_test_session");
  const credential = privatePreflightCredential(env);
  const [owner] = await db.select({id:users.id,email:users.email}).from(users).where(eq(users.id,auth.workspaceUserId)).limit(1);
  if (!privateTestShoppingAllowed(owner,env)) throw new TestChatError(404,"not_found");
  if (!await deps.entitled(auth.workspaceUserId)) throw new TestChatError(403,"shopping_entitlement_required");
  // Only the authenticated metadata inspector opts into expired-row reads; live callers retain the expiry predicate.
  const [row] = await db.select({state:aiTestSessions.shoppingState,leaseUntil:aiTestSessions.leaseUntil,expiresAt:aiTestSessions.expiresAt})
    .from(aiTestSessions).where(and(eq(aiTestSessions.id,sessionId),eq(aiTestSessions.userId,auth.workspaceUserId),
      eq(aiTestSessions.actorId,auth.actorUserId),...(inspection.allowExpiredForInspection?[]:[gt(aiTestSessions.expiresAt,new Date())]))).limit(1);
  const state = row?.state as ShoppingState | undefined, age = Date.now()-Date.parse(state?.updatedAt ?? "");
  if (!row) throw new TestChatError(404,"session_expired");
  if (row.leaseUntil && row.leaseUntil.getTime()>Date.now()) throw new TestChatError(409,"turn_processing");
  if (state?.version!==1 || state.step!=="confirming" || !state.selected || state.pending ||
      !state.consumedEventIds?.includes(state.lastEventId) || !Number.isFinite(age) || age<0 || (!inspection.allowExpiredForInspection && age>30*60_000))
    throw new TestChatError(409,"selected_variant_required");
  const install = await resolveCatalogInstallation(db,auth.workspaceUserId,SHOP);
  if (credential.kind!=="tokenless" && credential.token===install?.token)
    throw new TestChatError(503,"storefront_test_credential_setup_required");
  const [source] = await db.select().from(catalogSources).where(and(eq(catalogSources.id,state.sourceId),
    eq(catalogSources.userId,auth.workspaceUserId))).limit(1);
  if (!install || !source || source.shop!==SHOP || source.integrationId!==install.integrationId ||
      !source.initialSyncCompletedAt || !["ready","syncing"].includes(source.status) || source.currency!==state.selected.currency)
    throw new TestChatError(409,"checkout_installation_changed");
  const [variant] = await db.select().from(catalogVariants).where(and(eq(catalogVariants.id,state.selected.variantId),
    eq(catalogVariants.userId,auth.workspaceUserId),eq(catalogVariants.sourceId,source.id),
    eq(catalogVariants.productId,state.selected.productId))).limit(1);
  const [product] = await db.select().from(catalogProducts).where(and(eq(catalogProducts.id,state.selected.productId),
    eq(catalogProducts.userId,auth.workspaceUserId),eq(catalogProducts.sourceId,source.id))).limit(1);
  if (!variant || !product) throw new TestChatError(409,"selected_variant_required");
  const selection = selectionSchema.safeParse({shop:SHOP,userId:auth.workspaceUserId,productId:product.externalId,
    variantId:variant.externalId,quantity:state.quantity,price:state.selected.price,currency:state.selected.currency,options:state.selected.options});
  if (!selection.success) throw new TestChatError(409,"selected_variant_required");
  return {sessionExpired:row.expiresAt.getTime()<=Date.now(),credential,credentialBinding:digest(credential),selection:selection.data,integrationId:install.integrationId,binding:digest([sessionId,auth,httpSessionId,state,selection.data,source.id,source.integrationId,install.integrationId,install.token])};
}
/** Read-only adapter. It has no approval/claim, cart preparation, receipt or messaging entry point. */
export function createPrivateCheckoutPreflight(deps: PrivateCheckoutDependencies) {
  const { db } = deps, requestFor = deps.requestFor ?? shopifyCatalogRequest;
  const active = new Set<string>();
  return async (auth: TestOwner, sessionId: string, httpSessionId: string): Promise<PrivateCheckoutPreflight> => {
    if (!httpSessionId) throw new TestChatError(403, "authenticated_session_required");
    if (!z.string().uuid().safeParse(sessionId).success) throw new TestChatError(400, "invalid_test_session");
    const env = deps.env ?? process.env;
    const key = `${auth.workspaceUserId}:${auth.actorUserId}`;
    if (active.has(key)) throw new TestChatError(429,"checkout_preflight_processing");
    active.add(key);
    try {
      const snapshot = () => privateCheckoutSnapshot(deps,auth,sessionId,httpSessionId);
      const credential = privatePreflightCredential(env), credentialBinding = digest(credential);
      const before = await snapshot();
      try { await verifyCheckoutTestSetup(db); }
      catch { throw new TestChatError(503,"checkout_test_setup_required_apply_reviewed_0112"); }
      const used = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM public.shopify_checkout_admin_tests WHERE shop=${SHOP} AND claimed_at IS NOT NULL) AS used`);
      let authorizationId:string|undefined;
      if (used.rows[0]?.used!==false || (deps.secondExecutionEnabled?.() ?? PRIVATE_CART_SECOND_EXECUTION_ENABLED)) {
        if (!(deps.secondExecutionEnabled?.() ?? PRIVATE_CART_SECOND_EXECUTION_ENABLED) || auth.actorUserId!==auth.workspaceUserId)
          throw new TestChatError(409,"development_store_dispatch_already_consumed");
        privateCartReceiptCodec(env);
        authorizationId=await secondCartAuthorization(db,{workspaceId:auth.workspaceUserId,operatorId:auth.actorUserId,shop:SHOP,
          integrationId:before.integrationId,installationDigest:digest([before.integrationId,before.credentialBinding])}).available();
      }
      let badRequest: string | undefined;
      let proof: Awaited<ReturnType<typeof runValidation>>;
      try {
        proof = await runValidation(before.selection,{
          installation:()=>resolveCatalogInstallation(db,auth.workspaceUserId,SHOP),requestFor,
          storefrontCredential:credential,
          storefrontFetch:async(input,init)=>{
            // Structural mutation tripwire independent of UI and approval state.
            const request = JSON.parse(String(init?.body));
            if (!/^query CheckoutVariant\(/.test(request.query)) throw Error("read_only_preflight_required");
            const response = await (deps.storefrontFetch ?? fetch)(input,init);
            if (response.status===400) badRequest=await badRequestDiagnostic(response);
            return response;
          },
          consume:async()=>{throw Error("read_only_preflight_required");},
          saveReceipt:async()=>{throw Error("read_only_preflight_required");},
        });
      } catch (error) {
        const known = error instanceof CheckoutVerificationError ? error.code : controlledFailureCode(error);
        return {ready:false,cartCreated:false,cartCreationEnabled:false,credentialKind:credential.kind,
          error:badRequest ? `checkout_test_storefront_bad_request_${badRequest}` : known ?? "checkout_preflight_unavailable"};
      }
      const after = await snapshot();
      if (after.binding!==before.binding || digest(privatePreflightCredential(env))!==credentialBinding)
        throw new TestChatError(409,"session_changed");
      if (!proof.inventory || !proof.quantityRule || proof.cartCreated) throw new TestChatError(503,"checkout_preflight_unavailable");
      const proofAge=Date.now()-Date.parse(proof.inventory.verifiedAt);
      if (!Number.isFinite(proofAge) || proofAge<0 || proofAge>60_000)
        throw new TestChatError(409,"checkout_preflight_stale");
      return {ready:true,cartCreated:false,cartCreationEnabled:false,credentialKind:credential.kind,
        selection:before.selection,selectionSha256:proof.selectionSha256,sessionBinding:digest([before.binding,credentialBinding]),
        inventory:proof.inventory,quantityRule:proof.quantityRule,operatorCartAccessConfigured:configuredTestAccess(auth,env),
        nextAction:"separate_cart_approval_required",...(authorizationId?{authorizationId}:{})};
    } finally { active.delete(key); }
  };
}
