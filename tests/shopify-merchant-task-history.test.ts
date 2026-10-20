import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Shopify Tasks keeps open work visible and completed history collapsed with customer navigation",()=>{
  const view=readFileSync("client/src/components/followups/ShopifyOrderSupportTasks.tsx","utf8");
  assert.match(view,/const openTasks = .*\.filter\(task => task\.state === "open"\)/);
  assert.match(view,/const completedTasks = .*\.filter\(task => task\.state === "completed"\)/);
  assert.match(view,/<details className="mt-3 rounded-lg border border-slate-200" data-testid="shopify-completed-tasks">/);
  assert.match(view,/Completed \(\{tasks.completedCount\}\)/);
  assert.match(view,/completedTasks\.map\(task => \(/);
  assert.match(view,/Customer & orders/);
  assert.match(view,/setLocation\(`\/app\/contacts\/\$\{task.contactId\}`\)/);
  assert.match(view,/Recent completed tasks only/);
  assert.match(view,/Only the latest tasks appear here/);
  // The task history is a read-through of existing records, not a second order system.
  assert.doesNotMatch(view,/\/api\/shopify\/orders|\/api\/orders\/|\/api\/contacts\/.*PATCH/);
  assert.doesNotMatch(view,/sendMessage|sendWhatsApp|cartCreate\(/);
});

test("Shopify purchases already live on the customer profile and use allowlisted persisted events",()=>{
  const contact=readFileSync("client/src/pages/ContactDetails.tsx","utf8");
  const handler=readFileSync("server/contactDetailsRoute.ts","utf8");
  const projection=readFileSync("shared/contactDetails.ts","utf8");
  const description=readFileSync("client/src/pages/Integrations.tsx","utf8");
  assert.match(contact,/aria-label="Shopify purchases"/);
  for (const value of ["order.number","order.products.map","order.paymentStatus","order.fulfillmentStatus"]) {
    assert.ok(contact.includes(value),value);
  }
  assert.match(handler,/event\.eventType === "shopify_order_created"/);
  assert.match(handler,/getActivityEvents\(contact\.id, req\.user\.id, 200\)/);
  assert.match(handler,/contactDetailsSuppressed\(contact\)/);
  assert.match(handler,/projectShopifyOrder\(/);
  assert.match(projection,/number: text\(data.orderName\)/);
  assert.match(description,/Customers, orders & support tasks/);
  assert.doesNotMatch(description,/tagline: "Orders, customers & abandoned carts"/);
});
