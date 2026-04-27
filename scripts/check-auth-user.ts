/**
 * Read-only diagnostic: resolves a user by email (case-insensitive) and prints non-secret facts.
 * Usage: npx tsx scripts/check-auth-user.ts [email]
 * Loads DATABASE_URL from environment (e.g. `.env` via dotenv).
 */
import "dotenv/config";
import pg from "pg";

function dbHostHint(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return "(DATABASE_URL unset)";
  try {
    const u = new URL(raw.includes("://") ? raw : `postgresql://${raw}`);
    return u.hostname || "(unknown host)";
  } catch {
    return "(could not parse DATABASE_URL host)";
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(
      JSON.stringify({
        error: "DATABASE_URL is not set (cannot connect)",
        dbHostHint: dbHostHint(),
      }),
    );
    process.exit(1);
  }

  const probe =
    (process.argv[2] || "yahabegood@gmail.com").trim().toLowerCase();

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query<{
      id: string;
      email: string;
      pwd_len: string;
      pwd_prefix: string;
    }>(
      `select id, email,
              length(password)::text as pwd_len,
              substring(password, 1, 4) as pwd_prefix
       from users
       where lower(email) = lower($1)
       limit 5`,
      [probe],
    );

    const rows = result.rows;
    const first = rows[0];

    console.log(
      JSON.stringify({
        dbHostHint: dbHostHint(),
        emailProbe: probe,
        rowMatchCount: rows.length,
        userFound: rows.length > 0,
        passwordFieldLength: first?.pwd_len ?? null,
        storedPasswordPrefixSample: first?.pwd_prefix ?? null,
        storedLooksLikeBcrypt: first?.pwd_prefix?.startsWith("$2") ?? false,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[check-auth-user] failed:", err?.message || err);
  process.exit(1);
});
