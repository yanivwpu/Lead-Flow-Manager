import { db } from "../../../drizzle/db";
import { createShopifyCatalogSync } from "./sync";
import { HOST } from "../../shopify";
import { createCatalogWebhookRegistrar } from "./registration";
import { shopifyCatalogClient, shopifyCatalogRequest } from "./api";
export const shopifyCatalogSync = createShopifyCatalogSync(
  db,
  shopifyCatalogRequest,
  createCatalogWebhookRegistrar(db, shopifyCatalogClient, HOST),
);
let running = false;
export async function runShopifyCatalogTick() {
  if (running) return;
  running = true;
  try {
    const deadline = Date.now() + 20_000;
    while (await shopifyCatalogSync.tick()) {
      if (Date.now() >= deadline) break;
    }
  } catch {
    console.warn("[CatalogSync] Worker temporarily unavailable");
  } finally {
    running = false;
  }
}
