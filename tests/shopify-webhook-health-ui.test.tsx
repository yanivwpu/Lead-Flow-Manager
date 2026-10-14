import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ShopifyWebhookHealthSummary } from "../client/src/components/integrations/ShopifyWebhookHealthSummary";
import { buildShopWebhookHealthReport } from "../server/shopifyWebhookHealthAudit";

test("Admin summary separates unknown grants, reported approval, and live registration", () => {
  const report = buildShopWebhookHealthReport({ shop: "test.myshopify.com", host: "https://crm.example.com", requestedScopes: ["read_orders", "read_customers"], scopes: { status: "unknown", grantedScopes: [], reason: "Unavailable" }, subscriptions: { status: "unknown", listed: [] } });
  const html = renderToStaticMarkup(<ShopifyWebhookHealthSummary report={report} />);
  for (const text of ["Verification Unavailable", "Requested scopes", "Verified granted scopes", "Missing scopes: Unknown", "Unknown permission status", "June 25, 2026", "live registration unverified", "Recommended action", "delivery and processing have not been tested"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes(">Healthy<"));
});
