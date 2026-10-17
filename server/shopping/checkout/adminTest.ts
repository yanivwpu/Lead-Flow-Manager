import { CheckoutVerificationError, controlledFailureCode, verificationStage } from './preflightDiagnostics';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { CatalogDb } from '../../salesCatalog/commerceStore';
import { resolveCatalogInstallation } from '../../salesCatalog/shopify/installation';
import { shopifyCatalogRequest } from '../../salesCatalog/shopify/api';
import { SHOPIFY_INVENTORY_BATCH_QUERY } from '../../salesCatalog/shopify/inventory';
import { runValidation, selectionDigest, selectionSchema, SHOP, type Selection } from './controlledValidation';
import type { CheckoutReceipt } from './contract';

export const TEST_PRODUCT = 'gid://shopify/Product/10108113912090';
export const TEST_VARIANT = 'gid://shopify/ProductVariant/51638768632090';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const confirmation = 'CREATE EXACTLY ONE DEVELOPMENT STORE CART';
const input = z.object({ requestId: z.string().uuid(), selectionSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
class TestError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export function configuredTestAccess(auth: {workspaceUserId:string;actorUserId:string}, env = process.env) {
  // Both allowlists are explicit deployment configuration. No inferred workspace or merchant input.
  return !!env.SHOPIFY_CHECKOUT_TEST_WORKSPACE_ID &&
    auth.workspaceUserId === env.SHOPIFY_CHECKOUT_TEST_WORKSPACE_ID &&
    (env.SHOPIFY_CHECKOUT_TEST_OPERATOR_IDS ?? '').split(',').map(s=>s.trim()).filter(Boolean).includes(auth.actorUserId);
}
export function registerShopifyCheckoutAdminTest(app: Express, database: CatalogDb,
  authorize: (req:Request,res:Response)=>Promise<{workspaceUserId:string;actorUserId:string}|null>,
  requestFor = shopifyCatalogRequest, storefrontFetch = fetch,
) {
  const base = '/api/sales-catalog/commerce/checkout-test';
  async function setup() {
    const result = await database.execute(sql`SELECT to_regclass('public.shopify_checkout_admin_tests') AS name`);
    if (!result.rows[0]?.name) throw new TestError(503,'checkout_test_setup_required_apply_reviewed_0112');
    const index = await database.execute(sql`SELECT i.indisunique, i.indisvalid,
      pg_get_expr(i.indpred,i.indrelid) AS predicate, pg_get_indexdef(i.indexrelid,1,true) AS column_name
      FROM pg_index i WHERE i.indexrelid=to_regclass('public.shopify_checkout_admin_one_dispatch')
      AND i.indrelid=to_regclass('public.shopify_checkout_admin_tests') AND i.indnkeyatts=1`);
    const fence = index.rows[0];
    if (fence?.indisunique !== true || fence.indisvalid !== true || fence.column_name !== 'shop' ||
      fence.predicate !== '(claimed_at IS NOT NULL)')
      throw new TestError(503,'checkout_test_setup_required_apply_reviewed_0112');
  }
  for (const action of ['access','preflight','approve','create'] as const) {
    app[action === 'access' ? 'get' : 'post'](`${base}/${action}`, async(req,res)=>{
      res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
      try {
        const auth = await authorize(req,res);
        if (!auth) return;
        if (!configuredTestAccess(auth)) return res.status(404).json({error:'not_found'});
        if (!req.sessionID) throw new TestError(403,'authenticated_session_required');
        if (action === 'access') return res.json({allowed:true});
        // JSON-only mutations prevent cross-site form submission; reject cross-site fetch explicitly.
        if (!req.is('application/json') || req.get('sec-fetch-site') === 'cross-site')
          throw new TestError(403,'same_origin_json_required');
        await setup();
        const install = await verificationStage('installation',()=>resolveCatalogInstallation(database,auth.workspaceUserId,SHOP));
        if (!install) throw new TestError(409,'active_development_installation_required');
        const installationDigest = hash(install.token);
        const sessionDigest = hash(req.sessionID);
        const deps = {
          installation:()=>resolveCatalogInstallation(database,auth.workspaceUserId,SHOP),
          requestFor, storefrontFetch,
          consume:async()=>{throw new TestError(403,'approval_required');},
          saveReceipt:async()=>{},
        };
        if (action === 'preflight') {
          if (!z.object({}).strict().safeParse(req.body).success) throw new TestError(400,'invalid_request');
          const live = await verificationStage('admin_variant',()=>requestFor(SHOP,install.token)(SHOPIFY_INVENTORY_BATCH_QUERY,{ids:[TEST_VARIANT]}));
          const v = live?.nodes?.[0];
          // Price/options/currency come from live Admin data, never cached values or browser input.
          const selection = await verificationStage('selection',async()=>selectionSchema.parse({shop:SHOP,userId:auth.workspaceUserId,
            productId:TEST_PRODUCT,variantId:TEST_VARIANT,quantity:1,
            price:v?.price,currency:live?.shop?.currencyCode,options:v?.selectedOptions}));
          await runValidation(selection,deps); // Strict identity/publication/inventory + tokenless verification, no cart.
          const requestId = randomUUID(), digest = selectionDigest(selection);
          const expiresAt = new Date(Date.now()+10*60_000).toISOString();
          await verificationStage('journal',()=>database.execute(sql`INSERT INTO public.shopify_checkout_admin_tests
            (request_id,workspace_id,operator_id,session_digest,shop,integration_id,installation_digest,selection,selection_digest,expires_at)
            VALUES (${requestId},${auth.workspaceUserId},${auth.actorUserId},${sessionDigest},${SHOP},${install.integrationId},${installationDigest},${JSON.stringify(selection)}::jsonb,${digest},${expiresAt}::timestamptz)`));
          return res.json({requestId,selectionSha256:digest,expiresAt,selection,
            productTitle:v.product?.title,inventory:'verified',developmentStore:true,publication:'verified',
            storefront:'verified',ready:true,cartCreated:false});
        }
        const parsed = (action === 'approve' ? input.extend({confirmation:z.literal(confirmation)}).strict() : input).safeParse(req.body);
        if (!parsed.success) throw new TestError(400,'invalid_request');
        const {requestId,selectionSha256} = parsed.data;
        const result = await database.execute(sql`SELECT * FROM public.shopify_checkout_admin_tests WHERE
          request_id=${requestId}::uuid AND workspace_id=${auth.workspaceUserId} AND operator_id=${auth.actorUserId}
          AND session_digest=${sessionDigest} AND shop=${SHOP} AND integration_id=${install.integrationId}
          AND installation_digest=${installationDigest} AND selection_digest=${selectionSha256}
          AND expires_at>now() AND claimed_at IS NULL`);
        const row = result.rows[0];
        if (!row) throw new TestError(409,'test_expired_changed_or_consumed');
        const selection: Selection = selectionSchema.parse(row.selection);
        if (selectionDigest(selection)!==selectionSha256 || selection.productId!==TEST_PRODUCT ||
          selection.variantId!==TEST_VARIANT || selection.userId!==auth.workspaceUserId || selection.quantity!==1)
          throw new TestError(409,'selection_changed');
        if (action === 'approve') {
          // An explicit separate request records the operator's approval before any mutation.
          await runValidation(selection,deps);
          const approved = await database.execute(sql`UPDATE public.shopify_checkout_admin_tests SET approved_at=now()
            WHERE request_id=${requestId}::uuid AND approved_at IS NULL AND claimed_at IS NULL AND expires_at>now() RETURNING request_id`);
          if (!approved.rows.length) throw new TestError(409,'approval_expired_or_recorded');
          return res.json({approved:true,requestId,selectionSha256,expiresAt:row.expires_at});
        }
        if (!row.approved_at) throw new TestError(403,'explicit_operator_approval_required');
        let receipt: CheckoutReceipt | undefined;
        await runValidation(selection,{
          ...deps,
          approval:{action:confirmation,selectionSha256,expiresAt:new Date(row.expires_at as string).toISOString(),
            approvedBy:auth.actorUserId,developmentStoreEvidence:'live_shop_plan_partnerDevelopment'},
          consume:async()=>{
            // Autocommitted durable claim BEFORE provider.prepare. Unique store index arbitrates all processes.
            // Never roll this back or clear it on network/provider/status failure.
            const claim = await database.execute(sql`UPDATE public.shopify_checkout_admin_tests SET claimed_at=now()
              WHERE request_id=${requestId}::uuid AND approved_at IS NOT NULL AND claimed_at IS NULL AND expires_at>now()
              RETURNING request_id`);
            if (!claim.rows.length) throw new TestError(409,'dispatch_consumed_or_expired');
          },
          saveReceipt:async(value)=>{receipt=value as CheckoutReceipt;},
        });
        if (!receipt) throw new TestError(409,'cart_result_unavailable_do_not_retry');
        // Ephemeral private response only. No persistence, transcript, analytics or raw diagnostics.
        return res.json({checkoutUrl:receipt.checkoutUrl,cartCreated:true,paymentStatus:'unknown',navigation:'manual_review_required'});
      } catch(error) {
        // Never serialize/log provider errors, SQL params, tokens, cart IDs or checkout URLs.
        const failure = error as {code?:string;cause?:{code?:string}};
        const code = failure?.code ?? failure?.cause?.code;
        const known = error instanceof TestError;
        const diagnostic = error instanceof CheckoutVerificationError ? error.code : controlledFailureCode(error);
        res.status(known ? error.status : code==='23505' ? 409 : 503).json({error:known ? error.code :
          code==='42P01' || code==='42703' ? 'checkout_test_setup_required_apply_reviewed_0112' :
          code==='23505' ? 'development_store_dispatch_already_consumed' : diagnostic ?? 'checkout_test_failed_closed_do_not_retry_cart'});
      }
    });
  }
}
