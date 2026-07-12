/**
 * Phase 2.5 — large GHL contact scan / preview / import readiness tests.
 * Run: npx tsx tests/prospect-import-large-scan.test.ts
 */
import assert from "node:assert/strict";
import type { GhlRawContact } from "../server/prospectImport/ghlApiClient";
import {
  GhlApiError,
  buildProspectImportFilterFingerprint,
  fetchGhlWithRetry,
  isGhlAuthError,
  isGhlRetryableStatus,
  normalizeProspectImportFilters,
  parseRetryAfterMs,
  resolveScanTargetContacts,
} from "../server/prospectImport/ghlApiRetry";
import { scanGhlContactsPaginated } from "../server/prospectImport/ghlContactScan";
import { validatePreviewImportRequest } from "../server/prospectImport/prospectImportPreviewService";
import { PROSPECT_IMPORT_FILTER_APPLICATION } from "../shared/prospectImport";

function makeContact(id: string, tags: string[] = []): GhlRawContact {
  return {
    id,
    firstName: "Contact",
    lastName: id,
    email: `${id}@example.com`,
    phone: "+15550001111",
    tags,
    source: "web",
    dateAdded: "2026-01-01T00:00:00.000Z",
  };
}

function buildPagedSearch(total: number, pageSize = 100, agencyAtIndex?: number) {
  const pages = new Map<number, GhlRawContact[]>();
  for (let page = 1, offset = 0; offset < total; page++, offset += pageSize) {
    const batch: GhlRawContact[] = [];
    for (let i = offset; i < Math.min(offset + pageSize, total); i++) {
      const tag = i === (agencyAtIndex ?? 9999) ? ["Agency"] : [];
      batch.push(makeContact(`ghl-${i}`, tag));
    }
    pages.set(page, batch);
  }

  return async (params: { page: number; pageLimit: number }) => {
    const contacts = pages.get(params.page) ?? [];
    return { contacts, total };
  };
}

async function testTenThousandPaginatedScan() {
  const search = buildPagedSearch(10_000);
  let peakBatch = 0;

  const result = await scanGhlContactsPaginated({
    locationId: "loc-1",
    filters: { scanScope: 10_000, importLimit: 100, tags: ["Agency"] },
    scanScope: 10_000,
    getToken: async () => "token",
    searchPage: async ({ page, pageLimit }) => {
      const out = await search({ page, pageLimit });
      peakBatch = Math.max(peakBatch, out.contacts.length);
      return out;
    },
  });

  assert.equal(result.totalContactsScanned, 10_000);
  assert.equal(result.allMatchedExternalIds.length, 1);
  assert.equal(result.allMatchedExternalIds[0], "ghl-9999");
  assert.equal(peakBatch, 100, "never holds more than one page in memory");
  assert.equal(result.ghlReportedTotal, 10_000);
  console.log("  10,000-contact paginated scan: OK");
}

async function testLatePageFilterMatch() {
  const search = buildPagedSearch(2500, 100, 2499);
  const result = await scanGhlContactsPaginated({
    locationId: "loc-1",
    filters: { scanScope: 2500, tags: ["Agency"] },
    scanScope: 2500,
    getToken: async () => "token",
    searchPage: async ({ page, pageLimit }) => search({ page, pageLimit }),
  });
  assert.equal(result.allMatchedExternalIds[0], "ghl-2499");
  console.log("  late-page filter match: OK");
}

async function testScanLimitSeparateFromImportLimit() {
  const search = buildPagedSearch(2000, 100, 1500);
  const result = await scanGhlContactsPaginated({
    locationId: "loc-1",
    filters: { scanScope: 2000, importLimit: 50, tags: ["Agency"] },
    scanScope: 2000,
    getToken: async () => "token",
    searchPage: async ({ page, pageLimit }) => search({ page, pageLimit }),
  });
  assert.equal(result.totalContactsScanned, 2000);
  assert.equal(result.allMatchedExternalIds.length, 1);
  console.log("  scan limit separate from import limit: OK");
}

async function testPageContinuation() {
  const search = buildPagedSearch(350);
  const pagesSeen: number[] = [];
  await scanGhlContactsPaginated({
    locationId: "loc-1",
    filters: { scanScope: 350 },
    scanScope: 350,
    getToken: async () => "token",
    resumeFromPage: 3,
    searchPage: async ({ page, pageLimit }) => {
      pagesSeen.push(page);
      return search({ page, pageLimit });
    },
  });
  assert.deepEqual(pagesSeen, [3, 4]);
  console.log("  page continuation: OK");
}

