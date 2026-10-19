import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("merchant review endpoint is staging-only and verifies session, same origin and installed shop", () => {
  const routes = readFileSync("server/shopifyRoutes.ts","utf8");
  const start = routes.indexOf("router.post('/ecommerce/event-review'");
  const end = routes.indexOf("router.get('/webhooks/health/all'",start);
  assert.ok(start >= 0 && end > start);
  const route = routes.slice(start,end);
  for (const guard of ["RAILWAY_ENVIRONMENT_NAME !== 'staging'", "req.user", "req.get('origin')",
    "parseReviewEventRequest(req.body)", "getUserForSession(accountId)",
    "isShopifyContactInstallationActive(owner)", "integration?.isActive",
    "markEventReviewedQuery(parsed.eventId, accountId, shop)"])
    assert.ok(route.includes(guard),guard);
  for(const forbidden of ["sendMessage", "cartCreate", "triggerCommerceEventWorkflows",
    "dispatchCommerceEventAutomation", "req.query", "req.body.accountId", "req.body.shop"])
    assert.ok(!route.includes(forbidden),forbidden);
  assert.ok(route.includes("status(409)"));
});
test("review queue carries bounded event metadata only and never exposes delivery or customer details",()=>{
  const sql = readFileSync("server/ecommerce/reviewQueue.ts","utf8");
  const view = readFileSync("client/src/components/integrations/ShopifyEcommerceInboxPreview.tsx","utf8");
  assert.match(sql,/LIMIT 20/);
  assert.match(sql,/UPDATE ecommerce_growth_event_inbox SET state = 'reviewed'/);
  assert.match(sql,/AND account_id = \$\{accountId\} AND shop = \$\{shop\} AND state = 'pending'/);
  assert.match(sql,/RETURNING id::text AS id/);
  assert.ok(!sql.includes("delivery_id"));
  assert.ok(!sql.includes("email"));
  assert.ok(view.includes("Mark reviewed"));
  assert.ok(view.includes("mark_reviewed"));
  assert.ok(view.includes("It does not contact the customer"));
});
