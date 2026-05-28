/**
 * Server-side buyer preference extract + DB verify (no UI).
 *
 * Usage:
 *   npx tsx scripts/test-buyer-preference-extract.ts [contactId]
 *
 * Loads DATABASE_URL from `.env`. Mirrors POST /api/contacts/:id/buyer-preferences/extract.
 */
import "dotenv/config";
import pg from "pg";

const contactIdArg = (process.argv[2] || "").trim();

const buyerPrefLogs: object[] = [];
const origLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  for (const a of args) {
    if (typeof a === "string") {
      try {
        const o = JSON.parse(a) as { tag?: string };
        if (o.tag === "[BuyerPreference]" || o.tag === "[BuyerPreference:DB]") {
          buyerPrefLogs.push(o);
        }
      } catch {
        /* not JSON */
      }
    }
  }
  origLog(...args);
};

async function columnExists(client: pg.Client): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'buyer_preference_profile'`,
  );
  return (r.rowCount ?? 0) > 0;
}

async function readProfile(client: pg.Client, contactId: string): Promise<unknown> {
  const r = await client.query(
    `SELECT buyer_preference_profile FROM contacts WHERE id = $1`,
    [contactId],
  );
  return r.rows[0]?.buyer_preference_profile ?? null;
}

async function pickContact(client: pg.Client): Promise<string | null> {
  const r = await client.query(
    `SELECT c.id, c.user_id, c.name,
            length(coalesce(c.buyer_preference_profile::text, '{}')) AS profile_len,
            (SELECT count(*) FROM messages m
             JOIN conversations conv ON conv.id = m.conversation_id
             WHERE conv.contact_id = c.id AND m.direction = 'inbound') AS inbound_msgs
     FROM contacts c
     WHERE EXISTS (
       SELECT 1 FROM messages m
       JOIN conversations conv ON conv.id = m.conversation_id
       WHERE conv.contact_id = c.id AND length(coalesce(m.content, '')) > 20
     )
     ORDER BY inbound_msgs DESC
     LIMIT 5`,
  );
  if (!r.rows.length) return null;
  return r.rows[0].id as string;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({ error: "DATABASE_URL unset" }));
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const migrationOk = await columnExists(client);
  origLog(JSON.stringify({ step: "migration_check", buyer_preference_profile_column_exists: migrationOk }));
  if (!migrationOk) {
    await client.end();
    process.exit(2);
  }

  let contactId = contactIdArg;
  if (!contactId) {
    contactId = (await pickContact(client)) || "";
    origLog(JSON.stringify({ step: "auto_picked_contact", contactId: contactId || null }));
  }
  if (!contactId) {
    await client.end();
    console.error(JSON.stringify({ error: "No contactId and no suitable contact found" }));
    process.exit(3);
  }

  const beforeRow = await client.query(
    `SELECT id, user_id, name, buyer_preference_profile FROM contacts WHERE id = $1`,
    [contactId],
  );
  if (!beforeRow.rows[0]) {
    await client.end();
    console.error(JSON.stringify({ error: "contact_not_found", contactId }));
    process.exit(4);
  }
  const userId = beforeRow.rows[0].user_id as string;
  const beforeProfile = beforeRow.rows[0].buyer_preference_profile;

  origLog(
    JSON.stringify({
      step: "before_extract",
      contactId,
      userId,
      name: beforeRow.rows[0].name,
      buyer_preference_profile: beforeProfile,
    }),
  );

  process.env.DEBUG_BUYER_PREFS = "1";

  const { shouldRunBuyerPreferencePipeline, runBuyerPreferenceExtraction } = await import(
    "../server/buyerPreferenceService"
  );
  const { storage } = await import("../server/storage");

  const contact = await storage.getContact(contactId);
  if (!contact) {
    await client.end();
    process.exit(5);
  }

  const gate = await shouldRunBuyerPreferencePipeline(userId, contact);
  origLog(JSON.stringify({ step: "gate", ...gate }));

  if (!gate.ok) {
    await client.end();
    origLog(JSON.stringify({ step: "aborted", reason: "gate_failed" }));
    process.exit(6);
  }

  origLog(JSON.stringify({ step: "running_extract", triggerSource: "api:buyer-preferences/extract" }));

  await runBuyerPreferenceExtraction(userId, contactId, {
    triggerSource: "api:buyer-preferences/extract",
  });

  const afterProfile = await readProfile(client, contactId);
  await client.end();

  const persistLogs = buyerPrefLogs.filter((l) => {
    const e = (l as { event?: string }).event || "";
    return (
      e.includes("normalized_patch") ||
      e.includes("persist_") ||
      e.includes("extraction_") ||
      e.includes("llm_")
    );
  });

  const normalizedPatchLog = buyerPrefLogs.find(
    (l) => (l as { event?: string }).event === "persist_normalized_patch",
  ) as { patchKeys?: number; patchFields?: string[] } | undefined;

  const dbPayloadLog = buyerPrefLogs.find(
    (l) => (l as { event?: string }).event === "persist_db_update_payload",
  ) as { fieldKeys?: string[] } | undefined;

  const dbSavedLog = buyerPrefLogs.find(
    (l) => (l as { event?: string }).event === "persist_db_saved_profile",
  ) as { savedFieldKeys?: string[] } | undefined;

  const report = {
    manual_extract_ran: true,
    contactId,
    userId,
    gate,
    buyerPreferenceLogs: buyerPrefLogs,
    normalized_patch_keys: normalizedPatchLog?.patchKeys ?? null,
    normalized_patch_fields: normalizedPatchLog?.patchFields ?? null,
    persist_db_update_payload_fieldKeys: dbPayloadLog?.fieldKeys ?? null,
    persist_db_saved_profile_savedFieldKeys: dbSavedLog?.savedFieldKeys ?? null,
    sql_before: beforeProfile,
    sql_after: afterProfile,
    profile_changed: JSON.stringify(beforeProfile) !== JSON.stringify(afterProfile),
    after_is_nonempty:
      afterProfile != null &&
      typeof afterProfile === "object" &&
      Object.keys(afterProfile as object).filter(
        (k) => !["schemaVersion", "profileStatus", "lastExtractedAt", "lastInboundAt"].includes(k),
      ).length > 0,
  };

  origLog(JSON.stringify({ step: "report", ...report }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
