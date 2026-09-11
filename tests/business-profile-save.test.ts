/**
 * Business Profile first-save / update / tenant isolation.
 * Run: npx tsx --test tests/business-profile-save.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AiBusinessKnowledge } from "@shared/schema";
import {
  buildBusinessProfileSaveBody,
  formatBusinessProfileSaveError,
  hydrateBusinessProfileDisplayName,
  persistBusinessProfileDisplayName,
  sanitizeAiBusinessKnowledgeUpdates,
  type BusinessProfileResponse,
} from "@shared/businessProfileSchema";
import { saveBusinessProfileForUser } from "../server/businessProfileService";

type KnowledgeRow = Partial<AiBusinessKnowledge> & { userId: string };

function emptyProfile(overrides: Partial<BusinessProfileResponse> = {}): BusinessProfileResponse {
  return {
    avatarUrl: null,
    displayName: "",
    businessName: "",
    companyLogo: null,
    publicPhone: "",
    publicEmail: "",
    publicWebsite: "",
    aboutText: "",
    calendlyConnected: false,
    calendlyEventTypeName: "",
    calendlySchedulingUrl: "",
    publishListingsPublicly: false,
    ...overrides,
  };
}

function createTenantStore() {
  const rows = new Map<string, KnowledgeRow>();
  const upsertCalls: Array<{ userId: string; updates: Partial<AiBusinessKnowledge> }> = [];

  async function upsertKnowledge(userId: string, updates: Partial<AiBusinessKnowledge>) {
    const safe = sanitizeAiBusinessKnowledgeUpdates({
      ...(updates as Record<string, unknown>),
      userId: (updates as { userId?: string }).userId,
    }) as Partial<AiBusinessKnowledge>;
    upsertCalls.push({ userId, updates: safe });
    const existing = rows.get(userId);
    if (existing) {
      const next = { ...existing, ...safe, userId };
      rows.set(userId, next);
      return next;
    }
    const created: KnowledgeRow = { id: `row-${userId}`, userId, ...safe };
    rows.set(userId, created);
    return created;
  }

  async function loadProfile(userId: string): Promise<BusinessProfileResponse> {
    const row = rows.get(userId);
    return emptyProfile({
      displayName: hydrateBusinessProfileDisplayName({ knowledgeDisplayName: row?.displayName }),
      businessName: String(row?.businessName || ""),
      companyLogo: row?.companyLogo || null,
      publicPhone: String(row?.publicPhone || ""),
      publicEmail: String(row?.publicEmail || ""),
      publicWebsite: String(row?.publicWebsite || ""),
      aboutText: String(row?.aboutText || ""),
    });
  }

  return {
    rows,
    upsertCalls,
    deps: {
      upsertKnowledge,
      loadProfile,
      isRgeInstalled: async () => false,
    },
  };
}

test("first Business Profile save creates the tenant knowledge row without AI Brain", async () => {
  const store = createTenantStore();
  const tenantId = "workspace-new";
  const body = buildBusinessProfileSaveBody({
    displayName: "",
    businessName: "Acme HVAC",
    publicPhone: "",
    publicEmail: "",
    publicWebsite: "",
    aboutText: "We install and repair AC.",
    companyLogo: null,
  });

  const result = await saveBusinessProfileForUser(tenantId, body, store.deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(store.rows.size, 1);
  const row = store.rows.get(tenantId);
  assert.ok(row);
  assert.equal(row.userId, tenantId);
  assert.equal(row.displayName, null);
  assert.equal(row.businessName, "Acme HVAC");
  assert.equal(row.aboutText, "We install and repair AC.");
  assert.equal(result.profile.businessName, "Acme HVAC");
  assert.equal(result.profile.displayName, "");
  assert.equal(store.upsertCalls.length, 1);
  assert.equal(store.upsertCalls[0]?.userId, tenantId);
});

test("later Business Profile save updates the same tenant row", async () => {
  const store = createTenantStore();
  const tenantId = "workspace-existing";
  const first = await saveBusinessProfileForUser(
    tenantId,
    buildBusinessProfileSaveBody({
      displayName: "Sam Agent",
      businessName: "Acme HVAC",
      publicPhone: "",
      publicEmail: "",
      publicWebsite: "",
      aboutText: "About v1",
      companyLogo: null,
    }),
    store.deps,
  );
  assert.equal(first.ok, true);

  const second = await saveBusinessProfileForUser(
    tenantId,
    buildBusinessProfileSaveBody({
      displayName: "Sam Agent",
      businessName: "Acme HVAC",
      publicPhone: "",
      publicEmail: "",
      publicWebsite: "",
      aboutText: "About v2",
      companyLogo: null,
    }),
    store.deps,
  );
  assert.equal(second.ok, true);
  assert.equal(store.rows.size, 1);
  assert.equal(store.rows.get(tenantId)?.aboutText, "About v2");
  assert.equal(store.rows.get(tenantId)?.displayName, "Sam Agent");
});

test("cleared representative name stays null and does not fall back to users.name", async () => {
  const store = createTenantStore();
  const tenantId = "workspace-clear-name";
  await saveBusinessProfileForUser(
    tenantId,
    buildBusinessProfileSaveBody({
      displayName: "Samantha P",
      businessName: "Affordable Pompano HVAC",
      publicPhone: "",
      publicEmail: "",
      publicWebsite: "",
      aboutText: "HVAC",
      companyLogo: null,
    }),
    store.deps,
  );

  const cleared = await saveBusinessProfileForUser(
    tenantId,
    buildBusinessProfileSaveBody({
      displayName: "   ",
      businessName: "Affordable Pompano HVAC",
      publicPhone: "",
      publicEmail: "",
      publicWebsite: "",
      aboutText: "HVAC",
      companyLogo: null,
    }),
    store.deps,
  );
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  assert.equal(store.rows.get(tenantId)?.displayName, null);
  assert.equal(cleared.profile.displayName, "");
  assert.equal(
    hydrateBusinessProfileDisplayName({
      knowledgeDisplayName: store.rows.get(tenantId)?.displayName,
      userName: "Samantha P",
      email: "samantha@affordablepompano.com",
    }),
    "",
  );
  assert.equal(persistBusinessProfileDisplayName(cleared.profile.displayName), null);
});

test("company name and about save independently of services and a cleared name", async () => {
  const store = createTenantStore();
  const tenantId = "workspace-partial";
  const result = await saveBusinessProfileForUser(
    tenantId,
    {
      displayName: null,
      businessName: "Peak Plumbing",
      aboutText: "Drain clearing in Miami.",
      publicEmail: null,
      publicWebsite: null,
    },
    store.deps,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const row = store.rows.get(tenantId);
  assert.equal(row?.displayName, null);
  assert.equal(row?.businessName, "Peak Plumbing");
  assert.equal(row?.aboutText, "Drain clearing in Miami.");
  assert.equal("servicesProducts" in (row ?? {}), false);
});

test("tenant isolation: body userId cannot write another workspace", async () => {
  const store = createTenantStore();
  const tenantA = "tenant-a";
  const tenantB = "tenant-b";
  await saveBusinessProfileForUser(
    tenantB,
    buildBusinessProfileSaveBody({
      displayName: "Victim",
      businessName: "Victim Co",
      publicPhone: "",
      publicEmail: "",
      publicWebsite: "",
      aboutText: "Keep me",
      companyLogo: null,
    }),
    store.deps,
  );

  const result = await saveBusinessProfileForUser(
    tenantA,
    {
      userId: tenantB,
      id: "forged-id",
      displayName: null,
      businessName: "Attacker Co",
      aboutText: "Hijack",
    },
    store.deps,
  );
  assert.equal(result.ok, true);
  assert.equal(store.rows.get(tenantA)?.userId, tenantA);
  assert.equal(store.rows.get(tenantA)?.businessName, "Attacker Co");
  assert.equal(store.rows.get(tenantB)?.businessName, "Victim Co");
  assert.equal(store.rows.get(tenantB)?.aboutText, "Keep me");
  assert.equal(store.upsertCalls.at(-1)?.userId, tenantA);
  assert.equal("userId" in (store.upsertCalls.at(-1)?.updates ?? {}), false);
  assert.equal("id" in (store.upsertCalls.at(-1)?.updates ?? {}), false);
});

test("invalid website returns a string field reason, not a generic object error", async () => {
  const store = createTenantStore();
  const result = await saveBusinessProfileForUser(
    "workspace-invalid",
    { businessName: "Acme", publicWebsite: "not a website" },
    store.deps,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 400);
  assert.equal(typeof result.error, "string");
  assert.match(result.error, /publicWebsite/i);
  assert.equal(store.rows.size, 0);
  assert.equal(
    formatBusinessProfileSaveError({ error: result.fieldErrors }),
    result.error,
  );
});

test("formatBusinessProfileSaveError reads legacy fieldErrors objects", () => {
  assert.equal(
    formatBusinessProfileSaveError({ error: { publicEmail: ["Invalid email"] } }),
    "publicEmail: Invalid email",
  );
  assert.equal(
    formatBusinessProfileSaveError({ error: "Failed to update business profile" }),
    "Failed to update business profile",
  );
});
