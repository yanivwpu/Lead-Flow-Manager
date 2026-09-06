/**
 * Origin allowlist fail-closed policy.
 * Run: npx tsx tests/webchat-origin-policy.test.ts
 */
import assert from "node:assert/strict";
import {
  canonicalizeOriginInput,
  normalizeAllowedOriginsList,
  originPairFor,
  publicWidgetEmbedDecision,
} from "../shared/webchatOriginPolicy";
import { originAllowed } from "../server/webchatAccess";

{
  const prod = { nodeEnv: "production" };
  assert.equal(canonicalizeOriginInput("http://example.com", prod), null);
  assert.equal(canonicalizeOriginInput("http://localhost:5000", prod), null);
  const https = canonicalizeOriginInput("example.com", prod);
  assert.ok(https);
  assert.equal(https?.origin, "https://example.com");
  const pair = originPairFor(https!);
  assert.ok(pair.includes("https://example.com"));
  assert.ok(pair.includes("https://www.example.com"));
}

{
  const dev = { nodeEnv: "development" };
  const local = canonicalizeOriginInput("http://localhost:5173", dev);
  assert.ok(local);
  assert.equal(local?.isLocalhost, true);
}

{
  const closed = publicWidgetEmbedDecision({ enabled: true, allowedOrigins: [] });
  assert.equal(closed.ok, false);
  if (!closed.ok) assert.equal(closed.reason, "no_origins");
  const any = publicWidgetEmbedDecision({ enabled: true, allowedOrigins: [], allowAnyOrigin: true });
  assert.equal(any.ok, true);
  const listed = publicWidgetEmbedDecision({
    enabled: true,
    allowedOrigins: ["https://www.example.com"],
  });
  assert.equal(listed.ok, true);
  const off = publicWidgetEmbedDecision({ enabled: false, allowedOrigins: ["https://www.example.com"] });
  assert.equal(off.ok, false);
  const missingEnabled = publicWidgetEmbedDecision({ allowedOrigins: ["https://www.example.com"] });
  assert.equal(missingEnabled.ok, false);
  if (!missingEnabled.ok) assert.equal(missingEnabled.reason, "disabled");
}

{
  const allowed = normalizeAllowedOriginsList(["https://example.com"], { nodeEnv: "production" });
  assert.equal(originAllowed(allowed, "https://example.com", null), true);
  assert.equal(originAllowed(allowed, "https://www.example.com", null), true);
  assert.equal(originAllowed(allowed, "https://evil.example.com", null), false);
  assert.equal(originAllowed([], "https://example.com", null), false);
  assert.equal(originAllowed([], "https://example.com", null, { allowAny: true }), true);
}

console.log("webchat-origin-policy.test.ts: all assertions passed");
