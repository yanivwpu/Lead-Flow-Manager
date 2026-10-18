#!/usr/bin/env node
/**
 * Read-only development-store Storefront API isolation.
 * Run from a trusted server runtime only. Never run in a merchant/browser session.
 * Required: SHOPIFY_STOREFRONT_TEST_TOKEN; SHOPIFY_STOREFRONT_TEST_TOKEN_KIND=public|private.
 * No Admin tokens, carts, customer data, tokens, response bodies or free-form errors logged.
 */
const SHOP = 'whachatcrm.myshopify.com';
const VERSION = '2026-10';
const ID = 'gid://shopify/ProductVariant/51638768632090';
const TOKEN = process.env.SHOPIFY_STOREFRONT_TEST_TOKEN;
const KIND = process.env.SHOPIFY_STOREFRONT_TEST_TOKEN_KIND;
if (!TOKEN || !['public', 'private'].includes(KIND)) {
  console.error('Missing dedicated Storefront test token or valid token kind (public|private).');
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
        contentType: /(?:^|\\/)json(?:;|$)|\\+json/i.test(type) ? 'JSON' : /^text\\/html/i.test(type) ? 'HTML' : 'other',
        errorCode: 'none', lockedChannel: false, hasData: false,
      };
      // Never print the raw response body or arbitrary provider error strings.
      if (summary.contentType === 'JSON') {
        const raw = await response.text();
        if (Buffer.byteLength(raw, 'utf8') <= 16384) {
          try {
            const data = JSON.parse(raw);
            summary.hasData = !!data?.data;
            if (Array.isArray(data?.errors) && data.errors.length) {
              const codes = data.errors.map(e => e?.extensions?.code);
              summary.errorCode = codes.length === 1 && ['BAD_REQUEST','ACCESS_DENIED','GRAPHQL_VALIDATION_FAILED','THROTTLED'].includes(codes[0]) ? codes[0] : 'other';
              summary.lockedChannel = data.errors.some(e => e?.message === 'Online Store channel is locked.');
            }
          } catch { summary.errorCode = 'invalid_json'; }
        } else {summary.errorCode = 'body_over_limit';}
      }
      console.log(JSON.stringify(summary));
    } catch {
      console.log(JSON.stringify({test:name, utc:started, category:'transport_or_timeout'}));
    }
  }
}
