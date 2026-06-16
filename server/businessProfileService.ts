import type { AiBusinessKnowledge } from "@shared/schema";
import type { BusinessProfileResponse } from "@shared/businessProfileSchema";
import type { PublicListingFlyerAgent } from "@shared/inventory/publicListingFlyer";
import {
  getCalendlyPrimaryEventTypeName,
  getCalendlyPublicSchedulingUrl,
  isUserCalendlyBookingConnected,
} from "./calendlyBookingConnected";
import { storage } from "./storage";
import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

function str(value: string | null | undefined): string {
  return (value || "").trim();
}

export async function loadBusinessProfileUserRow(userId: string) {
  const [row] = await db
    .select({
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      twilioWhatsappNumber: users.twilioWhatsappNumber,
      metaDisplayPhoneNumber: users.metaDisplayPhoneNumber,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row;
}

export async function getBusinessProfileForUser(userId: string): Promise<BusinessProfileResponse> {
  const userRow = await loadBusinessProfileUserRow(userId);
  const knowledge = await storage.getAiBusinessKnowledge(userId);
  const calendlyConnected = await isUserCalendlyBookingConnected(userId);
  const calendlySchedulingUrl = calendlyConnected ? await getCalendlyPublicSchedulingUrl(userId) : "";
  const calendlyEventTypeName = calendlyConnected ? await getCalendlyPrimaryEventTypeName(userId) : "";

  return {
    avatarUrl: str(userRow?.avatarUrl) || null,
    displayName: str(knowledge?.displayName) || str(userRow?.name),
    businessName: str(knowledge?.businessName),
    companyLogo: str(knowledge?.companyLogo) || null,
    publicPhone:
      str(knowledge?.publicPhone) ||
      str(userRow?.metaDisplayPhoneNumber) ||
      str(userRow?.twilioWhatsappNumber),
    publicEmail: str(knowledge?.publicEmail) || str(userRow?.email),
    publicWebsite: str(knowledge?.publicWebsite),
    aboutText: str(knowledge?.aboutText),
    calendlyConnected,
    calendlyEventTypeName,
    calendlySchedulingUrl,
    publishListingsPublicly: knowledge?.publishListingsPublicly === true,
  };
}

/** Public flyer agent card — Business Profile first, then user fields, never CRM contacts. */
export async function resolvePublicListingAgent(userId: string): Promise<
  PublicListingFlyerAgent & { companyLogoUrl: string | null }
> {
  const profile = await getBusinessProfileForUser(userId);
  return {
    name: profile.displayName || null,
    email: profile.publicEmail || null,
    phone: profile.publicPhone || null,
    avatarUrl: profile.avatarUrl,
    brokerageName: profile.businessName || null,
    bookingLink: profile.calendlySchedulingUrl || null,
    companyLogoUrl: profile.companyLogo,
  };
}

export function businessProfileKnowledgePatch(
  patch: Partial<{
    displayName: string | null;
    businessName: string | null;
    companyLogo: string | null;
    publicPhone: string | null;
    publicEmail: string | null;
    publicWebsite: string | null;
    aboutText: string | null;
    publishListingsPublicly: boolean;
  }>,
): Partial<AiBusinessKnowledge> {
  const out: Partial<AiBusinessKnowledge> = {};
  if (patch.displayName !== undefined) out.displayName = patch.displayName;
  if (patch.businessName !== undefined) out.businessName = patch.businessName;
  if (patch.companyLogo !== undefined) out.companyLogo = patch.companyLogo;
  if (patch.publicPhone !== undefined) out.publicPhone = patch.publicPhone;
  if (patch.publicEmail !== undefined) out.publicEmail = patch.publicEmail || null;
  if (patch.publicWebsite !== undefined) out.publicWebsite = patch.publicWebsite || null;
  if (patch.aboutText !== undefined) out.aboutText = patch.aboutText;
  if (patch.publishListingsPublicly !== undefined) {
    out.publishListingsPublicly = patch.publishListingsPublicly;
  }
  return out;
}
