/**
 * Clear legacy contact.tag = "Appointment Scheduled" (appointment state belongs in appointments table).
 *
 * Usage:
 *   npx tsx scripts/repair-stale-appointment-tags.ts [--dry-run] [--limit N]
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts } from "../shared/schema";
import { APPOINTMENT_SCHEDULED_TAG } from "../shared/activeAppointment";
import { clearStaleAppointmentScheduledTag } from "../server/contactAppointmentSync";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Number.parseInt(limitArg?.split("=")[1] ?? "5000", 10);

async function main() {
  const staleCandidates = await db
    .select({ id: contacts.id, name: contacts.name })
    .from(contacts)
    .where(eq(contacts.tag, APPOINTMENT_SCHEDULED_TAG))
    .limit(limit);

  console.log(`Found ${staleCandidates.length} contact(s) tagged "${APPOINTMENT_SCHEDULED_TAG}" (limit ${limit})`);

  let cleared = 0;

  for (const row of staleCandidates) {
    if (dryRun) {
      console.log(`[would-clear] ${row.id} ${row.name}`);
      cleared++;
      continue;
    }

    const result = await clearStaleAppointmentScheduledTag(row.id);
    if (result.changed) {
      cleared++;
      console.log(`[cleared] ${row.id} ${row.name}`);
    }
  }

  console.log(dryRun ? `Dry run complete: would clear ${cleared}` : `Repair complete: cleared ${cleared}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
