import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { contactConversationHref, contactsReturnHref, contactDetailsSuppressed, projectShopifyOrder } from "../shared/contactDetails";

test("conversation navigation chooses an existing messaging thread and encodes identities", () => {
  assert.equal(contactConversationHref("a/b", [{ id: "order", channel: "shopify" }, { id: "mail&1", channel: "email" }]), "/app/inbox/a%2Fb?conversation=mail%261");
  assert.equal(contactConversationHref("a", []), null);
  assert.equal(contactConversationHref("a", [{ id: "order", channel: "shopify" }]), null);
  for (const channel of ["whatsapp", "facebook", "instagram", "sms", "webchat", "telegram", "email"]) assert.ok(contactConversationHref("a", [{ id: "existing", channel }]));
});

test("return navigation retains every list criterion without accepting external destinations", () => {
  const list = "/app/contacts?search=Jane%20Doe&tag=Hot&channel=shopify&stage=Lead&sort=name&direction=asc&tab=all";
  assert.equal(contactsReturnHref(`returnTo=${encodeURIComponent(list)}`), list);
  for (const value of ["https://attacker.example", "/app/contacts/other", "//attacker.example", "/app/contactsevil"]) assert.equal(contactsReturnHref(`returnTo=${encodeURIComponent(value)}`), "/app/contacts");
  assert.equal(contactsReturnHref(""), "/app/contacts");
});

test("Shopify projection retains purchased products and statuses while excluding PII and tokens", () => {
  const order = projectShopifyOrder({ shop: "store.myshopify.com", orderName: "#1001", totalPrice: "42.00", currency: "USD", financialStatus: "paid", lineItems: [{ title: "Shirt", quantity: 2, properties: [{ name: "email", value: "secret" }] }], email: "private@example.com", accessToken: "secret", customer: { name: "private" } }, "2026-10-12");
  assert.equal(order.number, "#1001"); assert.equal(order.total, "42.00"); assert.equal(order.paymentStatus, "paid");
  assert.deepEqual(order.products, [{ name: "Shirt", quantity: 2 }]);
  assert.ok(!JSON.stringify(order).includes("secret")); assert.ok(!JSON.stringify(order).includes("private"));
  assert.equal(order.fulfillmentStatus, null);
  assert.deepEqual(projectShopifyOrder({ lineItems: [null, {}, { title: "Item" }] }, null).products, [{ name: "Item", quantity: null }]);
});

test("explicitly suppressed customer records fail closed", () => {
  assert.equal(contactDetailsSuppressed({ customFields: { shopifyRedacted: true } }), true);
  assert.equal(contactDetailsSuppressed({ sourceDetails: { suppressed: true } }), true);
  assert.equal(contactDetailsSuppressed({}), false);
});

test("Contacts opens details on desktop/mobile and retains independent Inbox deep links", () => {
  const list = readFileSync("client/src/pages/Contacts.tsx", "utf8");
  assert.ok(list.includes('openContact(contact.id)'));
  assert.ok(!list.includes('navigate(`/app/inbox/${contact.id}`)'));
  const layout = readFileSync("client/src/pages/AppLayout.tsx", "utf8");
  assert.ok(layout.includes('path="/app/contacts/:id"'));
  assert.ok(layout.includes('path="/app/inbox/:contactId?"'));
  const page = readFileSync("client/src/pages/ContactDetails.tsx", "utf8");
  assert.ok(page.includes('lg:grid-cols-'));
  assert.ok(page.includes('enabled: Boolean(details.data && user && !details.isError)'));
  assert.ok(page.includes('"PATCH", patch'));
  assert.ok(page.includes('"POST", { content: note.trim() }'));
  assert.ok(page.includes('field in draft'));
});
