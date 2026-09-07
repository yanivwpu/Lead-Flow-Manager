/**
 * Read-only Website Chat contact identity preflight.
 * Prints aggregate counts only — never names, emails, phones, visitor IDs, widget IDs, or message content.
 *
 * Usage: npx tsx scripts/preflight-webchat-contact-identity.ts
 */
import "dotenv/config";
import { contacts } from "../shared/schema";
import { aggregateWebchatContactPreflight } from "../shared/webchatContactIdentity";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("webchat_contact_preflight: skipped (no DATABASE_URL)");
    return;
  }
  const { db } = await import("../drizzle/db");
  const rows = await db
    .select({
      id: contacts.id,
      userId: contacts.userId,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      source: contacts.source,
      primaryChannel: contacts.primaryChannel,
      webchatId: contacts.webchatId,
      customFields: contacts.customFields,
      sourceDetails: contacts.sourceDetails,
    })
    .from(contacts);

  const aggregates = aggregateWebchatContactPreflight(rows);
  console.log(
    JSON.stringify(
      {
        event: "webchat_contact_preflight",
        readOnly: true,
        mutated: false,
        totalContactsScanned: rows.length,
        ...aggregates,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("webchat_contact_preflight_failed", err instanceof Error ? err.name : "error");
  process.exitCode = 1;
});
