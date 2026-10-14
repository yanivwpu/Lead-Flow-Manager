import test from "node:test";
import assert from "node:assert/strict";
import { createContactDetailsHandler } from "../server/contactDetailsRoute";

async function invoke({ owner = "owner", authenticated = true, locked = false, suppressed = false, failure = false } = {}) {
  const calls: string[] = [];
  let code = 200; let body: any;
  const contact: any = { id: "contact", userId: owner, name: "Customer", customFields: suppressed ? { shopifyRedacted: true } : {}, source: "whatsapp" };
  const handler = createContactDetailsHandler({
    getContact: async (id, userId) => { assert.equal(id, "contact"); assert.equal(userId, "owner"); calls.push("contact"); return contact; },
    getConversations: async () => { calls.push("conversations"); return [{ id: "thread", userId: "owner", channel: "email" }, { id: "foreign", userId: "other", channel: "whatsapp" }] as any; },
    getActivityEvents: async () => { calls.push("activity"); return [{ id: "order", userId: "owner", eventType: "shopify_order_created", eventData: { orderName: "#1", totalPrice: "19.00", currency: "USD", email: "secret", lineItems: [{ title: "Book", quantity: 1 }] }, createdAt: new Date() }, { id: "foreign-event", userId: "other", eventType: "shopify_order_created", eventData: { orderName: "PRIVATE" } }] as any; },
  isPrivacyLocked: async () => { calls.push("privacy"); if (failure) throw new Error("privacy unavailable"); return locked; } });
  await handler({ user: authenticated ? { id: "owner" } : undefined, params: { id: "contact" } } as any, { status: (value: number) => { code = value; return { json: (value: any) => { body = value; } }; }, json: (value: any) => { body = value; } } as any, () => {});
  return { code, body, calls };
}

test("unauthenticated requests fetch no contact data", async () => {
  const result = await invoke({ authenticated: false }); assert.equal(result.code, 401); assert.deepEqual(result.calls, []);
});
test("cross-tenant contact ids fetch no related data or privacy identities", async () => {
  const result = await invoke({ owner: "another-workspace" }); assert.equal(result.code, 404); assert.deepEqual(result.calls, ["contact"]); assert.ok(!JSON.stringify(result.body).includes("Customer"));
});
test("redacted and privacy-locked records fail closed before loading related data", async () => {
  for (const options of [{ locked: true }, { suppressed: true }]) {
    const result = await invoke(options); assert.equal(result.code, 410); assert.ok(!result.calls.includes("activity")); assert.ok(!result.calls.includes("conversations"));
  }
  const failed = await invoke({ failure: true }); assert.equal(failed.code, 500); assert.deepEqual(failed.calls, ["contact", "privacy"]);
});
test("authorized response filters related tenant rows and allowlists commerce fields", async () => {
  const result = await invoke(); assert.equal(result.code, 200);
  assert.deepEqual(result.calls, ["contact", "privacy", "conversations", "activity"]);
  assert.deepEqual(result.body.conversations, [{ id: "thread", channel: "email" }]);
  assert.equal(result.body.orders[0].number, "#1"); assert.equal(result.body.orders.length, 1);
  assert.ok(!JSON.stringify(result.body).includes("PRIVATE")); assert.ok(!JSON.stringify(result.body).includes("secret"));
});
