import type { AiBusinessKnowledge } from "@shared/schema";
import {
  businessProfileDisplayNameFromPatch,
  businessProfilePatchSchema,
  formatBusinessProfilePatchError,
  hydrateBusinessProfileDisplayName,
  persistBusinessProfileDisplayName,
  persistOptionalProfileText,
  pickBusinessProfilePatchField,
  type BusinessProfilePatch,
  type BusinessProfileResponse,
} from "@shared/businessProfileSchema";
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
import { isRgeInstalledForUser } from "./buyerPreferenceService";

function str(value: string | null | undefined): string {
  return (value || "").trim();
}

export async function loadBusinessProfileUserRow(userId: string) {
  const [row] = await db
    .select({
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
    displayName: hydrateBusinessProfileDisplayName({
      knowledgeDisplayName: knowledge?.displayName,
    }),
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
  if (patch.displayName !== undefined) {
    out.displayName = persistBusinessProfileDisplayName(patch.displayName);
  }
  if (patch.businessName !== undefined) {
    out.businessName = persistOptionalProfileText(patch.businessName);
  }
  if (patch.companyLogo !== undefined) out.companyLogo = patch.companyLogo;
  if (patch.publicPhone !== undefined) {
    out.publicPhone = persistOptionalProfileText(patch.publicPhone);
  }
  if (patch.publicEmail !== undefined) out.publicEmail = persistOptionalProfileText(patch.publicEmail);
  if (patch.publicWebsite !== undefined) {
    out.publicWebsite = persistOptionalProfileText(patch.publicWebsite);
  }
  if (patch.aboutText !== undefined) out.aboutText = persistOptionalProfileText(patch.aboutText);
  if (patch.publishListingsPublicly !== undefined) {
    out.publishListingsPublicly = patch.publishListingsPublicly;
  }
  return out;
}

export type BusinessProfileSaveDeps = {
  upsertKnowledge: (userId: string, updates: Partial<AiBusinessKnowledge>) => Promise<unknown>;
  loadProfile: (userId: string) => Promise<BusinessProfileResponse>;
  isRgeInstalled: (userId: string) => Promise<boolean>;
};

export type BusinessProfileSaveResult =
  | { ok: true; status: 200; profile: BusinessProfileResponse }
  | { ok: false; status: number; error: string; fieldErrors?: Record<string, string>; code?: string };

function defaultSaveDeps(): BusinessProfileSaveDeps {
  return {
    upsertKnowledge: (userId, updates) => storage.upsertAiBusinessKnowledge(userId, updates),
    loadProfile: getBusinessProfileForUser,
    isRgeInstalled: isRgeInstalledForUser,
  };
}

/**
 * Settings Business Profile save — tenant-scoped to `userId`.
 * Does not require AI Brain. First save inserts the knowledge row; later saves update it.
 */
export async function saveBusinessProfileForUser(
  userId: string,
  rawBody: unknown,
  deps: BusinessProfileSaveDeps = defaultSaveDeps(),
): Promise<BusinessProfileSaveResult> {
  const parsed = businessProfilePatchSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    const formatted = formatBusinessProfilePatchError(parsed.error);
    return { ok: false, status: 400, ...formatted };
  }

  const patch = parsed.data;
  if (patch.publishListingsPublicly !== undefined) {
    const rgeInstalled = await deps.isRgeInstalled(userId);
    if (!rgeInstalled) {
      return {
        ok: false,
        status: 403,
        error: "Publish listings publicly requires Realtor Growth Engine",
        code: "rge_required",
      };
    }
  }

  const knowledgeUpdates = businessProfileKnowledgePatch(knowledgePatchFromParsed(patch));
  if (Object.keys(knowledgeUpdates).length > 0) {
    await deps.upsertKnowledge(userId, knowledgeUpdates);
  }

  const profile = await deps.loadProfile(userId);
  return { ok: true, status: 200, profile };
}

function knowledgePatchFromParsed(patch: BusinessProfilePatch): Parameters<typeof businessProfileKnowledgePatch>[0] {
  return {
    displayName: businessProfileDisplayNameFromPatch(patch),
    businessName: pickBusinessProfilePatchField(patch, "businessName"),
    companyLogo: pickBusinessProfilePatchField(patch, "companyLogo"),
    publicPhone: pickBusinessProfilePatchField(patch, "publicPhone"),
    publicEmail: pickBusinessProfilePatchField(patch, "publicEmail"),
    publicWebsite: pickBusinessProfilePatchField(patch, "publicWebsite"),
    aboutText: pickBusinessProfilePatchField(patch, "aboutText"),
    publishListingsPublicly: pickBusinessProfilePatchField(patch, "publishListingsPublicly"),
  };
}
