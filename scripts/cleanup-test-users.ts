/**
 * List or remove users created by local integration/E2E tests.
 *
 * Safety: only targets emails on @test.com with known test prefixes.
 * Default is dry-run (list only). Pass --delete to remove.
 *
 * Usage:
 *   npx tsx scripts/cleanup-test-users.ts
 *   npx tsx scripts/cleanup-test-users.ts --delete
 *
 * Requires DATABASE_URL (same as dev — NOT production unless you pointed .env there).
 */
import "dotenv/config";
import { db } from "../drizzle/db";
import { users, contacts } from "../shared/schema";
import { eq, sql, or, like, inArray } from "drizzle-orm";

/** Email local-part prefixes used by tests in tests/*.test.ts */
const TEST_EMAIL_PREFIXES = [
  "replacement-e2e-",
  "inbound-contract-",
  "test-routing-",
  "multi-number-test-",
] as const;

const TEST_DISPLAY_NAMES = [
  "Replacement E2E",
  "Inbound Contract Test",
  "Routing Test User",
  "Multi-Number Test User",
] as const;

/** Never delete these even if they somehow matched a pattern. */
const PROTECTED_EMAILS = new Set([
  "demo@sales.com",
  "yanivharamaty@gmail.com",
]);

function dbHostLabel(): string {
  const url = process.env.DATABASE_URL || "";
  try {
    const u = new URL(url.replace(/^postgres:/, "postgresql:"));
    return `${u.hostname}${u.pathname}`;
  } catch {
    return url ? "(unparsed DATABASE_URL)" : "(missing DATABASE_URL)";
  }
}

function isTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (!lower.endsWith("@test.com")) return false;
  if (PROTECTED_EMAILS.has(lower)) return false;
  const local = lower.slice(0, -"@test.com".length);
  return TEST_EMAIL_PREFIXES.some((p) => local.startsWith(p));
}

async function findTestUsers() {
  const prefixConditions = TEST_EMAIL_PREFIXES.map((p) => like(users.email, `${p}%@test.com`));
  const nameConditions = TEST_DISPLAY_NAMES.map((n) => eq(users.name, n));

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      trialPlan: users.trialPlan,
    })
    .from(users)
    .where(or(...prefixConditions, ...nameConditions));

  return rows.filter((r) => isTestEmail(r.email) || TEST_DISPLAY_NAMES.includes(r.name as (typeof TEST_DISPLAY_NAMES)[number]));
}

async function countContactsForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(eq(contacts.userId, userId));
  return row?.count ?? 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const deleteMode = process.argv.includes("--delete");
  const host = dbHostLabel();

  console.log(`Database: ${host}`);
  console.log(`Mode: ${deleteMode ? "DELETE" : "dry-run (list only)"}\n`);

  if (/prod|railway\.app|whachatcrm/i.test(host) && deleteMode) {
    console.error(
      "Refusing --delete: DATABASE_URL host looks like production. Use a dev DATABASE_URL or remove test users manually after review.",
    );
    process.exit(1);
  }

  const candidates = await findTestUsers();

  if (candidates.length === 0) {
    console.log("No test-generated users found.");
    return;
  }

  for (const u of candidates) {
    const contactCount = await countContactsForUser(u.id);
    console.log(
      `- ${u.name} <${u.email}> id=${u.id} contacts=${contactCount} created=${u.createdAt?.toISOString?.() ?? u.createdAt} trial=${u.trialPlan ?? "—"}`,
    );
  }

  console.log(`\nTotal: ${candidates.length} test user(s).`);

  if (!deleteMode) {
    console.log("\nTo delete, run: npx tsx scripts/cleanup-test-users.ts --delete");
    return;
  }

  let deleted = 0;
  for (const u of candidates) {
    if (!isTestEmail(u.email) && !TEST_DISPLAY_NAMES.includes(u.name as (typeof TEST_DISPLAY_NAMES)[number])) {
      continue;
    }
    await db.delete(users).where(eq(users.id, u.id));
    deleted++;
    console.log(`Deleted: ${u.email}`);
  }

  console.log(`\nDeleted ${deleted} test user(s) (contacts cascade via FK).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
