/** Growth Engines are included with Pro and never create a second checkout. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GROWTH_ENGINE_CARDS } from "../client/src/lib/growthEnginesCatalog";
import { getCanonicalCommercialCatalog } from "../shared/pricingEntitlements";
import { PUBLIC_PRODUCT_FACTS } from "../shared/publicProductFacts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("every catalog Growth Engine is labeled Included with Pro", () => {
  const engines = GROWTH_ENGINE_CARDS.filter((card) => card.slug !== "prospect-ai");
  assert.ok(engines.length > 0);
  for (const engine of engines) {
    assert.ok(engine.badges.includes("Included with Pro"), engine.slug);
    assert.equal(engine.oneTimePrice, null, engine.slug);
  }
});

test("commercial facts expose RGE as an included capability without an offer", () => {
  const catalog = getCanonicalCommercialCatalog().find((item) => item.id === "realtor-growth-engine");
  assert.equal(catalog?.kind, "included_capability");
  assert.deepEqual(catalog?.offers, []);
  assert.match(catalog?.description || "", /Included with Pro/i);
  assert.equal(PUBLIC_PRODUCT_FACTS.realtorGrowthEngine.currentPurchasableOffer, false);
  assert.deepEqual(PUBLIC_PRODUCT_FACTS.realtorGrowthEngine.prices, []);
  assert.deepEqual(PUBLIC_PRODUCT_FACTS.realtorGrowthEngine.includedWith, ["pro"]);
});

test("RGE install route provisions only after the shared Pro entitlement check", () => {
  const routes = read("server/templateRoutes.ts");
  assert.match(routes, /realtor-growth-engine\/install/);
  assert.match(routes, /evaluateGrowthEngineAccess\(userId\)/);
  assert.match(routes, /deps\.provision\(userId, \{ source: "pro_included" \}\)/);
  assert.doesNotMatch(routes, /STRIPE_RGE|checkout\.sessions|verify-payment|realtor-growth-engine\/purchase/);
});

test("Pro install route completes a partial attempt and logging cannot turn it into a 500", async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  const [{ createGrowthEngineInstallHandler }, { provisionGrowthEngine }, { storage }] = await Promise.all([
    import("../server/templateRoutes"),
    import("../server/growthEngineProvisioning"),
    import("../server/storage"),
  ]);
  const userId = "pro-install-regression-user";
  const entitlement = {
    id: "entitlement-1",
    userId,
    templateId: "realtor-growth-engine",
    status: "purchased",
    purchasedAt: new Date(),
    onboardingSubmittedAt: null,
  } as any;
  let install: any;
  let progress: any;
  let installCreates = 0;
  const originals = new Map<string, any>();
  const replace = (name: string, implementation: any) => {
    originals.set(name, (storage as any)[name]);
    (storage as any)[name] = implementation;
  };
  const originalInfo = console.info;

  replace("getTemplateEntitlement", async () => entitlement);
  replace("upsertTemplateEntitlement", async () => entitlement);
  replace("getTemplateInstall", async () => install);
  replace("createTemplateInstall", async (row: any) => {
    installCreates += 1;
    install = { id: "install-1", ...row, createdAt: new Date() };
    return install;
  });
  replace("getUserTemplateDataByKey", async () => progress ? { definition: progress } : undefined);
  replace("upsertUserTemplateData", async (_userId: string, _templateId: string, _type: string, _key: string, value: any) => {
    progress = value;
    return { definition: value };
  });
  // The setup task is ancillary and already explicitly non-blocking in provisioning.
  replace("getGrowthEngineSetupTask", async () => {
    throw new Error("setup task unavailable in isolated test");
  });
  console.info = () => {
    throw new Error("logger unavailable");
  };

  const responses: Array<{ status: number; body: any }> = [];
  const invoke = async () => {
    let status = 200;
    const res = {
      status(code: number) { status = code; return this; },
      json(body: any) { responses.push({ status, body }); return this; },
    };
    const handler = createGrowthEngineInstallHandler({
      getUser: async () => ({ id: userId } as any),
      getTemplateEntitlement: async () => entitlement,
      evaluateAccess: async () => ({ ok: true, limits: { plan: "pro" } } as any),
      reconcileEntitlement: async () => ({ entitlement, reconciled: false, priorStatus: "purchased" }),
      provision: provisionGrowthEngine,
    });
    await handler({ user: { id: userId } }, res);
  };

  try {
    await invoke();
    await invoke();
  } finally {
    console.info = originalInfo;
    for (const [name, original] of originals) (storage as any)[name] = original;
  }

  assert.equal(responses[0]?.status, 200);
  assert.equal(responses[0]?.body.success, true);
  assert.equal(responses[0]?.body.alreadyInstalled, false);
  assert.equal(responses[1]?.status, 200);
  assert.equal(responses[1]?.body.alreadyInstalled, true);
  assert.equal(installCreates, 1, "retry must not duplicate the install record");
  assert.equal(progress?.step, 1, "partial attempt must initialize onboarding progress");
});

test("the existing full Pro trial permits installation through effective Pro limits", () => {
  const subscription = read("server/subscriptionService.ts");
  assert.match(subscription, /isInTrial/);
  assert.match(subscription, /getEffectivePlanForUser/);
  assert.match(subscription, /planName: isInTrial \? "Pro trial"/);
  assert.match(subscription, /growthEngineEligibleForPlan\(effectivePlan\)/);
});

test("runtime checks pause workflows without deleting installation state", () => {
  const runtime = read("server/workflowEngine.ts");
  const entitlement = read("server/growthEngineEntitlements.ts");
  const provisioning = read("server/growthEngineProvisioning.ts");
  assert.match(runtime, /evaluateGrowthEngineAccess/);
  assert.match(entitlement, /active Pro plan/);
  assert.match(provisioning, /getTemplateInstall/);
  assert.doesNotMatch(provisioning, /deleteTemplateInstall|deleteWorkflow/);
});

test("Growth Engine billing references are absent from production sources", () => {
  const files = [
    "server/templateRoutes.ts",
    "server/shopify.ts",
    "server/webhookHandlers.ts",
    "client/src/pages/RealtorGrowthEngine.tsx",
    "client/src/pages/RealtorLanding.tsx",
    "client/src/lib/growthEnginesCatalog.ts",
    "shared/pricingEntitlements.ts",
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /STRIPE_RGE_ONE_TIME_PRICE_ID|\$199|19900|rge-onetime/i, file);
  }
});
