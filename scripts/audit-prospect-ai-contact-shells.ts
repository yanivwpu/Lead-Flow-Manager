/**
 * STRICTLY READ ONLY. Classifies legacy Prospect AI identities without mutation.
 * Usage: DATABASE_URL=... npx tsx scripts/audit-prospect-ai-contact-shells.ts
 */
import "dotenv/config";
import pg from "pg";

const url = String(process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error("DATABASE_URL is not set; production count was not queried.");
  process.exitCode = 2;
} else {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    // Defense in depth: PostgreSQL rejects INSERT/UPDATE/DELETE/DDL in this transaction.
    await client.query("BEGIN READ ONLY");
    const totals = await client.query(`
      WITH tagged AS (
        SELECT
          c.id,
          c.user_id,
          lower(trim(coalesce(c.email, ''))) AS email_key,
          regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') AS phone_key,
          coalesce(c.source_details->>'contactLifecycle', '') AS lifecycle,
          coalesce(c.source_details->'prospectAi'->>'placeId', '') AS place_id
        FROM contacts c
        WHERE c.tag = 'Discovered-ProspectAI'
      ), message_counts AS (
        SELECT
          t.id,
          count(m.id)::int AS message_count,
          count(m.id) FILTER (WHERE m.direction = 'inbound')::int AS inbound_count,
          count(m.id) FILTER (WHERE m.direction = 'outbound')::int AS outbound_count
        FROM tagged t
        LEFT JOIN messages m ON m.contact_id = t.id
        GROUP BY t.id
      ), duplicate_keys AS (
        SELECT t.id
        FROM tagged t
        JOIN tagged other ON other.user_id = t.user_id AND other.id <> t.id
          AND (
            (t.email_key <> '' AND other.email_key = t.email_key) OR
            (length(t.phone_key) >= 7 AND other.phone_key = t.phone_key) OR
            (t.place_id <> '' AND other.place_id = t.place_id)
          )
        GROUP BY t.id
      ), classified AS (
        SELECT
          t.*,
          m.message_count,
          m.inbound_count,
          m.outbound_count,
          (d.id IS NOT NULL) AS duplicate_identity,
          (t.lifecycle = 'prospect_only' AND m.inbound_count > 0) AS replied_but_hidden,
          (t.lifecycle NOT IN ('prospect_only', 'saved', 'inbox_only', '')) AS unknown_lifecycle
        FROM tagged t
        JOIN message_counts m ON m.id = t.id
        LEFT JOIN duplicate_keys d ON d.id = t.id
      )
      SELECT
        count(*)::int AS total_prospect_ai_tagged_identities,
        count(*) FILTER (WHERE lifecycle = 'prospect_only')::int AS prospect_only_identities,
        count(*) FILTER (
          WHERE inbound_count = 0 AND lifecycle <> 'prospect_only'
        )::int AS legacy_zero_inbound_incorrectly_visible,
        count(*) FILTER (
          WHERE outbound_count > 0 AND inbound_count = 0
        )::int AS outbound_only_identities,
        count(*) FILTER (WHERE inbound_count > 0)::int AS identities_with_inbound,
        count(*) FILTER (
          WHERE duplicate_identity OR replied_but_hidden OR unknown_lifecycle
        )::int AS ambiguous_records
      FROM classified
    `);
    const ambiguous = await client.query(`
      WITH tagged AS (
        SELECT c.id, c.user_id,
          lower(trim(coalesce(c.email, ''))) email_key,
          regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') phone_key,
          coalesce(c.source_details->>'contactLifecycle', '') lifecycle,
          coalesce(c.source_details->'prospectAi'->>'placeId', '') place_id
        FROM contacts c WHERE c.tag = 'Discovered-ProspectAI'
      ), inbound AS (
        SELECT contact_id, count(*)::int n FROM messages
        WHERE direction = 'inbound' GROUP BY contact_id
      )
      SELECT t.id AS contact_id,
        array_remove(ARRAY[
          CASE WHEN coalesce(i.n, 0) > 0 AND t.lifecycle = 'prospect_only' THEN 'replied_but_hidden' END,
          CASE WHEN EXISTS (
            SELECT 1 FROM tagged o WHERE o.user_id=t.user_id AND o.id<>t.id AND (
              (t.email_key<>'' AND o.email_key=t.email_key) OR
              (length(t.phone_key)>=7 AND o.phone_key=t.phone_key) OR
              (t.place_id<>'' AND o.place_id=t.place_id)
            )
          ) THEN 'duplicate_identity' END,
          CASE WHEN t.lifecycle NOT IN ('prospect_only','saved','inbox_only','') THEN 'unknown_lifecycle' END
        ], NULL) AS reasons
      FROM tagged t LEFT JOIN inbound i ON i.contact_id=t.id
      WHERE (coalesce(i.n, 0)>0 AND t.lifecycle='prospect_only') OR
        t.lifecycle NOT IN ('prospect_only','saved','inbox_only','') OR EXISTS (
          SELECT 1 FROM tagged o WHERE o.user_id=t.user_id AND o.id<>t.id AND (
            (t.email_key<>'' AND o.email_key=t.email_key) OR
            (length(t.phone_key)>=7 AND o.phone_key=t.phone_key) OR
            (t.place_id<>'' AND o.place_id=t.place_id)
          )
        )
      ORDER BY t.id
    `);
    console.log(JSON.stringify({
      audit: "prospect_ai_contact_shells",
      ...totals.rows[0],
      ambiguous_records: ambiguous.rows,
      note: "Inbound means a persisted messages.direction='inbound' row; ambiguous rows require manual review.",
    }, null, 2));
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
