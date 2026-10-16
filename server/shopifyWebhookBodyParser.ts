import express, { type Express } from "express";
/** Mount before global parsers. All Shopify HMAC handlers need the exact incoming bytes. */
export function registerShopifyWebhookBodyParser(app: Express) {
  app.use(
    ["/api/shopify/webhooks", "/api/shopify/catalog-webhooks"],
    express.json({
      verify: (req, _res, bytes) => {
        (req as any).rawBody = bytes;
      },
    }),
  );
}
