#!/usr/bin/env node
/**
 * Read-only development-store Storefront API isolation.
 * Run from a trusted server runtime only. Never run in a merchant/browser session.
 * Required: SHOPIFY_STOREFRONT_TEST_TOKEN; SHOPIFY_STOREFRONT_TEST_TOKEN_KIND=private.\n * Guard: SHOPIFY_STOREFRONT_TEST_RUN_ONCE=yes (explicit one-shot opt-in).
 * No Admin tokens, carts, customer data, tokens, response bodies or free-form errors logged.
 */
const SHOP = 'whachatcrm.myshopify.com';
const VERSION = '2026-10';
const ID = 'gid://shopify/ProductVariant/51638768632090';
const TOKEN = process.env.SHOPIFY_STOREFRONT_TEST_TOKEN;
const MAX_BYTES = 16 * 1024;
async function readLimitedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) return {error: 'unreadable_body'};
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return {error: 'body_over_limit'};
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks.map(v => Buffer.from(v)));
    try {return {data: JSON.parse(bytes.toString('utf8'))};}
    catch {return {error: 'invalid_json'};}
  } finally {
    reader.releaseLock();
  }
}
const KIND = process.env.SHOPIFY_STOREFRONT_TEST_TOKEN_KIND;
if (!TOKEN || KIND !== 'private' || process.env.SHOPIFY_STOREFRONT_TEST_RUN_ONCE !== 'yes') {
  console.error('Missing private Storefront token, private token kind, or one-shot opt-in.');
  process.exitCode = 2;
} else {
  const headerName = KIND === 'private'
    ? 'Shopify-Storefront-Private-Token'
    : 'X-Shopify-Storefront-Access-Token';
  const selections = [
    ['minimal', 'id availableForSale price { amount currencyCode }'],
    ['quantityRule', 'id quantityRule { minimum maximum increment }'],
    ['requiresComponents', 'id requiresComponents'],
    ['requiresSellingPlan', 'id product { id requiresSellingPlan }'],
    ['inventoryScope', 'id quantityAvailable currentlyNotInStock'],
    ['complete', 'id availableForSale quantityRule { minimum maximum increment } requiresComponents selectedOptions { name value } price { amount currencyCode } product { id requiresSellingPlan }'],
  ];
  const endpoint = `https://${SHOP}/api/${VERSION}/graphql.json`;
  for (const [name, fields] of selections) {
    const started = new Date().toISOString();
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {'Content-Type': 'application/json', [headerName]: TOKEN},
        body: JSON.stringify({
          query: `query CheckoutVariant($id: ID!) { node(id: $id) { ... on ProductVariant { ${fields} } } }`,
          variables: {id: ID},
        }),
      });
      const version = response.headers.get('x-shopify-api-version');
      const type = response.headers.get('content-type') || '';
      const summary = {
        test: name, utc: started, status: response.status,
        apiVersionMatch: version === VERSION,
        contentType: type.toLowerCase().includes('json') ? 'JSON' : type.toLowerCase().startsWith('text/html') ? 'HTML' : 'other',
        errorCode: 'none', lockedChannel: false, hasData: false, variantReturned: false, variantIdMatches: false, inventoryFieldsAccessible: null, verifiedPrice: null, verifiedCurrency: null,
      };
      // Never print the raw response body or arbitrary provider error strings.
      if (summary.contentType === 'JSON') {
        const parsed = await readLimitedJson(response);
        if (parsed.error) {
          summary.errorCode = parsed.error;
        } else {
          const data = parsed.data;
          summary.hasData = !!data?.data;
          summary.variantReturned = !!data?.data?.node;
          summary.variantIdMatches = data?.data?.node?.id === ID;
          if (name === 'minimal' && summary.variantIdMatches && /^\d+(?:\.\d{1,6})?$/.test(data?.data?.node?.price?.amount) && /^[A-Z]{3}$/.test(data?.data?.node?.price?.currencyCode)) {
            summary.verifiedPrice = data.data.node.price.amount;
            summary.verifiedCurrency = data.data.node.price.currencyCode;
          }
          if (name === 'inventoryScope') summary.inventoryFieldsAccessible = Number.isSafeInteger(data?.data?.node?.quantityAvailable) && typeof data?.data?.node?.currentlyNotInStock === 'boolean';
          if (Array.isArray(data?.errors) && data.errors.length) {
            const codes = data.errors.map(e => e?.extensions?.code);
            summary.errorCode = codes.length === 1 && ['BAD_REQUEST','ACCESS_DENIED','GRAPHQL_VALIDATION_FAILED','THROTTLED'].includes(codes[0]) ? codes[0] : 'other';
            summary.lockedChannel = data.errors.some(e => e?.message === 'Online Store channel is locked.');
          }
        }
      }
      console.log(JSON.stringify(summary));
    } catch {
      console.log(JSON.stringify({test:name, utc:started, category:'transport_or_timeout'}));
    }
  }
}
