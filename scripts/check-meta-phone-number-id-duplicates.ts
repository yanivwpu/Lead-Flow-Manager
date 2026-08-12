/**
 * Preflight for migration 0078 — report duplicate meta_phone_number_id groups without PII.
 * Usage: npx tsx scripts/check-meta-phone-number-id-duplicates.ts
 */
import "dotenv/config";
import pg from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{
      phone_tail: string;
      owner_count: string;
    }>(`
      SELECT
        RIGHT(meta_phone_number_id, 6) AS phone_tail,
        COUNT(*)::text AS owner_count
      FROM users
      WHERE meta_phone_number_id IS NOT NULL
        AND btrim(meta_phone_number_id) <> ''
      GROUP BY meta_phone_number_id
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, phone_tail
      LIMIT 50
    `);

    if (rows.length === 0) {
      console.log(JSON.stringify({ ok: true, duplicateGroups: 0 }, null, 2));
      return;
    }

    console.log(
      JSON.stringify(
        {
          ok: false,
          duplicateGroups: rows.length,
          samples: rows.map((r) => ({
            phoneNumberIdLast6: r.phone_tail,
            ownerCount: Number(r.owner_count),
          })),
          hint: "Resolve ownership before applying migrations/0078_users_meta_phone_number_id_unique.sql",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
