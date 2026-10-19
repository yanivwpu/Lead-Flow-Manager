import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("staging preview route only reads scoped inbox aggregate and never accepts caller shop/account IDs", () => {
  const routes = readFileSync("server/shopifyRoutes.ts", "utf8");
  const begin = routes.indexOf("router.get('/ecommerce/event-inbox-preview'");
  const end = routes.indexOf("router.get('/webhooks/health'", begin);
  assert.ok(begin >= 0 && end > begin, "read-only endpoint must exist");
  const endpoint = routes.slice(begin, end);
  assert.match(endpoint, /RAILWAY_ENVIRONMENT_NAME !== 'staging'/);
  assert.match(endpoint, /req\.user/);
  assert.match(endpoint, /getUserForSession\(accountId\)/);
  assert.match(endpoint, /isShopifyContactInstallationActive\(owner\)/);
  assert.match(endpoint, /integration\?\.isActive/);
  assert.match(endpoint, /WHERE account_id = \$\{accountId\} AND shop = \$\{shop\}/);
  assert.match(endpoint, /COUNT\(\*\)/);
  for (const forbidden of ["req.query", "req.body", "INSERT INTO", "UPDATE ecommerce", "sendMessage", "cartCreate"])
    assert.equal(endpoint.includes(forbidden), false, forbidden);
});
test("staging UI shows counters and never gives an activate or send action", () => {
  const view = readFileSync("client/src/components/integrations/ShopifyEcommerceInboxPreview.tsx", "utf8");
  assert.match(view, /useAuth\(/);
  assert.match(view, /withUserQueryScope\(/);
  assert.match(view, /hostname === "whachatcrm-staging-app-staging\.up\.railway\.app"/);
  assert.match(view, /Recording mode/);
  assert.match(view, /Recorded events/);
  assert.match(view, /Pending review/);
  assert.equal(view.includes('method: "POST"'),false);
  assert.equal(view.includes('Activate</Button>'),false);
});
