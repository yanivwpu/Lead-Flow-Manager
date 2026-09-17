/**
 * Seed a throwaway TEST_DATABASE_URL workspace for Marketing Materials browser proof.
 * Never reads or writes DATABASE_URL after isolation is proven.
 *
 * Run: npx tsx scripts/seed-marketing-materials-browser-test.ts
 */
import { spawn } from "node:child_process";
import bcrypt from "bcryptjs";
import { proveTestDatabaseIsolation } from "./proof-test-db-isolation";

const TEST_EMAIL = "mm-browser-test@example.test";
const TEST_PASSWORD = "MmBrowserTest-2026!";

async function runDrizzlePush(databaseUrl: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npx", ["drizzle-kit", "push"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        ALLOW_DB_TEST_WRITES: "",
      },
      stdio: ["ignore", "inherit", "inherit"],
      shell: true,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`drizzle-kit push exited ${code}`));
    });
    child.on("error", reject);
  });
}

async function main(): Promise<void> {
  const { test } = await proveTestDatabaseIsolation();
  const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
  process.env.DATABASE_URL = testUrl;
  console.log(`[seed] applying schema to throwaway ${test.host}/${test.database} only`);
  await runDrizzlePush(testUrl);

  const { applyStartupSchemaPatches } = await import("../server/startupSchemaPatches");
  const patches = await applyStartupSchemaPatches();
  console.log("[seed] startup patches", patches);

  const { storage } = await import("../server/storage");
  const { ensureWidgetPublicId } = await import("../server/widgetIdentity");
  const existing = await storage.getUserByEmail(TEST_EMAIL);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  const widgetSettings = {
    enabled: true,
    color: "#10b981",
    welcomeMessage: "Hi! How can we help you today?",
    position: "right",
    showOnMobile: true,
    showOnDesktop: true,
    triggerType: "always",
    triggerDelaySeconds: 0,
    triggerScrollPercent: 50,
    pageRules: [],
    allowedOrigins: ["http://localhost:5000", "http://127.0.0.1:5000"],
    allowAnyOrigin: true,
  };

  let user = existing;
  if (!user) {
    user = await storage.createUser({
      name: "MM Browser Test",
      email: TEST_EMAIL,
      password: passwordHash,
      businessName: "MM Browser Realty",
      onboardingCompleted: true,
      billingPlan: "pro",
      planOverride: "pro",
      planOverrideEnabled: true,
      aiBrainEntitlementOverrideEnabled: true,
      aiBrainEntitlementOverrideGrant: true,
      trialEndsAt,
      trialStatus: "active",
      trialPlan: "pro_ai",
      emailVerifiedAt: new Date(),
      widgetSettings,
    } as any);
  } else {
    await storage.updateUser(user.id, {
      password: passwordHash,
      onboardingCompleted: true,
      billingPlan: "pro",
      planOverride: "pro",
      planOverrideEnabled: true,
      aiBrainEntitlementOverrideEnabled: true,
      aiBrainEntitlementOverrideGrant: true,
      trialEndsAt,
      trialStatus: "active",
      trialPlan: "pro_ai",
      emailVerifiedAt: new Date(),
      widgetSettings,
    } as any);
    user = (await storage.getUser(user.id)) || user;
  }

  const widgetPublicId = await ensureWidgetPublicId(user.id);
  await storage.upsertAiSettings(user.id, { aiMode: "full_auto" });
  await storage.upsertAiBusinessKnowledge(user.id, {
    businessName: "MM Browser Realty",
    aboutText: "We send approved flyers, brochures, and PDFs in Website Chat when visitors ask.",
    servicesProducts: "Residential listings, summer brochure, vintage listing flyer, pricing PDF.",
  } as any);

  console.log("[seed] ready");
  console.log(`[seed] email=${TEST_EMAIL}`);
  console.log(`[seed] userId=${user.id}`);
  console.log(`[seed] widgetPublicId=${widgetPublicId}`);
  console.log(`[seed] widget=http://localhost:5000/widget-frame/${widgetPublicId}`);
  console.log("[seed] inbox=/app/inbox ai-brain=/app/ai-brain");
}

main().catch((err) => {
  console.error("[seed] FAILED", err instanceof Error ? err.message : err);
  process.exit(1);
});
