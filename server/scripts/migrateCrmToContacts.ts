/**
 * CRM field migration: legacy chats → unified inbox contacts
 *
 * Matches chats to contacts using the same phone normalization as
 * channelService.processIncomingMessage (strip all non-digits).
 *
 * Usage:
 *   npx tsx server/scripts/migrateCrmToContacts.ts           ← dry-run (default)
 *   npx tsx server/scripts/migrateCrmToContacts.ts --execute ← apply writes
 */

import { db } from "../../drizzle/db";
import { chats, contacts, type Chat, type Contact } from "@shared/schema";
import { eq } from "drizzle-orm";

const EXECUTE = process.argv.includes("--execute");

// ─── Same logic as channelService.processIncomingMessage ─────────────────────
function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

// ─── Report types ─────────────────────────────────────────────────────────────
interface MatchedPair {
  chatId: string;
  chatName: string;
  chatPhone: string;
  chatPhoneNorm: string;
  contactId: string;
  contactName: string;
  contactWhatsappId: string | null;
  contactPhoneNorm: string;

  // What will be written
  willWriteCustomFields: boolean;
  willWriteCrmFields: boolean;

  // Source values
  chatCustomFields: Record<string, any>;
  contactCustomFields: Record<string, any>;
  crmDiff: Record<string, { chat: any; contact: any }>;
}

interface AmbiguousChat {
  chatId: string;
  chatPhone: string;
  chatPhoneNorm: string;
  contactMatches: string[];
}

interface AmbiguousContact {
  contactId: string;
  contactWhatsappId: string | null;
  contactPhoneNorm: string;
  chatMatches: string[];
}

interface Report {
  totalChats: number;
  totalContacts: number;
  matched: MatchedPair[];
  unmatchedChats: { chatId: string; chatPhone: string; chatPhoneNorm: string }[];
  unmatchedContacts: { contactId: string; contactWhatsappId: string | null; contactPhone: string | null }[];
  ambiguousChats: AmbiguousChat[];
  ambiguousContacts: AmbiguousContact[];
}

// ─── CRM fields to backfill (chats → contacts) ────────────────────────────────
const CRM_FIELDS = ["tag", "pipelineStage", "notes", "followUp", "followUpDate", "assignedTo"] as const;
type CrmField = typeof CRM_FIELDS[number];

// Defaults that mean "not set" on the contact — we only backfill if the contact
// is still at its schema default while the chat has a non-default value.
const CONTACT_DEFAULTS: Record<CrmField, any> = {
  tag: "New",
  pipelineStage: "Lead",
  notes: "",
  followUp: null,
  followUpDate: null,
  assignedTo: null,
};

