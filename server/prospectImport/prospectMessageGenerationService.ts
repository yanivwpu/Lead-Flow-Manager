/**
 * Prospect AI Message Generation — strategy dispatch for queue snapshots, regenerate, preview.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { contacts, prospectIntelligence } from "@shared/schema";
import { aiProvider } from "../aiProvider";
import {
  buildAiPlaceholderFillSystemPrompt,
  buildAiPlaceholderFillUserPrompt,
  extractAiPlaceholderKeys,
} from "@shared/prospectAiPlaceholders";
import {
  messageCreationAllowsAiPlaceholders,
  messageCreationAllowsAiRewrite,
  messageCreationUsesTemplate,
  parseMessageCreationSettings,
  toOutreachInstructions,
  type ProspectMessageCreationSettings,
} from "@shared/prospectMessageCreation";
import {
  generateFromAiComposeSeed,
  generateFromTemplateStrategy,
  type ProspectGeneratedMessage,
} from "@shared/prospectMessageGeneration";
import type { ProspectMessageVariableSource } from "@shared/prospectMessageVariables";
import { resolveProspectOutreachSubject } from "@shared/prospectOutreachInstructions";
import { formatOutreachSenderContextForPrompt } from "@shared/prospectOutreachWritingStandard";
import { loadProspectAiWorkspaceContext } from "./prospectAiWorkspaceContext";
import { resolveProspectWebsiteUrl } from "./prospectWebsiteUrl";
import { storage } from "../storage";
import type { Contact } from "@shared/schema";

export type ProspectMessageChannel = "email" | "sms" | "whatsapp" | "facebook" | "instagram";

function readProspectCity(contact: Contact): string {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const pai = (sd.prospectAi || cf.prospectAi || {}) as Record<string, unknown>;
  return (
    String(cf.city || "").trim() ||
    String(sd.city || "").trim() ||
    String(pai.city || "").trim() ||
    String(pai.location || "").trim() ||
    ""
  );
}

function variableSourceFromRows(params: {
  contact: Contact;
  pi?: {
    companyName?: string | null;
    businessType?: string | null;
    industry?: string | null;
    websiteUrlUsed?: string | null;
  } | null;
}): ProspectMessageVariableSource {
  return {
    name: params.contact.name,
    email: params.contact.email,
    phone: params.contact.phone,
    website: resolveProspectWebsiteUrl(params.contact) || params.pi?.websiteUrlUsed || "",
    city: readProspectCity(params.contact),
    companyName: params.pi?.companyName,
    businessType: params.pi?.businessType,
    industry: params.pi?.industry,
    category: params.pi?.businessType || params.pi?.industry,
  };
}

async function fillAiPlaceholders(params: {
  workspaceUserId: string;
  settings: ProspectMessageCreationSettings;
  source: ProspectMessageVariableSource;
  pi?: {
    companyName?: string | null;
    businessType?: string | null;
    industry?: string | null;
    suggestedOutreachAngle?: string | null;
    reasoningSummary?: string | null;
  } | null;
}): Promise<Record<string, string>> {
  const keys = extractAiPlaceholderKeys(
    params.settings.templateSubject,
    params.settings.templateBody,
  );
  if (keys.length === 0) return {};

  const workspace = await loadProspectAiWorkspaceContext(params.workspaceUserId, {
    analysisPath: "outreach_ai_placeholders",
  });
  const workspaceBlock = formatOutreachSenderContextForPrompt({
    displayName: workspace.displayName,
    businessName: workspace.businessName,
    email: workspace.email,
    website: workspace.website,
    phone: workspace.phone,
    executiveSummary: workspace.executiveSummary,
    servicesProducts: workspace.servicesProducts,
    configured: workspace.configured,
  });
  const instructions = toOutreachInstructions(params.settings);

  const raw = await aiProvider.complete(
    "extraction",
    [
      { role: "system", content: buildAiPlaceholderFillSystemPrompt() },
      {
        role: "user",
        content: buildAiPlaceholderFillUserPrompt({
          keys,
          prospectName: params.source.name,
          companyName: params.source.companyName || params.pi?.companyName,
          industry: params.pi?.industry,
          businessType: params.pi?.businessType,
          city: params.source.city,
          outreachAngle: params.pi?.suggestedOutreachAngle,
          reasoningSummary: params.pi?.reasoningSummary,
          campaignEmphasis: instructions.customInstructions,
          languageHint: instructions.language,
          linkUrl:
            instructions.linkUrl && instructions.includeLinkNaturally
              ? instructions.linkUrl
              : null,
          workspaceBlock,
        }),
      },
    ],
    { jsonMode: true, maxTokens: 500 },
  );
  const content = typeof raw === "string" ? raw : raw.content;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]!);
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed || typeof parsed !== "object") return {};
  // sanitize happens inside generateFromTemplateStrategy
  return parsed as Record<string, string>;
}

/**
 * Generate a final subject/body for one prospect according to Message Creation mode.
 */
