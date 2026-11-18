/**
 * Manual, fail-closed Shopify legacy-token migration cohorts.
 *
 * NEVER imported by app, worker, cron, HTTP or startup.
 * Max three explicitly named existing merchants per invocation.
 * --preflight --shops=shop1.myshopify.com,shop2.myshopify.com  (read-only)
 * --convert --shops=... --acknowledge-invalidate-legacy-for=<same comma list>
 *
 * Invokes the pilot-proven one-merchant operator sequentially. Stop at the
 * FIRST ambiguous result or failure; NO retries or automatic resumption.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const EXPECTED_ENVIRONMENT = "fa2e8c30-72ea-4688-877f-4a68e24198bc";
const EXPECTED_SERVICE = "a7b75139-5bf8-4a02-b4ab-b7d12e17e770";
const INTERNAL = new Set([
  "whachatcrm-live-test.myshopify.com",
  "whachatcrm.myshopify.com",
]);
const MAX_COHORT = 3;
const ONE_SHOP_OPERATOR = path.join(__dirname, "shopify-offline-merchant-operator.cjs");

type SafeResult = {
  shop: string;
  status: string;
  encryptedPairPresent?: boolean;
};

function output(value: Record<string, unknown>) {
  console.log(JSON.stringify(value));
}

function parseArguments() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const match = args[1]?.match(/^--shops=(.+)$/);
  const list = match?.[1] || "";
  const shops = list.split(",");
  const expectedAck = "--acknowledge-invalidate-legacy-for=" + list;
  const validMode = (mode === "--preflight" && args.length === 2)
    || (mode === "--convert" && args.length === 3 && args[2] === expectedAck);
  const validShops = shops.length >= 1 && shops.length <= MAX_COHORT
    && shops.every(shop =>
      /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)
      && !INTERNAL.has(shop))
    && new Set(shops).size === shops.length;
  if (!validMode || !validShops)
    throw new Error("invalid_explicit_cohort_arguments");
  if (process.env.RAILWAY_ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT
      || process.env.RAILWAY_SERVICE_ID !== EXPECTED_SERVICE)
    throw new Error("wrong_environment_or_service");
  return { mode, shops };
}

function runOne(shop: string, mode: "--preflight" | "--convert"): SafeResult {
  const args = [ONE_SHOP_OPERATOR, mode, "--shop=" + shop];
  if (mode === "--convert")
    args.push("--acknowledge-invalidate-legacy-for=" + shop);
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 1024 * 1024,
    shell: false,
    env: process.env,
  });
  // Never log child stdout/stderr or provider details; JSON status only.
  if (result.error || result.status !== 0 || result.signal)
    throw new Error("one_shop_operator_failed_or_timed_out");
  const matches = (result.stdout || "").split(/\r?\n/)
    .flatMap(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === "object" ? [parsed] : [];
      } catch {
        return [];
      }
    })
    .filter(parsed => parsed.shop === shop && typeof parsed.status === "string");
  if (matches.length !== 1)
    throw new Error("ambiguous_merchant_operator_result");
  return {
    shop,
    status: String(matches[0].status),
    encryptedPairPresent: matches[0].encryptedPairPresent === true,
  };
}

async function main() {
  let confirmedConverted = 0;
  let currentShop = "";
  try {
    const { mode, shops } = parseArguments();
    // Preflight ALL proposed cohort shops before exchanging ANY legacy token.
    for (const shop of shops) {
      currentShop = shop;
      if (runOne(shop, "--preflight").status !== "ready")
        throw new Error("preflight_not_ready");
    }
    if (mode === "--preflight") {
      output({ status: "ready", shopsChecked: shops.length, converted: 0 });
      return;
    }
    for (const shop of shops) {
      currentShop = shop;
      // Single-store operator repeats preflight immediately before irreversible exchange,
      // and checks that the new encrypted pair is stored with active status.
      const result = runOne(shop, "--convert");
      if (result.status !== "converted_pair_stored" || !result.encryptedPairPresent)
        throw new Error("conversion_not_confirmed");
      confirmedConverted++;
      output({ shop, status: "converted_pair_stored", confirmedConverted });
    }
    output({ status: "cohort_converted", confirmedConverted });
  } catch (error) {
    const allowed = new Set([
      "invalid_explicit_cohort_arguments",
      "wrong_environment_or_service",
      "preflight_not_ready",
      "one_shop_operator_failed_or_timed_out",
      "ambiguous_merchant_operator_result",
      "conversion_not_confirmed",
    ]);
    const code = error instanceof Error && allowed.has(error.message)
      ? error.message : "operator_unavailable";
    output({ status: "blocked", shop: currentShop || null, confirmedConverted, code });
    process.exitCode = 1;
  }
}
void main();
