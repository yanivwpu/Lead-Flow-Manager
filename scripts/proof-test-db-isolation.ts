/**
 * Prove TEST_DATABASE_URL is not the production DATABASE_URL before any writes.
 * Prints hosts/db names only — never passwords.
 */
import { config as loadDotenv } from "dotenv";
import dns from "node:dns/promises";
import { fileURLToPath } from "node:url";

loadDotenv();

type Fingerprint = {
  host: string;
  port: string;
  database: string;
  user: string;
  resolved: string[];
};

function parseDbUrl(raw: string): Fingerprint {
  const url = new URL(raw.replace(/^postgres:/i, "postgresql:"));
  return {
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase(),
    user: decodeURIComponent(url.username || "").toLowerCase(),
    resolved: [],
  };
}

async function resolveHost(host: string): Promise<string[]> {
  try {
    const records = await dns.lookup(host, { all: true });
    return [...new Set(records.map((r) => r.address))].sort();
  } catch {
    return [];
  }
}

function sameTarget(a: Fingerprint, b: Fingerprint): boolean {
  if (a.host === b.host && a.port === b.port && a.database === b.database && a.user === b.user) {
    return true;
  }
  if (
    a.resolved.length > 0 &&
    b.resolved.length > 0 &&
    a.database === b.database &&
    a.user === b.user &&
    a.resolved.some((ip) => b.resolved.includes(ip))
  ) {
    return true;
  }
  return false;
}

export async function proveTestDatabaseIsolation(): Promise<{
  test: Fingerprint;
  prod: Fingerprint;
}> {
  const prodRaw = String(process.env.DATABASE_URL || "").trim();
  const testRaw = String(process.env.TEST_DATABASE_URL || "").trim();
  if (!testRaw) throw new Error("TEST_DATABASE_URL is not set");
  if (!prodRaw) throw new Error("DATABASE_URL is not set; cannot compare against production");
  if (testRaw === prodRaw) throw new Error("TEST_DATABASE_URL equals DATABASE_URL");

  const prod = parseDbUrl(prodRaw);
  const test = parseDbUrl(testRaw);
  prod.resolved = await resolveHost(prod.host);
  test.resolved = await resolveHost(test.host);

  if (sameTarget(prod, test)) {
    throw new Error(
      `TEST_DATABASE_URL resolves to the same target as DATABASE_URL (${test.host}/${test.database})`,
    );
  }

  console.log("[DB isolation] production", {
    host: prod.host,
    database: prod.database,
    user: prod.user,
    resolvedCount: prod.resolved.length,
  });
  console.log("[DB isolation] throwaway test", {
    host: test.host,
    database: test.database,
    user: test.user,
    resolvedCount: test.resolved.length,
  });
  console.log("[DB isolation] OK — test database is distinct from production DATABASE_URL");
  return { test, prod };
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  proveTestDatabaseIsolation().catch((err) => {
    console.error("[DB isolation] FAILED", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
