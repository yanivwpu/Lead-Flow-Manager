/**
 * Opt-in Website Chat canonical identity repair.
 * Uses the same form/lifecycle write policy as live form submit — not a separate unsafe patch.
 *
 * Dry-run (default):
 *   npx tsx scripts/repair-webchat-form-canonical-identity.ts
 *
 * Apply (explicit, never run from deploy):
 *   ALLOW_WEBCHAT_IDENTITY_REPAIR=1 npx tsx scripts/repair-webchat-form-canonical-identity.ts --apply
 *
 * Prints aggregate counts only — never names, emails, phones, visitor IDs, or message content.
 */
import "dotenv/config";
import { contacts } from "../shared/schema";
import { eq } from "drizzle-orm";
import {
  identityFromWebchatFormSnapshot,
  isWebchatSourcedContact,
  stampIdentifiedWebchatIdentity,
} from "../shared/webchatContactIdentity";
import {
  shouldWriteWebchatCanonicalEmail,
  shouldWriteWebchatCanonicalName,
  shouldWriteWebchatCanonicalPhone,
} from "../shared/webchatFormContactPatch";
import {
  preserveWebchatVisitorIdentity,
  readStoredWebchatVisitorId,
} from "../shared/webchatContactLookup";

function wantsApply(): boolean {
  return process.argv.includes("--apply") && process.env.ALLOW_WEBCHAT_IDENTITY_REPAIR === "1";
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("webchat_identity_repair: skipped (no DATABASE_URL)");
    return;
  }
  const apply = wantsApply();
  const { db } = await import("../drizzle/db");
  const rows = await db
    .select({
      id: contacts.id,
      userId: contacts.userId,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      webchatId: contacts.webchatId,
      source: contacts.source,
      primaryChannel: contacts.primaryChannel,
      lastIncomingChannel: contacts.lastIncomingChannel,
      customFields: contacts.customFields,
      sourceDetails: contacts.sourceDetails,
    })
    .from(contacts);

  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let skippedNoFormIdentity = 0;
  let skippedCanonicalLocked = 0;

  for (const row of rows) {
    scanned += 1;
    if (!isWebchatSourcedContact(row)) continue;
    const fromForm = identityFromWebchatFormSnapshot(row);
    if (!fromForm.name && !fromForm.email && !fromForm.phone) {
      skippedNoFormIdentity += 1;
      continue;
    }
    const alreadyIdentified = true;
    const patch: {
      name?: string;
      email?: string;
      phone?: string;
      webchatId?: string;
      customFields: Record<string, unknown>;
    } = {
      customFields: stampIdentifiedWebchatIdentity(
        preserveWebchatVisitorIdentity(
          (row.customFields as Record<string, unknown> | undefined) || {},
          readStoredWebchatVisitorId(row) || "",
        ),
        { identifiedAt: new Date().toISOString(), repaired: true },
      ),
    };
    let dirty = false;
    if (fromForm.name && shouldWriteWebchatCanonicalName(row, alreadyIdentified)) {
      patch.name = fromForm.name;
      dirty = true;
    }
    if (fromForm.email && shouldWriteWebchatCanonicalEmail(row, alreadyIdentified)) {
      patch.email = fromForm.email;
      dirty = true;
    }
    if (fromForm.phone && shouldWriteWebchatCanonicalPhone(row, alreadyIdentified)) {
      patch.phone = fromForm.phone;
      dirty = true;
    }
    const visitorId = readStoredWebchatVisitorId(row);
    if (visitorId && !row.webchatId) {
      patch.webchatId = visitorId;
      dirty = true;
    }
    if (!dirty) {
      skippedCanonicalLocked += 1;
      continue;
    }
    wouldUpdate += 1;
    if (!apply) continue;
    await db.update(contacts).set(patch).where(eq(contacts.id, row.id));
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        event: "webchat_identity_repair",
        readOnly: !apply,
        mutated: apply,
        applyRequested: process.argv.includes("--apply"),
        allowFlag: process.env.ALLOW_WEBCHAT_IDENTITY_REPAIR === "1",
        totalContactsScanned: scanned,
        wouldUpdate,
        updated,
        skippedNoFormIdentity,
        skippedCanonicalLocked,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("webchat_identity_repair_failed", err instanceof Error ? err.name : "error");
  process.exitCode = 1;
});
