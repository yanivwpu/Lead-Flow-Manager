import test from "node:test";
import assert from "node:assert/strict";
import { catalogReconciliationIntervalMs } from "../server/salesCatalog/shopify/reconciliation";
const HOUR = 60 * 60_000,
  DAY = 24 * HOUR;
test("full recovery defaults daily and configuration cannot create a busy loop", () => {
  assert.equal(catalogReconciliationIntervalMs(0, 0, {}), DAY);
  assert.equal(catalogReconciliationIntervalMs(1000, 0, {}), DAY);
  assert.equal(
    catalogReconciliationIntervalMs(1000, 0, {
      SHOPIFY_CATALOG_RECONCILE_INTERVAL_HOURS: "48",
    }),
    2 * DAY,
  );
  for (const bad of ["0", "-1", "NaN", "Infinity", "", "721"])
    assert.equal(
      catalogReconciliationIntervalMs(0, 0, {
        SHOPIFY_CATALOG_RECONCILE_INTERVAL_HOURS: bad,
      }),
      DAY,
    );
  assert.equal(
    catalogReconciliationIntervalMs(0, 0, {
      SHOPIFY_CATALOG_RECONCILE_INTERVAL_HOURS: "1",
    }),
    HOUR,
  );
});
test("large catalogs and observed quota-limited full passes impose conservative recovery gaps", () => {
  assert.equal(catalogReconciliationIntervalMs(10000, 0, {}), DAY);
  assert.equal(catalogReconciliationIntervalMs(50000, 0, {}), 5 * DAY);
  assert.equal(
    catalogReconciliationIntervalMs(50000, 0, {
      SHOPIFY_CATALOG_RECONCILE_INTERVAL_HOURS: "1",
    }),
    5 * DAY,
  );
  assert.equal(
    catalogReconciliationIntervalMs(10000, 0, {
      SHOPIFY_CATALOG_RECONCILE_PRODUCTS_PER_DAY: "1000",
    }),
    10 * DAY,
  );
  assert.equal(
    catalogReconciliationIntervalMs(10000, 0, {
      SHOPIFY_CATALOG_RECONCILE_PRODUCTS_PER_DAY: "0",
    }),
    DAY,
  );
  assert.equal(catalogReconciliationIntervalMs(1000, 12 * HOUR, {}), 2 * DAY);
});
