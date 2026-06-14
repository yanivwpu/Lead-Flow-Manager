/**
 * Guard + helpers for integration tests that write to Postgres.
 *
 * Refuses to run unless:
 *   - TEST_DATABASE_URL is set (preferred — copied to DATABASE_URL), or
 *   - ALLOW_DB_TEST_WRITES=1 (explicit opt-in to use DATABASE_URL)
 *
 * Import and call prepareDbTestEnvironment() before any import of drizzle/db or server/storage.
 */
import { config as loadDotenv } from "dotenv";

loadDotenv();

export type DbTestGuardSource = "TEST_DATABASE_URL" | "ALLOW_DB_TEST_WRITES";

export type DbTestGuardResult = {
  databaseUrl: string;
  source: DbTestGuardSource;
  hostLabel: string;
};

function hostLabel(url: string): string {
  try {
    const u = new URL(url.replace(/^postgres:/, "postgresql:"));
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unparsed URL)";
  }
}

/**
 * Configure DATABASE_URL for a DB-writing test. Throws if writes are not explicitly allowed.
 */
export function prepareDbTestEnvironment(testName?: string): DbTestGuardResult {
  const label = testName ?? "DB integration test";
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  const allowDev = process.env.ALLOW_DB_TEST_WRITES === "1";
  const devUrl = process.env.DATABASE_URL?.trim();

  if (testUrl) {
    process.env.DATABASE_URL = testUrl;
    const host = hostLabel(testUrl);
    console.log(`[DbTestGuard] ${label}: using TEST_DATABASE_URL (${host})`);
    return { databaseUrl: testUrl, source: "TEST_DATABASE_URL", hostLabel: host };
  }

  if (allowDev && devUrl) {
    const host = hostLabel(devUrl);
    console.warn(
      `[DbTestGuard] ${label}: ALLOW_DB_TEST_WRITES=1 — writing to DATABASE_URL (${host}). Prefer TEST_DATABASE_URL for isolation.`,
    );
    return { databaseUrl: devUrl, source: "ALLOW_DB_TEST_WRITES", hostLabel: host };
  }

  throw new Error(
    `[DbTestGuard] Refusing DB writes for ${label}.\n` +
      `  Set TEST_DATABASE_URL to a dedicated test database (recommended), or\n` +
      `  set ALLOW_DB_TEST_WRITES=1 to explicitly allow writes to DATABASE_URL.`,
  );
}

/** Delete a test workspace user; cascades contacts, conversations, trials, etc. */
export async function deleteTestUser(userId: string): Promise<void> {
  if (!userId) return;
  const { db } = await import("../../drizzle/db");
  const { users } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  await db.delete(users).where(eq(users.id, userId));
}

/** Delete test user — logs and swallows errors so finally blocks stay safe. */
export async function teardownTestUser(userId: string | undefined, testName?: string): Promise<void> {
  if (!userId) return;
  try {
    await deleteTestUser(userId);
    console.log(`[Teardown] ${testName ?? "test"}: deleted user ${userId}`);
  } catch (err) {
    console.warn(`[Teardown] ${testName ?? "test"}: cleanup failed (non-fatal):`, err);
  }
}

/** True when DB test writes are permitted (without throwing). */
export function isDbTestWriteAllowed(): boolean {
  return !!(process.env.TEST_DATABASE_URL?.trim() || process.env.ALLOW_DB_TEST_WRITES === "1");
}
