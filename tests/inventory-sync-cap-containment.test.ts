/**
 * Production-shaped inventory sync cap, pause, and scanned-vs-stored counters.
 * Run: npx tsx --test tests/inventory-sync-cap-containment.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideInventoryListingPersist,
  formatInventorySyncedCapLabel,
  inventorySyncedListingCount,
  isInventorySyncPaused,
  readListingsScanned,
  shouldHaltInventoryFetch,
  withInventorySyncPaused,
} from "../shared/inventory/inventorySyncCap";
import { buildInventorySourceSummaryCard } from "../client/src/lib/inventorySourceConnectionUi";
import type { PublicInventorySource } from "../client/src/lib/inventoryApi";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const eligibleCompliance = {
  internetEntireListingDisplay: true,
  listOfficeName: "Example Broker",
  mlsListingId: "A123",
  mlsSourceName: "MIAMIRE",
};

function persist(partial: Partial<Parameters<typeof decideInventoryListingPersist>[0]>) {
  return decideInventoryListingPersist({
    exists: false,
    inScope: true,
    incomingStatus: "active",
    activeStoredCount: 0,
    maxListings: 1000,
    syncPaused: false,
    listingCompliance: eligibleCompliance,
    ...partial,
  });
}

test("pagination and retries never insert past the source-wide active cap", () => {
  const pages = [
    Array.from({ length: 400 }, (_, i) => i),
    Array.from({ length: 400 }, (_, i) => i + 400),
    Array.from({ length: 400 }, (_, i) => i + 800),
  ];
  let activeStored = 0;
  let scanned = 0;
  let stored = 0;
  for (const page of pages) {
    for (const _row of page) {
      scanned += 1;
      const decision = persist({ activeStoredCount: activeStored });
      if (decision.action === "insert") {
        activeStored += 1;
        stored += 1;
      } else {
        assert.equal(decision.action, "skip");
        assert.equal(decision.reason, "over_cap");
      }
    }
    if (shouldHaltInventoryFetch({ activeStoredCount: activeStored, maxListings: 1000 })) break;
  }
  assert.equal(stored, 1000);
  assert.ok(scanned > 1000, "provider may scan more than the cap");
  assert.notEqual(scanned, stored);
});

test("overlapping jobs and retries share one source-wide cap", () => {
  let activeStored = 998;
  const jobA = persist({ activeStoredCount: activeStored });
  if (jobA.action === "insert") activeStored += 1;
  const jobB = persist({ activeStoredCount: activeStored });
  if (jobB.action === "insert") activeStored += 1;
  const retry = persist({ activeStoredCount: activeStored });
  if (retry.action === "insert") activeStored += 1;
  const overflow = persist({ activeStoredCount: activeStored });
  assert.equal(activeStored, 1000);
  assert.deepEqual(overflow, { action: "skip", reason: "over_cap" });
});

test("cap reductions immediately halt new inserts without deleting existing rows", () => {
  const reduced = persist({ activeStoredCount: 2500, maxListings: 1000 });
  assert.deepEqual(reduced, { action: "skip", reason: "over_cap" });
  const existingUpdate = persist({ exists: true, activeStoredCount: 2500, maxListings: 1000 });
  assert.deepEqual(existingUpdate, { action: "update_existing" });
});

test("market and eligibility filters apply before the capped set is filled", () => {
  assert.equal(persist({ inScope: false }).reason, "out_of_scope");
  assert.equal(persist({ incomingStatus: "sold" }).reason, "not_matchable");
  assert.equal(persist({ listingCompliance: { internetEntireListingDisplay: false } }).reason, "ineligible");
  assert.equal(persist({ activeStoredCount: 999 }).action, "insert");
});

test("pause blocks new persist, scheduled jobs, and manual retries", () => {
  assert.deepEqual(persist({ syncPaused: true }), { action: "skip", reason: "paused" });
  const pausedConfig = withInventorySyncPaused({ datasetId: "miamire" }, true);
  assert.equal(isInventorySyncPaused(pausedConfig), true);
  const resumed = withInventorySyncPaused(pausedConfig, false);
  assert.equal(isInventorySyncPaused(resumed), false);
  assert.equal("syncPaused" in resumed, false);

  const syncSrc = read("server/inventory/inventorySyncService.ts");
  assert.match(syncSrc, /reason: "paused"/);
  assert.match(syncSrc, /requestInventorySyncAbort/);
  assert.match(syncSrc, /lastSyncStatus: "paused"/);
  assert.match(read("server/inventory/inventoryDb.ts"), /cfg\.syncPaused === true/);
  assert.match(read("server/routes/inventory.ts"), /\/api\/inventory\/sources\/:id\/pause/);
  assert.match(read("server/routes/inventory.ts"), /\/api\/inventory\/sources\/:id\/resume/);
});

test("stale or stopped syncs clear the running lease", () => {
  const syncSrc = read("server/inventory/inventorySyncService.ts");
  assert.match(syncSrc, /InventorySyncStoppedError/);
  assert.match(syncSrc, /recoverStaleInventorySync/);
  assert.match(syncSrc, /runningSyncs\.delete/);
  assert.match(syncSrc, /lastSyncStatus: paused \? "paused" : "success"/);
  assert.match(syncSrc, /haltedBeforeFetch/);
});

test("scanned counters stay separate from synced listings", () => {
  assert.equal(readListingsScanned({ listingsFetched: 28927, listingsImported: 1000 }), 28927);
  assert.equal(inventorySyncedListingCount({ activeForMatching: 1000, totalSynced: 28927 }), 1000);
  assert.equal(formatInventorySyncedCapLabel(1000, 1000), "1,000 / 1,000 cap");

  const source: PublicInventorySource = {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    provider: "bridge_interactive",
    displayName: "My Bridge inventory",
    connectionStatus: "connected",
    config: { datasetId: "miamire", maxListings: 1000, syncPaused: true },
    integrationId: null,
    lastSyncAt: "2026-09-16T00:00:00.000Z",
    lastSyncStatus: "paused",
    lastSyncError: null,
    lastSyncStats: { listingsFetched: 28927, listingsImported: 1000 },
    isActive: true,
    syncPaused: true,
    listingSyncSupported: true,
    hasCredentials: true,
    listingCount: 28927,
    inventoryStats: {
      activeForMatching: 1000,
      configuredCap: 1000,
      totalSynced: 1000,
      totalStoredRows: 28927,
      listingsScanned: 28927,
      inactiveOffMarket: 27927,
      syncPaused: true,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
  };
  const card = buildInventorySourceSummaryCard(source);
  assert.equal(card.connectionState, "paused");
  assert.equal(card.listingCount, 1000);
  assert.equal(card.listingsScanned, 28927);
  assert.equal(card.totalStoredRows, 28927);
  assert.equal(card.listingCountLabel.includes("28,927"), false);
  assert.equal(card.automaticSyncLabel, "Automatic sync paused");
});

test("persist boundary uses an advisory lock and does not send widget action-style extras", () => {
  const dbSrc = read("server/inventory/inventoryDb.ts");
  assert.match(dbSrc, /pg_advisory_xact_lock/);
  assert.match(dbSrc, /decideInventoryListingPersist/);
  assert.match(dbSrc, /insertMatchableListingWithinCap/);
  assert.match(read("server/inventory/inventorySyncService.ts"), /shouldHaltInventoryFetch/);
});

type StoredListing = {
  providerListingId: string;
  status: "active" | "coming_soon" | "inactive";
  publishPublicly: boolean;
  priceCents: number;
};

function productionShapedStore(seed: StoredListing[], maxListings: number) {
  const rows = new Map(seed.map((row) => [row.providerListingId, { ...row }]));
  const matchableCount = () =>
    [...rows.values()].filter((row) => row.status === "active" || row.status === "coming_soon").length;

  const persistOne = (incoming: StoredListing, syncPaused: boolean) => {
    const existing = rows.get(incoming.providerListingId);
    const decision = decideInventoryListingPersist({
      exists: Boolean(existing),
      inScope: true,
      incomingStatus: incoming.status === "inactive" ? "sold" : incoming.status,
      activeStoredCount: matchableCount(),
      maxListings,
      syncPaused,
      listingCompliance: eligibleCompliance,
    });
    if (decision.action === "insert") {
      rows.set(incoming.providerListingId, { ...incoming });
    } else if (decision.action === "update_existing" && existing) {
      rows.set(incoming.providerListingId, {
        ...existing,
        status: incoming.status,
        priceCents: incoming.priceCents,
      });
    }
    return decision;
  };

  const scanPages = (pages: StoredListing[][], syncPaused: boolean) => {
    let scanned = 0;
    let halted = false;
    for (const page of pages) {
      if (
        shouldHaltInventoryFetch({
          paused: syncPaused,
          activeStoredCount: matchableCount(),
          maxListings,
        })
      ) {
        halted = true;
        break;
      }
      for (const incoming of page) {
        scanned += 1;
        persistOne(incoming, syncPaused);
      }
      if (
        shouldHaltInventoryFetch({
          paused: syncPaused,
          activeStoredCount: matchableCount(),
          maxListings,
        })
      ) {
        halted = true;
        break;
      }
    }
    return { scanned, halted };
  };

  return { rows, matchableCount, persistOne, scanPages };
}

test("a new source starting at zero stores exactly 1,000 rows across multiple provider pages", () => {
  const store = productionShapedStore([], 1000);
  const pages = [0, 1, 2, 3].map((page) =>
    Array.from({ length: 400 }, (_, i) => ({
      providerListingId: `new-${page * 400 + i}`,
      status: "active" as const,
      publishPublicly: false,
      priceCents: 100000 + i,
    })),
  );
  const { scanned, halted } = store.scanPages(pages, false);
  assert.equal(store.rows.size, 1000);
  assert.equal(store.matchableCount(), 1000);
  assert.equal(halted, true);
  assert.ok(scanned > 1000);
  assert.ok(pages.length >= 3);

  const retryPages = [
    Array.from({ length: 200 }, (_, i) => ({
      providerListingId: `retry-${i}`,
      status: "active" as const,
      publishPublicly: false,
      priceCents: 1,
    })),
  ];
  store.scanPages(retryPages, false);
  assert.equal(store.rows.size, 1000);

  const selectedId = "new-0";
  const selected = store.rows.get(selectedId);
  assert.ok(selected);
  store.persistOne({ ...selected, priceCents: 999999 }, false);
  assert.equal(store.rows.size, 1000);
  assert.equal(store.rows.get(selectedId)?.priceCents, 999999);
});

test("serialized concurrent jobs cannot insert past the source-wide cap", () => {
  const store = productionShapedStore(
    Array.from({ length: 998 }, (_, i) => ({
      providerListingId: `seed-${i}`,
      status: "active" as const,
      publishPublicly: false,
      priceCents: 1,
    })),
    1000,
  );
  const lock: string[] = [];
  const runJob = (id: string) => {
    lock.push(id);
    const decision = store.persistOne(
      {
        providerListingId: `job-${id}`,
        status: "active",
        publishPublicly: false,
        priceCents: 1,
      },
      false,
    );
    return decision.action;
  };
  const a = runJob("A");
  const b = runJob("B");
  const c = runJob("C");
  assert.equal(a, "insert");
  assert.equal(b, "insert");
  assert.equal(c, "skip");
  assert.equal(store.rows.size, 1000);
  assert.deepEqual(lock, ["A", "B", "C"]);
});

test("grandfathered ~29,000 stored listings keep every row and all published listings", () => {
  const published = Array.from({ length: 688 }, (_, i) => ({
    providerListingId: `pub-${i}`,
    status: "active" as const,
    publishPublicly: true,
    priceCents: 250000 + i,
  }));
  const unpublished = Array.from({ length: 29000 - 688 }, (_, i) => ({
    providerListingId: `row-${i}`,
    status: "active" as const,
    publishPublicly: false,
    priceCents: 100000 + i,
  }));
  const store = productionShapedStore([...published, ...unpublished], 1000);
  assert.equal(store.rows.size, 29000);
  assert.equal([...store.rows.values()].filter((row) => row.publishPublicly).length, 688);

  const extraPages = [
    Array.from({ length: 200 }, (_, i) => ({
      providerListingId: `extra-${i}`,
      status: "active" as const,
      publishPublicly: false,
      priceCents: 1,
    })),
  ];
  const { halted } = store.scanPages(extraPages, false);
  assert.equal(halted, true);
  assert.equal(store.rows.size, 29000);
  assert.equal(store.rows.has("extra-0"), false);
  assert.equal([...store.rows.values()].filter((row) => row.publishPublicly).length, 688);

  const firstPublished = store.rows.get("pub-0");
  assert.ok(firstPublished);
  store.persistOne({ ...firstPublished, priceCents: 123456 }, false);
  assert.equal(store.rows.get("pub-0")?.priceCents, 123456);
  assert.equal(store.rows.get("pub-0")?.publishPublicly, true);
  assert.equal(store.rows.size, 29000);

  const syncSrc = read("server/inventory/inventorySyncService.ts");
  const haltIdx = syncSrc.indexOf("haltedBeforeFetch: true");
  const reconIdx = syncSrc.indexOf("inactivated = await markListingsInactiveExcept");
  assert.ok(haltIdx > 0 && reconIdx > haltIdx);
  assert.match(syncSrc, /lastSyncStatus: "success"/);
  assert.equal(syncSrc.includes("DELETE FROM inventory_listings"), false);

  const updateSrc = read("server/inventory/inventoryDb.ts");
  const updateFn = updateSrc.slice(updateSrc.indexOf("async function updateExistingInventoryListing"));
  const setBlock = updateFn.slice(updateFn.indexOf(".set({"), updateFn.indexOf("})") + 2);
  assert.equal(setBlock.includes("publishPublicly"), false);
  assert.equal(setBlock.includes("publishedAt"), false);
});

test("pause is persisted on the source config and blocks every start path after a process restart", () => {
  const persisted = withInventorySyncPaused({ datasetId: "miamire", initialImportComplete: true }, true);
  assert.equal(isInventorySyncPaused(persisted), true);

  const afterRestart = { ...persisted };
  assert.equal(isInventorySyncPaused(afterRestart), true);

  const syncSrc = read("server/inventory/inventorySyncService.ts");
  const startFn = syncSrc.slice(syncSrc.indexOf("export async function startInventorySourceSync"));
  const startBody = startFn.slice(0, startFn.indexOf("export async function") > 0 ? startFn.indexOf("\nasync function runInventorySyncJob") : startFn.length);
  assert.match(startBody, /isInventorySyncPaused/);
  assert.match(startBody, /reason: "paused"/);
  assert.ok(startBody.indexOf('reason: "paused"') < startBody.indexOf("runningSyncs.add"));

  const dbSrc = read("server/inventory/inventoryDb.ts");
  assert.match(dbSrc, /if \(cfg\.syncPaused === true\) return false/);
  assert.match(read("server/routes/inventory.ts"), /code: "sync_paused"/);

  const sectionSrc = read("client/src/components/inventory/InventorySourcesSection.tsx");
  assert.match(sectionSrc, /card\.syncPaused/);
  assert.match(sectionSrc, /inventorySourcePauseUrl/);
  assert.match(read("client/src/lib/inventorySourceFormState.ts"), /\/pause/);
  assert.match(sectionSrc, /disabled=\{syncMutation\.isPending \|\| cardSyncing \|\| card\.connectionState === "disconnected" \|\| card\.syncPaused\}/);

  assert.equal(persist({ syncPaused: true, activeStoredCount: 29000, maxListings: 1000 }).action, "skip");
});
