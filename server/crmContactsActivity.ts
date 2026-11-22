import { and, desc, eq, getTableColumns, ne, sql } from "drizzle-orm";
import type { db } from "../drizzle/db";
import { contacts } from "@shared/schema";
import {
  CONTACT_LIFECYCLE_PROSPECT_ONLY,
  EMAIL_INBOX_IDENTITY_SOURCE,
  filterCrmListedContacts,
} from "@shared/contactCrmVisibility";

const PAGE_SIZE = 500;
// Preserve PostgreSQL's microseconds at the page boundary; Date truncates them.
const activityAt = sql`coalesce(${contacts.lastIncomingAt}, ${contacts.createdAt}, timestamp '0001-01-01')`;

type ActivityCursor = { at: string; id: string };

export function parseCrmActivityCursor(at: unknown, id: unknown): ActivityCursor | null {
  if (typeof at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/.test(at) ||
      typeof id !== "string" || !id.trim() || id.length > 255) return null;
  const date = new Date(`${at}Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 23) !== at.slice(0, 23)) return null;
  return { at, id };
}

export async function getCrmContactsActivityPage(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  cursor?: ActivityCursor,
) {
  const rows = await database.select({
    ...getTableColumns(contacts),
    activityCursorAt: sql<string>`to_char(${activityAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
  }).from(contacts)
    .where(and(
      eq(contacts.userId, workspaceId),
      ne(contacts.source, EMAIL_INBOX_IDENTITY_SOURCE),
      sql`coalesce(${contacts.sourceDetails}->>'contactLifecycle', '') <> ${CONTACT_LIFECYCLE_PROSPECT_ONLY}`,
      cursor ? sql`(${activityAt}, ${contacts.id}) < (cast(${cursor.at} as timestamp), ${cursor.id})` : undefined,
    ))
    .orderBy(desc(activityAt), desc(contacts.id))
    .limit(PAGE_SIZE + 1);

  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    // The cursor advances past every scanned row, including legacy non-CRM visitors.
    contacts: filterCrmListedContacts(page).map(({ activityCursorAt, ...contact }) => contact),
    nextCursor: rows.length > PAGE_SIZE && last ? { at: last.activityCursorAt, id: last.id } : null,
  };
}
