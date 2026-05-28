import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  contactInventoryOpportunities,
  type ContactInventoryOpportunity,
} from "@shared/schema";
import type { InventoryOpportunityStatus, InventoryOpportunityType } from "@shared/inventory/inventoryOpportunityTypes";
import { db } from "../../drizzle/db";

export async function upsertContactInventoryOpportunity(params: {
  userId: string;
  contactId: string;
  listingId: string;
  opportunityType: InventoryOpportunityType;
  score: number;
  reasons: string[];
  previousPriceCents: number | null;
  currentPriceCents: number | null;
}): Promise<ContactInventoryOpportunity> {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(contactInventoryOpportunities)
    .where(
      and(
        eq(contactInventoryOpportunities.contactId, params.contactId),
        eq(contactInventoryOpportunities.listingId, params.listingId),
        eq(contactInventoryOpportunities.opportunityType, params.opportunityType),
      ),
    )
    .limit(1);

  const status: InventoryOpportunityStatus =
    existing?.status === "saved" ? "saved" : "new";

  const [row] = await db
    .insert(contactInventoryOpportunities)
    .values({
      userId: params.userId,
      contactId: params.contactId,
      listingId: params.listingId,
      opportunityType: params.opportunityType,
      score: params.score,
      reasons: params.reasons,
      previousPriceCents: params.previousPriceCents,
      currentPriceCents: params.currentPriceCents,
      discoveredAt: now,
      status,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        contactInventoryOpportunities.contactId,
        contactInventoryOpportunities.listingId,
        contactInventoryOpportunities.opportunityType,
      ],
      set: {
        score: params.score,
        reasons: params.reasons,
        previousPriceCents: params.previousPriceCents,
        currentPriceCents: params.currentPriceCents,
        discoveredAt: now,
        status,
        updatedAt: now,
      },
    })
    .returning();

  return row;
}

export async function listContactInventoryOpportunities(
  userId: string,
  contactId: string,
  options?: { includeDismissed?: boolean; limit?: number },
): Promise<ContactInventoryOpportunity[]> {
  const limit = options?.limit ?? 20;
  const conditions = [
    eq(contactInventoryOpportunities.userId, userId),
    eq(contactInventoryOpportunities.contactId, contactId),
  ];
  if (!options?.includeDismissed) {
    conditions.push(ne(contactInventoryOpportunities.status, "dismissed"));
  }

  return db
    .select()
    .from(contactInventoryOpportunities)
    .where(and(...conditions))
    .orderBy(desc(contactInventoryOpportunities.score), desc(contactInventoryOpportunities.discoveredAt))
    .limit(limit);
}

export async function getContactInventoryOpportunity(
  userId: string,
  contactId: string,
  opportunityId: string,
): Promise<ContactInventoryOpportunity | undefined> {
  const [row] = await db
    .select()
    .from(contactInventoryOpportunities)
    .where(
      and(
        eq(contactInventoryOpportunities.id, opportunityId),
        eq(contactInventoryOpportunities.userId, userId),
        eq(contactInventoryOpportunities.contactId, contactId),
      ),
    )
    .limit(1);
  return row;
}

export async function patchContactInventoryOpportunityStatus(
  userId: string,
  contactId: string,
  opportunityId: string,
  status: InventoryOpportunityStatus,
): Promise<ContactInventoryOpportunity | undefined> {
  const [row] = await db
    .update(contactInventoryOpportunities)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(contactInventoryOpportunities.id, opportunityId),
        eq(contactInventoryOpportunities.userId, userId),
        eq(contactInventoryOpportunities.contactId, contactId),
      ),
    )
    .returning();
  return row;
}

export async function markOpportunitySavedForListing(
  userId: string,
  contactId: string,
  listingId: string,
): Promise<void> {
  await db
    .update(contactInventoryOpportunities)
    .set({ status: "saved", updatedAt: new Date() })
    .where(
      and(
        eq(contactInventoryOpportunities.userId, userId),
        eq(contactInventoryOpportunities.contactId, contactId),
        eq(contactInventoryOpportunities.listingId, listingId),
        inArray(contactInventoryOpportunities.status, ["new", "viewed"]),
      ),
    );
}
