import type { Contact } from "@shared/schema";

/** Minimal Contact fixture for prospect import unit tests. */
export function testContact(overrides: Partial<Contact> & { id: string }): Contact {
  return {
    id: overrides.id,
    userId: overrides.userId ?? "dest-user",
    name: overrides.name ?? "Test Contact",
    email: overrides.email ?? null,
    phone: overrides.phone ?? null,
    avatar: null,
    avatarFetchedAt: null,
    whatsappId: null,
    instagramId: null,
    facebookId: null,
    telegramId: null,
    ghlId: overrides.ghlId ?? null,
    primaryChannel: "whatsapp",
    primaryChannelOverride: null,
    lastIncomingChannel: null,
    lastIncomingAt: null,
    source: overrides.source ?? "manual",
    sourceDetails: overrides.sourceDetails ?? {},
    tag: overrides.tag ?? "New",
    pipelineStage: overrides.pipelineStage ?? "Lead",
    leadScore: null,
    buyerPreferenceProfile: {},
    sellerPreferenceProfile: {},
    notes: overrides.notes ?? "",
    followUp: null,
    followUpDate: null,
    assignedTo: null,
    customFields: overrides.customFields ?? {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function prospectImportMeta(jobId: string, opts?: { createdByImportJob?: boolean; ghlContactId?: string }) {
  const meta = {
    ghlContactId: opts?.ghlContactId ?? "ghl-1",
    importJobId: jobId,
    createdByImportJob: opts?.createdByImportJob ?? true,
    importedAt: new Date().toISOString(),
  };
  return {
    source: "import" as const,
    sourceDetails: {
      prospectImportProvider: "gohighlevel",
      prospectImport: meta,
    },
    customFields: { prospectImport: meta },
  };
}