export async function generateProspectOutreachDraft(params: {
  workspaceUserId: string;
  settings: ProspectMessageCreationSettings;
  contactId: string;
  channel?: ProspectMessageChannel | string | null;
  /** When AI Compose and provided, use these seeds instead of loading PI. */
  aiComposeSeed?: { subject?: string | null; body?: string | null } | null;
}): Promise<ProspectGeneratedMessage | null> {
  const settings = parseMessageCreationSettings(params.settings);
  const contact = await storage.getContact(params.contactId);
  if (!contact) return null;

  const piRows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, params.contactId))
    .limit(1);
  const pi = piRows[0] ?? null;
  const source = variableSourceFromRows({ contact, pi });

  if (messageCreationUsesTemplate(settings.mode)) {
    let aiFill: unknown = undefined;
    if (messageCreationAllowsAiPlaceholders(settings.mode)) {
      try {
        aiFill = await fillAiPlaceholders({
          workspaceUserId: params.workspaceUserId,
          settings,
          source,
          pi,
        });
      } catch (err) {
        console.error(
          "[ProspectMessageGeneration] AI placeholder fill failed:",
          err instanceof Error ? err.message : err,
        );
        aiFill = {};
      }
    }
    return generateFromTemplateStrategy({
      mode: settings.mode,
      settings,
      source,
      aiFill,
    });
  }

  // AI Compose
  const body =
    String(params.aiComposeSeed?.body ?? pi?.suggestedFirstMessage ?? "").trim();
  if (!body) return null;
  const subject = resolveProspectOutreachSubject({
    savedSubject: params.aiComposeSeed?.subject ?? pi?.suggestedOutreachSubject,
    prospectName: contact.name,
    recommendedOffer: pi?.recommendedOffer,
    outreachAngle: pi?.suggestedOutreachAngle,
  });
  return generateFromAiComposeSeed({ seed: { subject, body } });
}

/** Preview helper — never enqueues. */
export async function previewProspectOutreachMessage(params: {
  workspaceUserId: string;
  contactId: string;
  settings?: ProspectMessageCreationSettings | null;
}): Promise<{
  contactId: string;
  prospectName: string | null;
  mode: string;
  subject: string;
  body: string;
  unresolvedTokens: string[];
  channelHints: { primary: string };
}> {
  const { getOutreachSettings } = await import("./prospectOutreachQueueService");
  const settings =
    params.settings ||
    parseMessageCreationSettings((await getOutreachSettings(params.workspaceUserId)).outreachInstructions);

  const generated = await generateProspectOutreachDraft({
    workspaceUserId: params.workspaceUserId,
    settings,
    contactId: params.contactId,
    channel: "email",
  });

  const contact = await storage.getContact(params.contactId);
  if (!generated) {
    return {
      contactId: params.contactId,
      prospectName: contact?.name ?? null,
      mode: settings.mode,
      subject: "",
      body: "",
      unresolvedTokens: [],
      channelHints: { primary: "email" },
    };
  }

  return {
    contactId: params.contactId,
    prospectName: contact?.name ?? null,
    mode: generated.mode,
    subject: generated.subject,
    body: generated.body,
    unresolvedTokens: generated.unresolvedTokens,
    channelHints: { primary: "email" },
  };
}

/**
 * Refresh editable queue drafts according to Message Creation mode.
 * - ai_compose → full AI rewrite (existing service)
 * - use_my_template → variable merge only (no AI)
 * - ai_assisted_template → merge + AI placeholder fill only
 */
export async function refreshQueuedDraftsForMessageCreation(params: {
  workspaceUserId: string;
  settings: ProspectMessageCreationSettings;
  batchId?: string | null;
  itemIds?: string[] | null;
}): Promise<{ rewritten: number; skipped: number; failed: number }> {
  const settings = parseMessageCreationSettings(params.settings);

  if (messageCreationAllowsAiRewrite(settings.mode)) {
    const { rewriteQueuedOutreachDrafts } = await import("./prospectOutreachDraftRewriteService");
    return rewriteQueuedOutreachDrafts({
      workspaceUserId: params.workspaceUserId,
      instructions: toOutreachInstructions(settings),
      batchId: params.batchId,
      itemIds: params.itemIds,
    });
  }

  // Template modes — re-render from template per contact (no prose rewrite).
  const { prospectOutreachQueueItems } = await import("@shared/schema");
  const { inArray } = await import("drizzle-orm");

  const editableStatuses =
    params.itemIds && params.itemIds.length > 0
      ? (["queued", "paused", "failed"] as const)
      : (["queued", "paused"] as const);
  const conditions = [
    eq(prospectOutreachQueueItems.workspaceUserId, params.workspaceUserId),
    inArray(prospectOutreachQueueItems.queueStatus, [...editableStatuses]),
  ];
  if (params.batchId) {
    conditions.push(eq(prospectOutreachQueueItems.batchId, params.batchId));
  }
  if (params.itemIds && params.itemIds.length > 0) {
    conditions.push(inArray(prospectOutreachQueueItems.id, Array.from(new Set(params.itemIds))));
  }

  const rows = await db
    .select({
      id: prospectOutreachQueueItems.id,
      contactId: prospectOutreachQueueItems.contactId,
    })
    .from(prospectOutreachQueueItems)
    .where(and(...conditions));

  let rewritten = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const generated = await generateProspectOutreachDraft({
        workspaceUserId: params.workspaceUserId,
        settings,
        contactId: row.contactId,
        channel: "email",
      });
      if (!generated?.body) {
        skipped += 1;
        continue;
      }
      await db
        .update(prospectOutreachQueueItems)
        .set({
          subjectSnapshot: generated.subject,
          messageSnapshot: generated.body,
          updatedAt: new Date(),
        })
        .where(eq(prospectOutreachQueueItems.id, row.id));

      await db
        .update(prospectIntelligence)
        .set({
          suggestedOutreachSubject: generated.subject,
          suggestedFirstMessage: generated.body,
          updatedAt: new Date(),
        })
        .where(eq(prospectIntelligence.contactId, row.contactId));

      rewritten += 1;
    } catch {
      failed += 1;
    }
  }

  return { rewritten, skipped, failed };
}
