import { and, desc, eq } from "drizzle-orm";
import { contactInventorySavedMatches } from "@shared/schema";
import { db } from "../../drizzle/db";

export async function listSavedListingIdsForContact(
  userId: string,
  contactId: string,
): Promise<string[]> {
  const rows = await db
    .select({ listingId: contactInventorySavedMatches.listingId })
    .from(contactInventorySavedMatches)
    .where(
      and(
        eq(contactInventorySavedMatches.userId, userId),
        eq(contactInventorySavedMatches.contactId, contactId),
      ),
    )
    .orderBy(desc(contactInventorySavedMatches.updatedAt));
  return rows.map((r) => r.listingId);
}

export async function saveContactInventoryMatch(params: {
  userId: string;
  contactId: string;
  listingId: string;
  matchScore: number;
  matchReasons: string[];
}): Promise<void> {
  const now = new Date();
  await db
    .insert(contactInventorySavedMatches)
    .values({
      userId: params.userId,
      contactId: params.contactId,
      listingId: params.listingId,
      matchScore: params.matchScore,
      matchReasons: params.matchReasons,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        contactInventorySavedMatches.contactId,
        contactInventorySavedMatches.listingId,
      ],
      set: {
        matchScore: params.matchScore,
        matchReasons: params.matchReasons,
        updatedAt: now,
      },
    });
}

export async function unsaveContactInventoryMatch(
  userId: string,
  contactId: string,
  listingId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(contactInventorySavedMatches)
    .where(
      and(
        eq(contactInventorySavedMatches.userId, userId),
        eq(contactInventorySavedMatches.contactId, contactId),
        eq(contactInventorySavedMatches.listingId, listingId),
      ),
    )
    .returning({ id: contactInventorySavedMatches.id });
  return deleted.length > 0;
}
