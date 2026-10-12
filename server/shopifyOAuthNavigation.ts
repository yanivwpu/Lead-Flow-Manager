import crypto from "node:crypto";
import type { Response } from "express";

/** A 302 preserves the frame. Authorize only after this document is top-level. */
export function sendShopifyOAuthNavigation(res: Response, destination: string): void {
  const nonce = crypto.randomBytes(16).toString("base64");
  const scriptUrl = JSON.stringify(destination).replace(/</g, "\\u003c");
  const href = destination.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors https://admin.shopify.com https://*.myshopify.com`,
  });
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>Connect WhachatCRM</title></head><body>
<p>Continue to WhachatCRM in a browser tab.</p>
<a href="${href}" target="_top">Continue to WhachatCRM</a>
<p>If Shopify blocks this action, <a href="${href}" target="_blank" rel="noopener noreferrer">open WhachatCRM in a new tab</a>.</p>
<script nonce="${nonce}">
if (window.self === window.top) window.location.replace(${scriptUrl});
else {
  // Escape to this app document first. Never send a login page into the iframe.
  try { window.top.location.href = window.location.href; } catch (_) {}
}
</script></body></html>`);
}