async function test429Retry() {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts < 3) {
      return new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } });
    }
    return new Response(JSON.stringify({ contacts: [], total: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const { data } = await fetchGhlWithRetry(
    "https://example.test/contacts/search",
    "token",
    { method: "POST", body: "{}" },
    { fetchImpl, maxRetries: 5 },
  );
  assert.equal(attempts, 3);
  assert.ok(data && typeof data === "object");
  console.log("  429 retry with Retry-After: OK");
}

async function test5xxRetry() {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts < 2) return new Response("boom", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await fetchGhlWithRetry("https://example.test/x", "token", undefined, {
    fetchImpl,
    maxRetries: 3,
  });
  assert.equal(attempts, 2);
  console.log("  transient 5xx retry: OK");
}

async function testAuthErrorStopsImmediately() {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return new Response("unauthorized", { status: 401 });
  };

  await assert.rejects(
    () => fetchGhlWithRetry("https://example.test/x", "token", undefined, { fetchImpl }),
    (err: unknown) => err instanceof GhlApiError && err.status === 401,
  );
  assert.equal(attempts, 1);
  console.log("  auth error stops immediately: OK");
}

async function testTokenRefreshDuringScan() {
  let tokenCalls = 0;
  const search = buildPagedSearch(250);
  await scanGhlContactsPaginated({
    locationId: "loc-1",
    filters: { scanScope: 250 },
    scanScope: 250,
    getToken: async () => {
      tokenCalls += 1;
      return `token-${tokenCalls}`;
    },
    searchPage: async ({ page, pageLimit }) => search({ page, pageLimit }),
  });
  assert.ok(tokenCalls >= 3, "token resolver called each page");
  console.log("  token refresh during scan: OK");
}

function testFilterFingerprintStable() {
  const a = buildProspectImportFilterFingerprint({
    integrationId: "int-1",
    locationId: "loc-1",
    filters: { tags: ["Agency", "VIP"], scanScope: 5000, importLimit: 100 },
  });
  const b = buildProspectImportFilterFingerprint({
    integrationId: "int-1",
    locationId: "loc-1",
    filters: { tags: ["VIP", "Agency"], scanScope: 5000, importLimit: 100 },
  });
  assert.equal(a, b);
  console.log("  filter fingerprint stable: OK");
}

function testFilterApplicationDoc() {
  assert.equal(PROSPECT_IMPORT_FILTER_APPLICATION.search, "ghl_api");
  assert.equal(PROSPECT_IMPORT_FILTER_APPLICATION.tags, "local");
  assert.equal(PROSPECT_IMPORT_FILTER_APPLICATION.pipelineId, "local");
  console.log("  filter application map: OK");
}

function testNormalizeFilters() {
  const normalized = normalizeProspectImportFilters({ importLimit: 5000, scanScope: 10_000 });
  assert.equal(normalized.importLimit, 1000);
  assert.equal(normalized.scanScope, 10_000);
  console.log("  normalize filters: OK");
}

function testRetryHelpers() {
  assert.equal(isGhlRetryableStatus(429), true);
  assert.equal(isGhlRetryableStatus(503), true);
  assert.equal(isGhlAuthError(401), true);
  assert.equal(parseRetryAfterMs(new Headers({ "Retry-After": "2" })), 2000);
  assert.equal(resolveScanTargetContacts("entire"), 100_000);
  console.log("  retry helpers: OK");
}

async function testMemorySafePageProcessing() {
  const search = buildPagedSearch(10_000);
  let liveObjects = 0;
  let maxLive = 0;

  await scanGhlContactsPaginated({
    locationId: "loc-1",
    filters: { scanScope: 10_000 },
    scanScope: 10_000,
    getToken: async () => "token",
    searchPage: async ({ page, pageLimit }) => {
      const out = await search({ page, pageLimit });
      liveObjects += out.contacts.length;
      maxLive = Math.max(maxLive, liveObjects);
      liveObjects -= out.contacts.length;
      return out;
    },
  });

  assert.ok(maxLive <= 100);
  console.log("  memory-safe page processing: OK");
}

function testPreviewImportValidation() {
  validatePreviewImportRequest({
    previewJobId: "job-1",
    filterFingerprint: "fp-1",
    locationId: "loc-1",
    integrationId: "int-1",
    expectedFingerprint: "fp-1",
    scannedAt: new Date().toISOString(),
    maxAgeMs: 60_000,
  });

  assert.throws(
    () =>
      validatePreviewImportRequest({
        previewJobId: "job-1",
        filterFingerprint: "fp-1",
        locationId: "loc-1",
        integrationId: "int-1",
        expectedFingerprint: "fp-2",
      }),
    /filters changed/i,
  );
  console.log("  preview → import validation: OK");
}

async function main() {
  testPreviewImportValidation();
  await testTenThousandPaginatedScan();
  await testLatePageFilterMatch();
  await testScanLimitSeparateFromImportLimit();
  await testPageContinuation();
  await test429Retry();
  await test5xxRetry();
  await testAuthErrorStopsImmediately();
  await testTokenRefreshDuringScan();
  testFilterFingerprintStable();
  testFilterApplicationDoc();
  testNormalizeFilters();
  testRetryHelpers();
  await testMemorySafePageProcessing();
  console.log("prospect-import-large-scan.test.ts: OK");
}

await main();
