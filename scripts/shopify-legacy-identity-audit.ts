/**
 * Shopify legacy-store identity diagnostic, manually invoked / read-only.
 * Does not perform migration, token refresh, customer sends, or database writes.
 * Runs the existing protected merchant preflight separately for every named shop,
 * including those that return BLOCKED, and prints ONLY bounded sanitized status.
 *
 * Example: node dist/shopify-legacy-identity-audit.cjs --audit --shops=shop1.myshopify.com,shop2.myshopify.com
 * Max six stores; excludes internal WhachatCRM shops.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const EXPECTED_ENVIRONMENT = "fa2e8c30-72ea-4688-877f-4a68e24198bc";
const EXPECTED_SERVICE = "a7b75139-5bf8-4a02-b4ab-b7d12e17e770";
const MAX_SHOPS = 6;
const EXCLUDED = new Set([
  "whachatcrm-live-test.myshopify.com",
  "whachatcrm.myshopify.com",
]);
const MERCHANT_OPERATOR = path.join(__dirname, "shopify-offline-merchant-operator.cjs");

type SafeRow = {
  shop: string;
  status: "ready" | "blocked" | "already_migrated" | "unavailable";
  code?: string;
};

function parseShopList() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--audit" || !args[1].startsWith("--shops="))
    throw new Error("usage_requires_readonly_audit_and_explicit_shops");
  const shops = args[1].slice("--shops=".length).split(",");
  if (shops.length === 0 || shops.length > MAX_SHOPS
    || new Set(shops).size !== shops.length
    || shops.some(shop => !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)
      || EXCLUDED.has(shop)))
    throw new Error("invalid_shop_list");
  if (process.env.RAILWAY_ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT
      || process.env.RAILWAY_SERVICE_ID !== EXPECTED_SERVICE)
    throw new Error("wrong_environment_or_service");
  return shops;
}

function checkOne(shop: string): SafeRow {
  const result = spawnSync(process.execPath, [
    MERCHANT_OPERATOR, "--preflight", "--shop=" + shop,
  ], {
    shell: false, encoding: "utf8", env: process.env,
    timeout: 90000, maxBuffer: 1024 * 1024,
  });
  // Suppress ALL child logs / errors, and never print provider responses.
  if (result.error || result.signal) {
    return { shop, status: "unavailable", code: "preflight_execution_unavailable" };
  }
  const matching = (result.stdout || "").split(/\r?\n/).flatMap(line => {
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null
        || !("shop" in parsed) || !("status" in parsed))
        return [];
      const row = parsed as Record<string, unknown>;
      return row.shop === shop ? [row] : [];
    } catch {
      return [];
    }
  });
  if (matching.length !== 1)
    return { shop, status: "unavailable", code: "ambiguous_operator_result" };

  const row = matching[0];
  if (result.status === 0 && row.status === "ready")
    return { shop, status: "ready" };
  if (result.status === 0 && row.status === "already_migrated")
    return { shop, status: "already_migrated" };
  if (row.status === "blocked"
      && typeof row.code === "string"
      && /^[a-z0-9_]{1,80}$/.test(row.code))
    return { shop, status: "blocked", code: row.code };
  return { shop, status: "unavailable", code: "unexpected_preflight_result" };
}

function main() {
  try {
    const shops = parseShopList();
    const results = shops.map(checkOne); // No fail-fast for read-only diagnostics.
    const readyCount = results.filter(result => result.status === "ready").length;
    const blockedCount = results.filter(result => result.status !== "ready").length;
    // Never print/forward raw token values, database records or provider errors.
    console.log(JSON.stringify({ status: "read_only_audit_complete", checked: results.length,
      ready: readyCount, notReady: blockedCount, converted: 0, results }));
  } catch (error) {
    const code = error instanceof Error && [
      "usage_requires_readonly_audit_and_explicit_shops",
      "invalid_shop_list", "wrong_environment_or_service",
    ].includes(error.message) ? error.message : "audit_unavailable";
    console.log(JSON.stringify({ status: "blocked", code, converted: 0 }));
    process.exitCode = 1;
  }
}
main();
