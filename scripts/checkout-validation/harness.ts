import { createHash } from 'node:crypto';
import { z } from 'zod';
import { compareMoney } from '../../shared/shoppingAssistant';
import { createShopifyCheckoutProvider } from '../../server/shopping/checkout/shopify';
import { isShopifyProductPublished } from '../../server/salesCatalog/shopify/publication';
import { SHOPIFY_INVENTORY_BATCH_QUERY } from '../../server/salesCatalog/shopify/inventory';
import type { CatalogRequest } from '../../server/salesCatalog/shopify/api';

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
  approval?: unknown;
  consume: () => Promise<void>;
  saveReceipt: (receipt: unknown)=>Promise<void>;
}) {
  const selection = selectionSchema.parse(raw);
  if (deps.approval !== undefined) authorize(selection,deps.approval);
  const install = await deps.installation();
  if (!install || install.shop !== SHOP) throw Error('installation_unavailable');
  const request = deps.requestFor(SHOP, install.token);
  const meta = await request(META);
  const scopes = meta.currentAppInstallation?.accessScopes?.map((s:any)=>s.handle);
  if (meta.shop?.myshopifyDomain !== SHOP || meta.shop?.plan?.partnerDevelopment !== true ||
      meta.currentAppInstallation?.app?.apiKey !== 'e4585d4da1434c9e5649a2269e716076' ||
      !Array.isArray(scopes) || !['read_products','read_inventory'].every(s=>scopes.includes(s)))
    throw Error('development_installation_not_attested');
  const data = await request(SHOPIFY_INVENTORY_BATCH_QUERY,{ids:[selection.variantId]});
  const v = data.nodes?.[0];
  if (data.shop?.myshopifyDomain !== SHOP || data.shop.currencyCode !== selection.currency ||
      !Array.isArray(data.nodes) || data.nodes.length !== 1 || v?.id !== selection.variantId ||
      v.product?.id !== selection.productId || !isShopifyProductPublished(v.product) ||
      v.availableForSale !== true || v.requiresComponents !== false ||
      typeof v.price !== 'string' || !/^\d+(?:\.\d{1,6})?$/.test(v.price) || compareMoney(v.price,selection.price)!==0 ||
      JSON.stringify(v.selectedOptions)!==JSON.stringify(selection.options) ||
      typeof v.inventoryItem?.tracked !== 'boolean' || !['CONTINUE','DENY'].includes(v.inventoryPolicy))
    throw Error('catalog_selection_unavailable_or_changed');
  const unrestricted = v.inventoryItem.tracked === false || v.inventoryPolicy === 'CONTINUE';
  if (!unrestricted && (!Number.isSafeInteger(v.inventoryQuantity) || v.inventoryQuantity < selection.quantity))
    throw Error('inventory_insufficient');
  const {shop,userId,...item} = selection;
  const verified = {...item,inventoryProof:{at:Date.now(),quantity:v.inventoryQuantity ?? null,unrestricted}};
  const provider = createShopifyCheckoutProvider({shop:SHOP,credential:{kind:'tokenless'},fetch:deps.storefrontFetch});
  await provider.verify(verified);
  if (deps.approval === undefined) return {result:'preflight_passed',selectionSha256:selectionDigest(selection),cartCreated:false};
  authorize(selection,deps.approval);
  const current = await deps.installation();
  if (!current || current.shop!==SHOP || current.integrationId!==install.integrationId || current.token!==install.token)
    throw Error('installation_changed');
  // Exclusive durable local claim precedes prepare. Never delete/reclaim after any failure.
  await deps.consume();
  const receipt = await provider.prepare(verified);
  await deps.saveReceipt(receipt); // Protected local file; never stdout/CI artifacts.
  if (await provider.status!(receipt,verified)!=='available') throw Error('cart_status_unavailable');
  return {result:'cart_validated_navigation_pending',selectionSha256:selectionDigest(selection),cartCreated:true};
}
