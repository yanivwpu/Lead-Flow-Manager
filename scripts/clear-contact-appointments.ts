/**
 * Cancel/delete active upcoming appointments for a contact (test cleanup).
 *
 * Usage:
 *   npx tsx scripts/clear-contact-appointments.ts --name "Susu Sahbak" --dry-run
 *   npx tsx scripts/clear-contact-appointments.ts --name "Susu Sahbak"
 *   npx tsx scripts/clear-contact-appointments.ts --id <contact-uuid> [--dry-run]
 */
import "dotenv/config";
import { ilike } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts } from "../shared/schema";
import { isActiveFutureAppointment } from "../shared/activeAppointment";
import { storage } from "../server/storage";
import { clearBookedMeetingsForContact } from "../server/contactAppointmentSync";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

function readFlagValue(flag: string): string | undefined {
  const eqForm = argv.find((a) => a.startsWith(`${flag}=`));
  if (eqForm) return eqForm.slice(flag.length + 1);

  const idx = argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < argv.length && !argv[idx + 1].startsWith("--")) {
    return argv[idx + 1];
  }
  return undefined;
}

const nameArg = readFlagValue("--name");
const idArg = readFlagValue("--id");

function usage(): never {
  console.error(`Usage:
  npx tsx scripts/clear-contact-appointments.ts --name "Contact Name" [--dry-run]
  npx tsx scripts/clear-contact-appointments.ts --id <contact-uuid> [--dry-run]`);
  process.exit(1);
}

async function resolveContact(): Promise<{ id: string; name: string; userId: string; tag: string; followUp: string | null; followUpDate: Date | null }> {
  if (idArg) {
    const row = await storage.getContact(idArg);
    if (!row) {
      console.error(`No contact found for id=${idArg}`);
      process.exit(1);
    }
    return row;
  }

  if (!nameArg) usage();

  const matches = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      userId: contacts.userId,
      tag: contacts.tag,
      followUp: contacts.followUp,
      followUpDate: contacts.followUpDate,
    })
    .from(contacts)
    .where(ilike(contacts.name, nameArg));

  if (matches.length === 0) {
    const fuzzy = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(ilike(contacts.name, `%${nameArg}%`))
      .limit(10);
    console.error(`No exact contact match for name="${nameArg}".`);
    if (fuzzy.length > 0) {
      console.error("Similar names:");
      for (const c of fuzzy) console.error(`  ${c.id}  ${c.name}`);
    }
    process.exit(1);
  }

  if (matches.length > 1) {
    console.error(`Multiple contacts match name="${nameArg}". Use --id=:`);
    for (const c of matches) console.error(`  ${c.id}  ${c.name}`);
    process.exit(1);
  }

  return matches[0];
}

async function main() {
  const contact = await resolveContact();
  const appts = await storage.getAppointmentsByContact(contact.userId, contact.id);
  const active = appts.filter(isActiveFutureAppointment);

  console.log(`Contact: ${contact.name} (${contact.id})`);
  console.log(`Tag: ${contact.tag} (unchanged by this script)`);
  console.log(
    `Follow-up: ${contact.followUp ?? "(none)"}${contact.followUpDate ? ` @ ${contact.followUpDate.toISOString()}` : ""}`
  );
  console.log(`Active upcoming appointments: ${active.length}`);

  if (active.length === 0) {
    console.log("Nothing to delete. Checking follow-up-only state…");
    if (!contact.followUpDate && !contact.followUp) {
      console.log("No active appointments and no follow-up set.");
      return;
    }
    if (dryRun) {
      console.log("[would-clear] followUp + followUpDate (no active appointment rows)");
      return;
    }
    await storage.updateContact(
      contact.id,
      { followUp: null, followUpDate: null },
      { skipAutomationHooks: true }
    );
    console.log("[cleared] followUp + followUpDate");
    return;
  }

  for (const appt of active) {
    const when = appt.appointmentDate ? new Date(appt.appointmentDate).toISOString() : "?";
    console.log(`  - ${appt.id}  ${appt.title || appt.appointmentType}  ${when}  status=${appt.status}`);
  }

  if (dryRun) {
    console.log(`[would-delete] ${active.length} appointment row(s)`);
    if (contact.followUpDate || contact.followUp) {
      console.log("[would-clear] followUp + followUpDate");
    }
    return;
  }

  const result = await clearBookedMeetingsForContact(contact.userId, contact.id);
  console.log(`[deleted] ${result.clearedAppointmentIds.length} appointment row(s):`);
  for (const id of result.clearedAppointmentIds) console.log(`  - ${id}`);
  if (result.followUpCleared) {
    console.log("[cleared] followUp + followUpDate");
  } else {
    console.log("[follow-up] unchanged (already empty)");
  }

  const after = await storage.getContact(contact.id);
  const remaining = (await storage.getAppointmentsByContact(contact.userId, contact.id)).filter(
    isActiveFutureAppointment
  );
  console.log(`Remaining active appointments: ${remaining.length}`);
  console.log(`Tag after: ${after?.tag ?? "(missing)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