function isAtDefault(field: CrmField, value: any): boolean {
  const def = CONTACT_DEFAULTS[field];
  if (def === null) return value === null || value === undefined;
  if (def === "") return !value || value === "";
  return value === def;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  CRM → Contacts Migration Script`);
  console.log(`  Mode: ${EXECUTE ? "⚡ EXECUTE (writes enabled)" : "🔍 DRY-RUN (read-only)"}`);
  console.log(`${"─".repeat(60)}\n`);

  // Load all chats with a whatsapp phone
  const allChats: Chat[] = await db.select().from(chats);
  const whatsappChats: Chat[] = allChats.filter(c => c.whatsappPhone && normalizePhone(c.whatsappPhone).length > 0);

  // Load all contacts
  const allContacts: Contact[] = await db.select().from(contacts);

  console.log(`📊 Loaded ${allChats.length} total chats (${whatsappChats.length} with WhatsApp phone)`);
  console.log(`📊 Loaded ${allContacts.length} total contacts\n`);

  // Build normalized lookup maps
  // chat: normalized phone → list of chatIds (detect duplicates)
  const chatByNorm = new Map<string, string[]>();
  for (const chat of whatsappChats) {
    const norm = normalizePhone(chat.whatsappPhone);
    if (!norm) continue;
    const existing = chatByNorm.get(norm) || [];
    existing.push(chat.id);
    chatByNorm.set(norm, existing);
  }

  // contact: normalized whatsappId (or phone as fallback) → list of contactIds
  const contactByNorm = new Map<string, string[]>();
  for (const contact of allContacts) {
    // Primary: whatsappId (already stored as digits-only by channelService)
    const normId = normalizePhone(contact.whatsappId);
    // Fallback: phone field
    const normPhone = normalizePhone(contact.phone);

    // Use whatsappId first, fall back to phone
    const norm = normId || normPhone;
    if (!norm) continue;

    const existing = contactByNorm.get(norm) || [];
    existing.push(contact.id);
    contactByNorm.set(norm, existing);
  }

  const report: Report = {
    totalChats: whatsappChats.length,
    totalContacts: allContacts.length,
    matched: [],
    unmatchedChats: [],
    unmatchedContacts: [],
    ambiguousChats: [],
    ambiguousContacts: [],
  };

  // Build a lookup by contactId for quick access
  const contactById = new Map<string, Contact>(allContacts.map(c => [c.id, c]));
  const chatById = new Map<string, Chat>(whatsappChats.map(c => [c.id, c]));

  // Track which contacts have been matched (to find unmatched contacts)
  const matchedContactIds = new Set<string>();
  const matchedChatIds = new Set<string>();

  // ─── Match each unique normalized phone ────────────────────────────────────
  const allNorms = Array.from(chatByNorm.keys());

  for (const norm of allNorms) {
    const chatIds = chatByNorm.get(norm) || [];
    const contactIds = contactByNorm.get(norm) || [];

    // Ambiguous on chat side (two chats with same phone for same user)
    if (chatIds.length > 1) {
      report.ambiguousChats.push({
        chatId: chatIds.join(", "),
        chatPhone: chatById.get(chatIds[0])?.whatsappPhone || "",
        chatPhoneNorm: norm,
        contactMatches: contactIds,
      });
      continue;
    }

    // Ambiguous on contact side
    if (contactIds.length > 1) {
      report.ambiguousContacts.push({
        contactId: contactIds.join(", "),
        contactWhatsappId: contactById.get(contactIds[0])?.whatsappId || null,
        contactPhoneNorm: norm,
        chatMatches: chatIds,
      });
      continue;
    }

    // No contact match
    if (contactIds.length === 0) {
      const chat = chatById.get(chatIds[0]);
      if (chat) {
        report.unmatchedChats.push({
          chatId: chat.id,
          chatPhone: chat.whatsappPhone || "",
          chatPhoneNorm: norm,
        });
      }
      continue;
    }

    // Perfect 1:1 match
    const chat = chatById.get(chatIds[0]);
    const contact = contactById.get(contactIds[0]);
    if (!chat || !contact) continue;

    matchedChatIds.add(chat.id);
    matchedContactIds.add(contact.id);

    const chatCf = (chat as any).customFields as Record<string, any> || {};
    const contactCf = (contact.customFields as Record<string, any>) || {};

    // customFields: write if chat has non-empty customFields and contact is empty
    const chatHasCf = Object.keys(chatCf).length > 0;
    const contactCfEmpty = Object.keys(contactCf).length === 0;
    const willWriteCustomFields = chatHasCf && contactCfEmpty;

    // CRM fields: write only fields where contact is at default and chat has a different value
    const crmDiff: Record<string, { chat: any; contact: any }> = {};
    for (const field of CRM_FIELDS) {
      const chatVal = (chat as any)[field];
      const contactVal = (contact as any)[field];
      if (!isAtDefault(field, contactVal) && chatVal !== undefined) continue; // contact already has a value
      if (chatVal === undefined || chatVal === null) continue; // chat has nothing to offer
      if (isAtDefault(field, chatVal)) continue; // chat is also at default, nothing to do
      crmDiff[field] = { chat: chatVal, contact: contactVal };
    }
    const willWriteCrmFields = Object.keys(crmDiff).length > 0;

    report.matched.push({
      chatId: chat.id,
      chatName: chat.name,
      chatPhone: chat.whatsappPhone || "",
      chatPhoneNorm: norm,
      contactId: contact.id,
      contactName: contact.name,
      contactWhatsappId: contact.whatsappId,
      contactPhoneNorm: norm,
      willWriteCustomFields,
      willWriteCrmFields,
      chatCustomFields: chatCf,
      contactCustomFields: contactCf,
      crmDiff,
    });
  }

  // Unmatched contacts: contacts whose normalized phone/whatsappId had no chat match
  for (const contact of allContacts) {
    if (matchedContactIds.has(contact.id)) continue;
    report.unmatchedContacts.push({
      contactId: contact.id,
      contactWhatsappId: contact.whatsappId,
      contactPhone: contact.phone,
    });
  }

  // ─── Print report ───────────────────────────────────────────────────────────
  const willWriteCf = report.matched.filter(m => m.willWriteCustomFields);
  const willWriteCrm = report.matched.filter(m => m.willWriteCrmFields);
  const willWriteNeither = report.matched.filter(m => !m.willWriteCustomFields && !m.willWriteCrmFields);

  console.log(`${"─".repeat(60)}`);
  console.log(`  SUMMARY`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  Total chats with WhatsApp phone:  ${report.totalChats}`);
  console.log(`  Total contacts:                   ${report.totalContacts}`);
  console.log(`  Matched pairs (1:1):              ${report.matched.length}`);
  console.log(`    → will write customFields:      ${willWriteCf.length}`);
  console.log(`    → will write CRM fields:        ${willWriteCrm.length}`);
  console.log(`    → no writes needed:             ${willWriteNeither.length}`);
  console.log(`  Unmatched chats:                  ${report.unmatchedChats.length}`);
  console.log(`  Unmatched contacts:               ${report.unmatchedContacts.length}`);
  console.log(`  Ambiguous chats (same phone):     ${report.ambiguousChats.length}`);
  console.log(`  Ambiguous contacts (same phone):  ${report.ambiguousContacts.length}`);
  console.log(`${"─".repeat(60)}\n`);

  if (report.ambiguousChats.length > 0) {
    console.log(`⚠️  AMBIGUOUS CHATS (skipped — multiple chats share the same phone):`);
    for (const a of report.ambiguousChats) {
      console.log(`   phone: ${a.chatPhone} (${a.chatPhoneNorm}) → chatIds: ${a.chatId}`);
    }
    console.log();
  }

  if (report.ambiguousContacts.length > 0) {
    console.log(`⚠️  AMBIGUOUS CONTACTS (skipped — multiple contacts share the same phone):`);
    for (const a of report.ambiguousContacts) {
      console.log(`   phone: ${a.contactPhoneNorm} → contactIds: ${a.contactId}`);
    }
    console.log();
  }

  if (report.unmatchedChats.length > 0) {
    console.log(`❌ UNMATCHED CHATS (no contact found for these phones):`);
    for (const u of report.unmatchedChats.slice(0, 20)) {
      console.log(`   chat ${u.chatId}: phone=${u.chatPhone} (norm=${u.chatPhoneNorm})`);
    }
    if (report.unmatchedChats.length > 20) {
      console.log(`   ... and ${report.unmatchedChats.length - 20} more`);
    }
    console.log();
  }

  if (willWriteCf.length > 0) {
    console.log(`📝 CONTACTS THAT WILL RECEIVE customFields backfill:`);
    for (const m of willWriteCf.slice(0, 10)) {
      const keys = Object.keys(m.chatCustomFields);
      console.log(`   contact ${m.contactId} (${m.contactName}): ${keys.length} fields [${keys.slice(0, 5).join(", ")}${keys.length > 5 ? "…" : ""}]`);
    }
    if (willWriteCf.length > 10) console.log(`   ... and ${willWriteCf.length - 10} more`);
    console.log();
  }

  if (willWriteCrm.length > 0) {
    console.log(`📝 CONTACTS THAT WILL RECEIVE CRM field backfill:`);
    for (const m of willWriteCrm.slice(0, 10)) {
      const fields = Object.entries(m.crmDiff)
        .map(([f, { chat, contact }]) => `${f}: "${contact}" → "${chat}"`)
        .join("; ");
      console.log(`   contact ${m.contactId} (${m.contactName}): ${fields}`);
    }
    if (willWriteCrm.length > 10) console.log(`   ... and ${willWriteCrm.length - 10} more`);
    console.log();
  }

  if (!EXECUTE) {
    console.log(`ℹ️  DRY-RUN complete — no changes were made.`);
    console.log(`   Re-run with --execute to apply the migration.\n`);
    return;
  }

  // ─── Execute writes ─────────────────────────────────────────────────────────
  console.log(`\n⚡ Applying migration writes...\n`);

  let cfWritten = 0;
  let crmWritten = 0;
  let errors = 0;

  for (const m of report.matched) {
    if (!m.willWriteCustomFields && !m.willWriteCrmFields) continue;

    try {
      const updates: Record<string, any> = {};

      if (m.willWriteCustomFields) {
        // Merge: contact's existing customFields take precedence over chat's
        updates.customFields = { ...m.chatCustomFields, ...m.contactCustomFields };
        cfWritten++;
      }

      if (m.willWriteCrmFields) {
        for (const [field, { chat: chatVal }] of Object.entries(m.crmDiff)) {
          updates[field] = chatVal;
        }
        crmWritten++;
      }

      await db.update(contacts)
        .set(updates as any)
        .where(eq(contacts.id, m.contactId));

      console.log(`   ✓ contact ${m.contactId} (${m.contactName}): ${Object.keys(updates).join(", ")}`);
    } catch (err: any) {
      errors++;
      console.error(`   ✗ contact ${m.contactId}: ${err.message}`);
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  Migration complete`);
  console.log(`  customFields written: ${cfWritten}`);
  console.log(`  CRM fields written:   ${crmWritten}`);
  console.log(`  Errors:               ${errors}`);
  console.log(`${"─".repeat(60)}\n`);
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
