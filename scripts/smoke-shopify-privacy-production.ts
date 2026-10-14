// No app, dotenv, database, scheduler or transport import before authorization gates.
import { productionSmokeConfig, verifyProductionSmokeDatabase, verifyProductionSmokeReceiver,
  verifyProductionSmokeSender, productionSmokeDelivery, recordProductionSmoke, PRODUCTION_SMOKE_ID } from "../server/shopifyPrivacyProductionSmoke";

async function main() {
  let stage = "configuration", accepted = false, providerMessageId: string | null = null;
  let providerCalls = 0;
  let delivery: ReturnType<typeof productionSmokeDelivery> | undefined;
  let pool: import("pg").Pool | undefined;
  let server: import("node:http").Server | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    if (process.argv.slice(2).join(" ") !== "--send-one-production-test") throw Error("explicit_command_required");
    const config = productionSmokeConfig();
    watchdog = setTimeout(() => {
      console.error(JSON.stringify({ stage: "timeout", result: "acceptance_unconfirmed" })); process.exit(1);
    }, 120000);
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: config.connectionString, max: 1, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
    pool.on("error", () => {}); // Driver events must not expose connection details.
    stage = "database_identity";
    await verifyProductionSmokeDatabase(pool);
    stage = "production_receiver";
    await verifyProductionSmokeReceiver(config.receiver, process.env.SHOPIFY_PRIVACY_ALERT_TOKEN!);
    stage = "resend_sender";
    await verifyProductionSmokeSender();
    const { default: express } = await import("express");
    const { registerShopifyPrivacyAlertReceiver } = await import("../server/shopifyPrivacyAlertEmail");
    const { sendEmailDetailed } = await import("../server/email");
    const app = express();
    const receiverEnv = { ...process.env }; // Only the private test receiver is enabled in memory.
    delivery = productionSmokeDelivery(pool, config.expires, async () => {
      stage = "resend_acceptance";
      providerCalls++;
      const result = await sendEmailDetailed({
        to: "support@whachatcrm.com", from: process.env.RESEND_FROM_EMAIL,
        subject: "PRODUCTION TEST — Shopify Privacy Alert",
        text: "Authorized synthetic Shopify privacy alert transport test. No merchant/customer data or privacy request. No action required.",
        html: "<p>Authorized synthetic Shopify privacy alert transport test. No merchant/customer data or privacy request. No action required.</p>",
        privacyContext: "shopify", idempotencyKey: `shopify-privacy-production-smoke-${PRODUCTION_SMOKE_ID}`,
      });
      accepted = result.ok && !!result.providerMessageId;
      providerMessageId = accepted ? result.providerMessageId : null;
      return accepted;
    });
    registerShopifyPrivacyAlertReceiver(app, delivery.deliver, receiverEnv);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => { server!.once("listening", resolve); server!.once("error", reject); });
    const endpoint = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/api/internal/shopify/privacy-alerts`;
    const post = (authorized: boolean) => fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", "Idempotency-Key": `shopify-privacy-${PRODUCTION_SMOKE_ID}`,
        ...(authorized ? { Authorization: `Bearer ${receiverEnv.SHOPIFY_PRIVACY_ALERT_TOKEN}` } : {}) },
      body: JSON.stringify({ alertId: PRODUCTION_SMOKE_ID }) });
    stage = "private_receiver_isolation";
    if ((await post(false)).status !== 401 || (await post(true)).status !== 503 || providerCalls !== 0)
      throw Error("private_receiver_preflight_failed");
    receiverEnv.SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED = "true";
    stage = "durable_consumption";
    if (!(await post(true)).ok || !accepted || !providerMessageId || providerCalls !== 1) throw Error("acceptance_unconfirmed");
    if (!(await post(true)).ok || providerCalls !== 1) throw Error("duplicate_prevention_failed");
    stage = "production_still_disabled";
    await verifyProductionSmokeReceiver(config.receiver, process.env.SHOPIFY_PRIVACY_ALERT_TOKEN!);
    console.log(JSON.stringify({ stage: "verified", resendAccepted: true, providerMessageId, providerCalls, inboxReceiptVerified: false }));
  } catch {
    console.error(JSON.stringify({ stage, result: "failed_closed", resendAccepted: accepted, providerMessageId, providerCalls }));
    process.exitCode = 1;
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (pool && delivery?.consumed) {
      try { await recordProductionSmoke(pool, accepted, providerMessageId); }
      catch { console.error(JSON.stringify({ stage: "receipt", result: "recording_failed", resendAccepted: accepted, providerMessageId })); process.exitCode = 1; }
    }
    await pool?.end();
    if (watchdog) clearTimeout(watchdog);
  }
}
void main().catch(() => { console.error(JSON.stringify({ stage: "shutdown", result: "failed_closed" })); process.exitCode = 1; });
