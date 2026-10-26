import type { ProviderObserver } from "./executionDiagnostics";
import type { CheckoutReceipt } from "./contract";
import { CheckoutGuardError, verificationStage, verificationFailure } from './preflightDiagnostics';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { compareMoney } from '../../../shared/shoppingAssistant';
import { createShopifyCheckoutProvider, type StorefrontCredential } from './shopify';
import { isShopifyProductPublished } from '../../salesCatalog/shopify/publication';
import { SHOPIFY_INVENTORY_BATCH_QUERY } from '../../salesCatalog/shopify/inventory';
import type { CatalogRequest } from '../../salesCatalog/shopify/api';

export const SHOP = 'whachatcrm.myshopify.com';
export const META = `query ControlledCheckoutPreflight { currentAppInstallation { app { apiKey } accessScopes { handle } } shop { myshopifyDomain plan { partnerDevelopment } } }`;
const gid = (kind: string) => z.string().regex(new RegExp(`^gid://shopify/${kind}/[1-9][0-9]*$`));
export const selectionSchema = z.object({
  shop: z.literal(SHOP), userId: z.string().min(1),
  productId: gid('Product'), variantId: gid('ProductVariant'),
  quantity: z.number().int().min(1).max(99), price: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  options: z.array(z.object({name:z.string(),value:z.string()}).strict()).min(1),
}).strict();
export type Selection = z.infer<typeof selectionSchema>;
export function selectionDigest(selection: Selection) {
  return createHash('sha256').update(JSON.stringify(selectionSchema.parse(selection))).digest('hex');
}
export const approvalSchema = z.object({
  action: z.literal('CREATE EXACTLY ONE DEVELOPMENT STORE CART'),
  selectionSha256: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string().datetime(), approvedBy: z.string().min(1),
  developmentStoreEvidence: z.string().min(1),
}).strict();
export function authorize(selection: Selection, raw: unknown, now = Date.now()) {
  const approval = approvalSchema.parse(raw), remaining = Date.parse(approval.expiresAt) - now;
  if (approval.selectionSha256 !== selectionDigest(selection) || remaining <= 0 || remaining > 30 * 60_000)
    throw Error('authorization_invalid');
}
export async function runValidation(raw: unknown, deps: {
  installation: () => Promise<{shop:string;integrationId:string;token:string}|null>;
  requestFor: (shop:string,token:string)=>CatalogRequest;
  storefrontFetch: typeof fetch;
  // Server-owned credential only. Legacy callers remain tokenless.
  storefrontCredential?: StorefrontCredential;
  diagnostic?:ProviderObserver;
  captureReceipt?:(candidate:CheckoutReceipt)=>Promise<void>;
  approval?: unknown;
  consume: () => Promise<void>;
  saveReceipt: (receipt: unknown)=>Promise<void>;
}) {
  const selection = await verificationStage('selection',async()=>selectionSchema.parse(raw));
  if (deps.approval !== undefined) authorize(selection,deps.approval);
  const install = await verificationStage('installation',deps.installation);
  if (!install || install.shop !== SHOP) verificationFailure('installation','unavailable');
  const request = (query:string, variables?:Record<string,unknown>)=>verificationStage(
    query===META ? 'admin_metadata' : 'admin_variant',()=>deps.requestFor(SHOP,install.token)(query,variables));
  const meta = await verificationStage('admin_metadata',()=>request(META));
  const grants = meta?.currentAppInstallation?.accessScopes;
  const scopes = Array.isArray(grants) ? grants.map((s:any)=>s?.handle) : null;
  if (meta?.shop?.myshopifyDomain !== SHOP) throw new CheckoutGuardError('development_installation_not_attested_shop');
  if (meta.shop?.plan?.partnerDevelopment !== true) throw new CheckoutGuardError('development_installation_not_attested_plan');
  if (meta.currentAppInstallation?.app?.apiKey !== 'e4585d4da1434c9e5649a2269e716076')
    throw new CheckoutGuardError('development_installation_not_attested_app');
  if (!Array.isArray(scopes) || !['read_products','read_inventory'].every(s=>scopes.includes(s)))
    throw new CheckoutGuardError('development_installation_not_attested_scopes');
  const data = await request(SHOPIFY_INVENTORY_BATCH_QUERY,{ids:[selection.variantId]});
  if (!data || !Array.isArray(data.nodes) || !data.shop) verificationFailure('admin_variant','invalid_response');
  const v = data.nodes[0];
  if (data.shop?.myshopifyDomain !== SHOP || data.shop.currencyCode !== selection.currency ||
      !Array.isArray(data.nodes) || data.nodes.length !== 1 || v?.id !== selection.variantId ||
      v.product?.id !== selection.productId || !isShopifyProductPublished(v.product) ||
      v.availableForSale !== true || v.requiresComponents !== false ||
      typeof v.price !== 'string' || !/^\d+(?:\.\d{1,6})?$/.test(v.price) || compareMoney(v.price,selection.price)!==0 ||
      JSON.stringify(v.selectedOptions)!==JSON.stringify(selection.options) ||
      typeof v.inventoryItem?.tracked !== 'boolean' || !['CONTINUE','DENY'].includes(v.inventoryPolicy))
    throw new CheckoutGuardError('catalog_selection_unavailable_or_changed');
  const unrestricted = v.inventoryItem.tracked === false || v.inventoryPolicy === 'CONTINUE';
  if (!unrestricted && (!Number.isSafeInteger(v.inventoryQuantity) || v.inventoryQuantity < selection.quantity))
    throw new CheckoutGuardError('inventory_insufficient');
  const {shop,userId,...item} = selection;
  const verified = {...item,inventoryProof:{at:Date.now(),quantity:v.inventoryQuantity ?? null,unrestricted}};
  const provider = createShopifyCheckoutProvider({shop:SHOP,credential:deps.storefrontCredential ?? {kind:'tokenless'},fetch:deps.storefrontFetch,diagnostic:deps.diagnostic,captureReceipt:deps.captureReceipt});
  const storefrontProof = await verificationStage('storefront',()=>provider.verify(verified));
  if (deps.approval === undefined) return {result:'preflight_passed',selectionSha256:selectionDigest(selection),cartCreated:false,
    quantityRule:storefrontProof ? storefrontProof.quantityRule : undefined,
    inventory:{tracked:v.inventoryItem.tracked,quantity:v.inventoryItem.tracked && Number.isSafeInteger(v.inventoryQuantity) ? v.inventoryQuantity : null,
      verifiedAt:new Date(verified.inventoryProof.at).toISOString()}};
  authorize(selection,deps.approval);
  const current = await verificationStage('installation',deps.installation);
  if (!current || current.shop!==SHOP || current.integrationId!==install.integrationId || current.token!==install.token)
    throw new CheckoutGuardError('installation_changed');
  // Caller must commit a durable claim before prepare; never clear it after failure.
  await deps.consume();
  const receipt = await provider.prepare(verified);
  await deps.saveReceipt(receipt); // Private sink only; never logs, transcripts or analytics.
  if (await provider.status!(receipt,verified)!=='available') throw Error('cart_status_unavailable');
  return {result:'cart_validated_navigation_pending',selectionSha256:selectionDigest(selection),cartCreated:true};
}
