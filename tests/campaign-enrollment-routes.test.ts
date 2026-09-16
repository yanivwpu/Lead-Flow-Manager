/**
 * Route-level campaign enrollment handlers.
 * Proves GET /api/campaign-enrollments no longer throws ReferenceError: storage is not defined.
 * Run: npx tsx --test tests/campaign-enrollment-routes.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { storage } from "../server/storage";
import { subscriptionService } from "../server/subscriptionService";
import { registerCampaignEnrollmentRoutes } from "../server/routes/campaignEnrollments";

const root = process.cwd();
const srcPath = join(root, "server/routes/campaignEnrollments.ts");
const src = readFileSync(srcPath, "utf8");

const TENANT_A = "user-a";
const TENANT_B = "user-b";
const CONTACT_A = "contact-a";
const CONTACT_B = "contact-b";
const CAMPAIGN_A = "campaign-a";

const enrollmentA = {
  id: "enr-a",
  userId: TENANT_A,
  campaignId: CAMPAIGN_A,
  contactId: CONTACT_A,
  conversationId: null,
  status: "active" as const,
  currentStepIndex: 0,
  nextRunAt: new Date("2026-09-16T12:00:00.000Z"),
  createdAt: new Date("2026-09-16T11:00:00.000Z"),
  updatedAt: new Date("2026-09-16T11:00:00.000Z"),
};

const enrollmentB = {
  ...enrollmentA,
  id: "enr-b",
  userId: TENANT_B,
  contactId: CONTACT_B,
  campaignId: "campaign-b",
};

const campaignA = {
  id: CAMPAIGN_A,
  userId: TENANT_A,
  name: "Welcome sequence",
  channel: "whatsapp",
  status: "active",
  messages: [{ content: "hi", delay: "0" }],
};

type StorageFn = keyof typeof storage;

const PATCHED: StorageFn[] = [
  "getCampaignEnrollmentsForContact",
  "getPresetCampaignForUser",
  "getLatestCampaignStepEventForEnrollment",
  "getCampaignEnrollmentById",
  "updateCampaignEnrollment",
  "getContact",
  "getActiveEnrollmentForContactCampaign",
  "getConversation",
  "createCampaignEnrollment",
  "createActivityEvent",
  "getChannelSetting",
];

async function withEnrollmentApp(opts: {
  userId?: string | null;
  run: (baseUrl: string, calls: Record<string, unknown[][]>) => Promise<void>;
  storageImpl?: Partial<Record<StorageFn, (...args: any[]) => unknown>>;
}) {
  const originals = new Map<StorageFn, (typeof storage)[StorageFn]>();
  for (const key of PATCHED) {
    originals.set(key, storage[key]);
  }
  const origGetUserLimits = subscriptionService.getUserLimits.bind(subscriptionService);
  subscriptionService.getUserLimits = (async () => ({
    workflowsEnabled: true,
    conversationsLimit: 999,
    conversationsUsed: 0,
  })) as typeof subscriptionService.getUserLimits;
  const calls: Record<string, unknown[][]> = {};
  for (const key of PATCHED) {
    calls[key] = [];
  }

  const defaultImpl: Partial<Record<StorageFn, (...args: any[]) => unknown>> = {
    getCampaignEnrollmentsForContact: async (userId: string, contactId: string) => {
      return [enrollmentA, enrollmentB].filter((row) => row.userId === userId && row.contactId === contactId);
    },
    getPresetCampaignForUser: async (campaignId: string, userId: string) => {
      if (campaignId === CAMPAIGN_A && userId === TENANT_A) return campaignA;
      return undefined;
    },
    getLatestCampaignStepEventForEnrollment: async () => undefined,
    getCampaignEnrollmentById: async (id: string) => {
      if (id === enrollmentA.id) return enrollmentA;
      if (id === enrollmentB.id) return enrollmentB;
      return undefined;
    },
    updateCampaignEnrollment: async (id: string, updates: Record<string, unknown>) => {
      const row = id === enrollmentA.id ? enrollmentA : id === enrollmentB.id ? enrollmentB : undefined;
      return row ? { ...row, ...updates } : undefined;
    },
    getContact: async () => undefined,
    getActiveEnrollmentForContactCampaign: async () => undefined,
    getConversation: async () => undefined,
    createCampaignEnrollment: async (row: Record<string, unknown>) => ({
      ...enrollmentA,
      ...row,
      id: "enr-new",
    }),
    createActivityEvent: async (row: Record<string, unknown>) => row,
    getChannelSetting: async () => undefined,
  };

  for (const key of PATCHED) {
    const impl = opts.storageImpl?.[key] ?? defaultImpl[key];
    if (!impl) continue;
    (storage as any)[key] = async (...args: unknown[]) => {
      calls[key].push(args);
      return impl(...args);
    };
  }

  const app = express();
  app.use(express.json());
  if (opts.userId) {
    app.use((req, _res, next) => {
      (req as { user?: { id: string } }).user = { id: opts.userId! };
      next();
    });
  }
  registerCampaignEnrollmentRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await opts.run(baseUrl, calls);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    for (const [key, orig] of originals) {
      (storage as any)[key] = orig;
    }
    subscriptionService.getUserLimits = origGetUserLimits;
  }
}

test("GET first failure is unbound storage after auth and contactId, not a missing DB row", () => {
  const getStart = src.indexOf('app.get("/api/campaign-enrollments"');
  const pauseStart = src.indexOf('app.post("/api/campaign-enrollments/:id/pause"');
  assert.ok(getStart >= 0 && pauseStart > getStart);
  const getHandler = src.slice(getStart, pauseStart);
  const authIdx = getHandler.indexOf('if (!req.user)');
  const contactIdx = getHandler.indexOf("contactId query parameter is required");
  const storageIdx = getHandler.indexOf("storage.getCampaignEnrollmentsForContact");
  assert.ok(authIdx >= 0 && contactIdx > authIdx && storageIdx > contactIdx);
  assert.match(getHandler, /storage\.getCampaignEnrollmentsForContact\(req\.user\.id, contactId\)/);
  assert.match(src, /import \{ storage \} from "\.\.\/storage"/);
  assert.match(src, /import \{ getWhatsAppAvailability \} from "\.\.\/whatsappService"/);
  assert.equal((src.match(/\bexport const storage\b/) || []).length, 0);
});

test("authenticated GET returns enrollments for the workspace", async () => {
  await withEnrollmentApp({
    userId: TENANT_A,
    run: async (baseUrl, calls) => {
      const res = await fetch(`${baseUrl}/api/campaign-enrollments?contactId=${CONTACT_A}`);
      const body = await res.json();
      assert.equal(res.status, 200, JSON.stringify(body));
      assert.equal(Array.isArray(body.enrollments), true);
      assert.equal(body.enrollments.length, 1);
      assert.equal(body.enrollments[0].id, "enr-a");
      assert.equal(body.enrollments[0].campaignName, "Welcome sequence");
      assert.equal(body.enrollments[0].campaignChannel, "whatsapp");
      assert.deepEqual(calls.getCampaignEnrollmentsForContact[0], [TENANT_A, CONTACT_A]);
    },
  });
});

test("empty workspace returns an empty enrollments array rather than 500", async () => {
  await withEnrollmentApp({
    userId: TENANT_A,
    storageImpl: {
      getCampaignEnrollmentsForContact: async () => [],
    },
    run: async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/campaign-enrollments?contactId=${CONTACT_A}`);
      const body = await res.json();
      assert.equal(res.status, 200, JSON.stringify(body));
      assert.deepEqual(body, { enrollments: [] });
    },
  });
});

test("one tenant cannot read another tenant's enrollments", async () => {
  await withEnrollmentApp({
    userId: TENANT_A,
    run: async (baseUrl, calls) => {
      const res = await fetch(`${baseUrl}/api/campaign-enrollments?contactId=${CONTACT_B}`);
      const body = await res.json();
      assert.equal(res.status, 200, JSON.stringify(body));
      assert.deepEqual(body.enrollments, []);
      assert.deepEqual(calls.getCampaignEnrollmentsForContact[0], [TENANT_A, CONTACT_B]);
      assert.equal(
        calls.getCampaignEnrollmentsForContact.every((args) => args[0] === TENANT_A),
        true,
      );
    },
  });
});

test("unauthenticated GET is rejected", async () => {
  await withEnrollmentApp({
    userId: null,
    run: async (baseUrl, calls) => {
      const res = await fetch(`${baseUrl}/api/campaign-enrollments?contactId=${CONTACT_A}`);
      const body = await res.json();
      assert.equal(res.status, 401);
      assert.deepEqual(body, { error: "Unauthorized" });
      assert.equal(calls.getCampaignEnrollmentsForContact.length, 0);
    },
  });
});

test("all campaign-enrollment handlers reach storage without ReferenceError", async () => {
  await withEnrollmentApp({
    userId: TENANT_A,
    run: async (baseUrl, calls) => {
      const pause = await fetch(`${baseUrl}/api/campaign-enrollments/${enrollmentA.id}/pause`, {
        method: "POST",
      });
      assert.equal(pause.status, 200, await pause.text());

      const resume = await fetch(`${baseUrl}/api/campaign-enrollments/${enrollmentA.id}/resume`, {
        method: "POST",
      });
      const resumeBody = await resume.json();
      assert.ok([200, 400].includes(resume.status), JSON.stringify(resumeBody));

      const cancel = await fetch(`${baseUrl}/api/campaign-enrollments/${enrollmentA.id}/cancel`, {
        method: "POST",
      });
      assert.equal(cancel.status, 200, await cancel.text());

      const retry = await fetch(`${baseUrl}/api/campaign-enrollments/${enrollmentA.id}/retry`, {
        method: "POST",
      });
      const retryBody = await retry.json();
      assert.ok([200, 400].includes(retry.status), JSON.stringify(retryBody));

      const create = await fetch(`${baseUrl}/api/campaign-enrollments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: CAMPAIGN_A, contactId: CONTACT_A }),
      });
      const createBody = await create.json();
      assert.notEqual(create.status, 500, JSON.stringify(createBody));
      assert.ok(!JSON.stringify(createBody).includes("storage is not defined"));

      assert.ok(calls.getCampaignEnrollmentById.length >= 3);
      assert.ok(calls.getPresetCampaignForUser.length >= 1);
      for (const key of PATCHED) {
        for (const args of calls[key]) {
          assert.ok(args, `storage.${key} was invoked`);
        }
      }
    },
  });
});

test("storage failures return a safe 500 without leaking internals", async () => {
  const errors: unknown[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    await withEnrollmentApp({
      userId: TENANT_A,
      storageImpl: {
        getCampaignEnrollmentsForContact: async () => {
          throw new Error("db boom secret-xyz stack");
        },
      },
      run: async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/campaign-enrollments?contactId=${CONTACT_A}`);
        const text = await res.text();
        const body = JSON.parse(text);
        assert.equal(res.status, 500);
        assert.deepEqual(body, { error: "Failed to list enrollments" });
        assert.equal(text.includes("secret-xyz"), false);
        assert.equal(text.includes("db boom"), false);
        assert.equal(text.includes("ReferenceError"), false);
      },
    });
  } finally {
    console.error = origError;
  }
  assert.ok(errors.length >= 1);
});
