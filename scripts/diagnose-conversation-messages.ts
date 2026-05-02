/**
 * Temporary diagnostic: inspect Neon data + schema for one conversation.
 *
 * Usage:
 *   npx tsx scripts/diagnose-conversation-messages.ts 2b0fcf81-2ab1-4464-853b-7561968e3252
 *   npx tsx scripts/diagnose-conversation-messages.ts <conversationId> [userEmail]
 *
 * Loads DATABASE_URL from the environment (e.g. `.env` via dotenv).
 * Optional userEmail: if provided, checks whether conversation.user_id matches that user.
 */
import "dotenv/config";
import pg from "pg";

const REQUIRED_CHECK_COLS = [
  "media_url",
  "provider_media_url",
  "provider_media_id",
  "media_mime_type",
  "media_size",
  "media_storage_key",
  "media_stored_at",
] as const;

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
  const conversationId = (process.argv[2] || "").trim();
  const userEmail = (process.argv[3] || "").trim().toLowerCase() || null;

  if (!conversationId) {
    console.log(
      JSON.stringify(
        {
          error: "Pass conversationId as first argument",
          example:
            "npx tsx scripts/diagnose-conversation-messages.ts 2b0fcf81-2ab1-4464-853b-7561968e3252",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.log(
      JSON.stringify(
        {
          error: "DATABASE_URL is not set",
          dbHostHint: dbHostHint(),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const colRows = await pool.query<{ column_name: string; data_type: string }>(
      `select column_name, data_type
       from information_schema.columns
       where table_schema = 'public' and table_name = 'messages'
       order by ordinal_position`,
    );

    const colSet = new Set(colRows.rows.map((r) => r.column_name));
    const columnCheck: Record<string, boolean> = {};
    for (const c of REQUIRED_CHECK_COLS) {
      columnCheck[c] = colSet.has(c);
    }

    const conv = await pool.query<{
      id: string;
      user_id: string;
      contact_id: string;
      channel: string;
    }>(
      `select id, user_id, contact_id, channel
       from conversations
       where id = $1
       limit 1`,
      [conversationId],
    );

    const convRow = conv.rows[0];
    const messageCount = await pool.query<{ count: string }>(
      `select count(*)::text as count from messages where conversation_id = $1`,
      [conversationId],
    );

    const latest = await pool.query(
      `select *
       from messages
       where conversation_id = $1
       order by created_at desc
       limit 5`,
      [conversationId],
    );

    let userMatch: { userEmail: string | null; ok: boolean | null; reason: string } = {
      userEmail,
      ok: null,
      reason: "no user email provided",
    };
    if (userEmail && convRow) {
      const u = await pool.query<{ id: string }>(
        `select id from users where lower(email) = lower($1) limit 1`,
        [userEmail],
      );
      if (u.rows[0]) {
        userMatch = {
          userEmail,
          ok: u.rows[0].id === convRow.user_id,
          reason: u.rows[0].id === convRow.user_id ? "user id matches" : "user id does not match conversation.user_id",
        };
      } else {
        userMatch = { userEmail, ok: null, reason: "no user found for that email" };
      }
    }

    const out = {
      dbHostHint: dbHostHint(),
      conversationId,
      conversationRowFound: !!convRow,
      conversation: convRow ?? null,
      messageCount: messageCount.rows[0]?.count ?? "0",
      latestMessages: latest.rows,
      messagesTableColumns: colRows.rows,
      requiredColumnPresence: columnCheck,
      suggestedMigrationIfMissingProviderCols:
        !columnCheck.provider_media_url ||
        !columnCheck.provider_media_id ||
        !columnCheck.media_mime_type
          ? "Run migrations/0004_message_media_persistence.sql on this database (adds provider_* and media_* columns)."
          : null,
    };

    console.log(JSON.stringify(out, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  const e = err as { code?: string; detail?: string; message?: string };
  console.error(
    JSON.stringify(
      {
        fatal: true,
        message: e?.message || String(err),
        code: e?.code,
        detail: e?.detail,
        stack: err instanceof Error ? err.stack : undefined,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
