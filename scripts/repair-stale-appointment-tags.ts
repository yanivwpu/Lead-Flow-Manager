/**
 * Clear stale contact.tag = "Appointment Scheduled" when no active upcoming appointment exists.
 *
 * Usage:
 *   npx tsx scripts/repair-stale-appointment-tags.ts [--dry-run] [--limit N]
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts } from "../shared/schema";
import { APPOINTMENT_SCHEDULED_TAG } from "../shared/activeAppointment";
import { syncContactAppointmentFlags } from "../server/contactAppointmentSync";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Number.parseInt(limitArg?.split("=")[1] ?? "5000", 10);

async function main() {
  const staleCandidates = await db
    .select({ id: contacts.id, name: contacts.name, userId: contacts.userId })
    .from(contacts)
    .where(eq(contacts.tag, APPOINTMENT_SCHEDULED_TAG))
    .limit(limit);

  console.log(`Found ${staleCandidates.length} contact(s) tagged "${APPOINTMENT_SCHEDULED_TAG}" (limit ${limit})`);

  let cleared = 0;
  let kept = 0;

  for (const row of staleCandidates) {
    if (dryRun) {
      const { contactHasActiveUpcomingAppointment } = await import("../server/contactAppointmentSync");
      const hasActive = await contactHasActiveUpcomingAppointment(row.userId, row.id);
      if (hasActive) {
        kept++;
        console.log(`[keep] ${row.id} ${row.name}`);
      } else {
        cleared++;
        console.log(`[would-clear] ${row.id} ${row.name}`);
      }
      continue;
    }

    const result = await syncContactAppointmentFlags(row.id);
    if (result.clearedTag) {
      cleared++;
      console.log(`[cleared] ${row.id} ${row.name}`);
    } else {
      kept++;
    }
  }

  console.log(
    dryRun
      ? `Dry run complete: would clear ${cleared}, keep ${kept}`
      : `Repair complete: cleared ${cleared}, kept ${kept}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
