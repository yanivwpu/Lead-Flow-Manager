import type { CampaignEnrollment, Contact, Conversation, PresetCampaign } from "@shared/schema";
import type { Channel } from "@shared/schema";
import { CHANNEL_INFO } from "@shared/schema";
import { parsePresetDelayToMs } from "@shared/campaignDelays";
import { storage } from "./storage";
import { channelService } from "./channelService";
import { subscriptionService } from "./subscriptionService";
import { getWhatsAppAvailability } from "./whatsappService";
import { sendMetaWhatsAppTemplate } from "./userMeta";

const WHATSAPP_CSW_BUFFER_MS = 60 * 60 * 1000;

export type CampaignMessageStep = {
  delay?: string;
  content?: string;
  type?: string;
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string;
  whatsappTemplateComponents?: unknown[];
};

function safeErr(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  const trimmed = m.replace(/\bBearer\s+\S+/gi, "Bearer [redacted]").slice(0, 480);
  return trimmed || "Unknown error";
}

function whatsAppFreeFormAllowed(conversation: Conversation | undefined): boolean {
  if (!conversation || conversation.channel !== "whatsapp") return false;
  const raw = conversation.windowExpiresAt;
  if (!raw) return false;
  const expiresAtMs = new Date(raw).getTime();
  const deadlineMs = expiresAtMs - WHATSAPP_CSW_BUFFER_MS;
  return Date.now() < deadlineMs;
}

export function interpolateCampaignBody(
  template: string,
  defaults: Record<string, unknown> | null | undefined,
  contact: Contact
): string {
  let out = template;
  const cf =
    contact.customFields && typeof contact.customFields === "object" && !Array.isArray(contact.customFields)
      ? (contact.customFields as Record<string, unknown>)
      : {};
  const map: Record<string, string> = {
    name: contact.name || "",
    phone: contact.phone || "",
    email: contact.email || "",
  };
  if (defaults && typeof defaults === "object") {
    for (const [k, v] of Object.entries(defaults)) {
      if (v != null) map[k] = String(v);
    }
  }
  for (const [k, v] of Object.entries(cf)) {
    if (typeof v === "string" || typeof v === "number") map[k] = String(v);
  }
  out = out.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const k = String(key).trim();
    return map[k] ?? "";
  });
  return out;
}

export function contactBlocksCampaignSends(contact: Contact): { blocked: boolean; reason?: string } {
  const tag = (contact.tag || "").toLowerCase();
  if (/\b(stop|unsubscribe|opt\s*out|do not contact|dnc)\b/i.test(contact.tag || "")) {
    return { blocked: true, reason: "Contact tag indicates opt-out" };
  }
  if (tag.includes("stop") && tag.length <= 40) {
    return { blocked: true, reason: "Contact tag indicates opt-out" };
  }
  const cf =
    contact.customFields && typeof contact.customFields === "object" && !Array.isArray(contact.customFields)
      ? (contact.customFields as Record<string, unknown>)
      : {};
  if (cf.campaignOptOut === true || cf.marketingOptIn === false) {
    return { blocked: true, reason: "Contact opted out of marketing" };
  }
  return { blocked: false };
}

async function ensureConversationForCampaign(
  userId: string,
  contactId: string,
  channel: Channel
): Promise<Conversation> {
  let conv = await storage.getConversationByContactAndChannel(contactId, channel);
  if (!conv) {
    conv = await storage.createConversation({
      userId,
      contactId,
      channel,
      status: "open",
    });
    await subscriptionService.incrementConversationUsage(userId);
  }
  return conv;
}

async function sendCampaignWhatsApp(params: {
  userId: string;
  contactId: string;
  contact: Contact;
  campaign: PresetCampaign;
  body: string;
  step: CampaignMessageStep;
}): Promise<{ ok: true; externalMessageId?: string } | { ok: false; error: string }> {
  const { userId, contactId, contact, campaign, body, step } = params;
  const channel = (campaign.channel || "whatsapp") as Channel;
  const conv = await ensureConversationForCampaign(userId, contactId, "whatsapp");
  const allowFreeform = whatsAppFreeFormAllowed(conv);

  if (allowFreeform) {
    const result = await channelService.sendMessage({
      userId,
      contactId,
      content: body,
      contentType: "text",
      forceChannel: "whatsapp",
      suppressFallback: true,
      enforceWhatsAppCustomerServiceWindow: false,
    });
    if (result.success) {
      return { ok: true, externalMessageId: result.externalMessageId };
    }
    return { ok: false, error: result.error || "WhatsApp send failed" };
  }

  const tplName =
    typeof step.whatsappTemplateName === "string" && step.whatsappTemplateName.trim()
      ? step.whatsappTemplateName.trim()
      : "";

  if (!tplName) {
    return {
      ok: false,
      error:
        "Outside the free-form WhatsApp window. Add whatsappTemplateName to this step (approved Meta template) or wait until the customer messages you.",
    };
  }

  const wa = await getWhatsAppAvailability(userId);
  if (wa.provider !== "meta") {
    return {
      ok: false,
      error:
        "Outside the free-form WhatsApp window. Template sends require Meta WhatsApp (Cloud API); Twilio cannot send this template path yet.",
    };
  }

  const phone = contact.phone?.startsWith("+") ? contact.phone : contact.phone ? `+${contact.phone}` : "";
  if (!phone) {
    return { ok: false, error: "Contact has no phone number for WhatsApp" };
  }

  const lang =
    typeof step.whatsappTemplateLanguage === "string" && step.whatsappTemplateLanguage.trim()
      ? step.whatsappTemplateLanguage.trim()
      : (campaign.language || "en").replace("_", "-").split("-")[0] || "en";

  const components = Array.isArray(step.whatsappTemplateComponents)
    ? (step.whatsappTemplateComponents as any[])
    : undefined;

  const messageRow = await storage.createMessage({
    conversationId: conv.id,
    contactId,
    userId,
    direction: "outbound",
    content: body,
    contentType: "template",
    templateId: tplName,
    status: "pending",
  });

  try {
    const sendResult = await sendMetaWhatsAppTemplate(userId, phone, tplName, lang, components);
    await storage.updateMessage(messageRow.id, {
      status: "sent",
      externalMessageId: sendResult.messageId,
      sentAt: new Date(),
    });
    await storage.updateConversation(conv.id, {
      lastMessageAt: new Date(),
      lastMessagePreview: body.slice(0, 100),
      lastMessageDirection: "outbound",
    });
    return { ok: true, externalMessageId: sendResult.messageId };
  } catch (err: unknown) {
    const msg = safeErr(err);
    await storage.updateMessage(messageRow.id, {
      status: "failed",
      errorMessage: msg,
    });
    return { ok: false, error: msg };
  }
}

async function sendCampaignChannelMessage(params: {
  userId: string;
  contactId: string;
  campaign: PresetCampaign;
  body: string;
}): Promise<{ ok: true; externalMessageId?: string } | { ok: false; error: string }> {
  const { userId, contactId, campaign, body } = params;
  const ch = (campaign.channel || "whatsapp") as Channel;
  if (ch === "whatsapp") {
    const contact = await storage.getContact(contactId);
    if (!contact) return { ok: false, error: "Contact not found" };
    const step: CampaignMessageStep = { content: body };
    return sendCampaignWhatsApp({
      userId,
      contactId,
      contact,
      campaign,
      body,
      step,
    });
  }

  const result = await channelService.sendMessage({
    userId,
    contactId,
    content: body,
    contentType: "text",
    forceChannel: ch,
    suppressFallback: true,
    enforceWhatsAppCustomerServiceWindow: false,
  });

  if (result.success) {
    return { ok: true, externalMessageId: result.externalMessageId };
  }
  const label = CHANNEL_INFO[ch]?.label || ch;
  return {
    ok: false,
    error: result.error || `Could not send on ${label}`,
  };
}

export async function processCampaignEnrollmentStep(enrollmentId: string): Promise<void> {
  const enrollment = await storage.getCampaignEnrollmentById(enrollmentId);
  if (!enrollment || enrollment.status !== "active") return;

  const campaign = await storage.getPresetCampaignForUser(enrollment.campaignId, enrollment.userId);
  if (!campaign) {
    await storage.updateCampaignEnrollment(enrollment.id, {
      status: "cancelled",
      nextRunAt: null,
    });
    return;
  }

  if (campaign.status === "paused" || campaign.status === "completed") {
    return;
  }

  const contact = await storage.getContact(enrollment.contactId);
  if (!contact || contact.userId !== enrollment.userId) {
    await storage.updateCampaignEnrollment(enrollment.id, { status: "failed", nextRunAt: null });
    return;
  }

  const gate = contactBlocksCampaignSends(contact);
  if (gate.blocked) {
    await storage.createCampaignStepEvent({
      enrollmentId: enrollment.id,
      campaignId: campaign.id,
      contactId: contact.id,
      stepIndex: enrollment.currentStepIndex,
      status: "skipped",
      scheduledFor: new Date(),
      errorMessage: gate.reason,
    });
    await storage.updateCampaignEnrollment(enrollment.id, {
      status: "cancelled",
      nextRunAt: null,
      lastRunAt: new Date(),
    });
    return;
  }

  const messages = Array.isArray(campaign.messages) ? (campaign.messages as CampaignMessageStep[]) : [];
  if (messages.length === 0) {
    await storage.updateCampaignEnrollment(enrollment.id, { status: "completed", nextRunAt: null });
    return;
  }

  const idx = enrollment.currentStepIndex;
  if (idx >= messages.length) {
    await storage.updateCampaignEnrollment(enrollment.id, {
      status: "completed",
      nextRunAt: null,
      lastRunAt: new Date(),
    });
    return;
  }

  const step = messages[idx] || {};
  const rawContent = typeof step.content === "string" ? step.content : "";
  const body = interpolateCampaignBody(
    rawContent,
    campaign.placeholderDefaults as Record<string, unknown> | null,
    contact
  );

  const scheduledFor = enrollment.nextRunAt ?? new Date();
  const pendingEvent = await storage.createCampaignStepEvent({
    enrollmentId: enrollment.id,
    campaignId: campaign.id,
    contactId: contact.id,
    stepIndex: idx,
    status: "pending",
    scheduledFor,
  });

  let sendResult: { ok: true; externalMessageId?: string } | { ok: false; error: string };

  if ((campaign.channel || "whatsapp") === "whatsapp") {
    sendResult = await sendCampaignWhatsApp({
      userId: enrollment.userId,
      contactId: contact.id,
      contact,
      campaign,
      body,
      step,
    });
  } else {
    sendResult = await sendCampaignChannelMessage({
      userId: enrollment.userId,
      contactId: contact.id,
      campaign,
      body,
    });
  }

  if (!sendResult.ok) {
    await storage.updateCampaignStepEvent(pendingEvent.id, {
      status: "failed",
      errorMessage: sendResult.error,
      sentAt: null,
    });
    await storage.updateCampaignEnrollment(enrollment.id, {
      status: "failed",
      nextRunAt: null,
      lastRunAt: new Date(),
    });
    return;
  }

  await storage.updateCampaignStepEvent(pendingEvent.id, {
    status: "sent",
    sentAt: new Date(),
    providerMessageId: sendResult.externalMessageId ?? null,
    errorMessage: null,
  });

  const nextIdx = idx + 1;
  const delayAfterThisStepMs =
    nextIdx < messages.length
      ? parsePresetDelayToMs(messages[nextIdx]?.delay)
      : 0;

  if (nextIdx >= messages.length) {
    await storage.updateCampaignEnrollment(enrollment.id, {
      currentStepIndex: nextIdx,
      status: "completed",
      nextRunAt: null,
      lastRunAt: new Date(),
    });
    return;
  }

  const nextRun = new Date(Date.now() + delayAfterThisStepMs);
  await storage.updateCampaignEnrollment(enrollment.id, {
    currentStepIndex: nextIdx,
    status: "active",
    nextRunAt: nextRun,
    lastRunAt: new Date(),
  });
}

export async function runCampaignSchedulerTick(limit = 30): Promise<{ ran: number }> {
  const ids = await storage.listDueCampaignEnrollmentIds(limit);
  let ran = 0;
  for (const id of ids) {
    try {
      await processCampaignEnrollmentStep(id);
      ran++;
    } catch (e) {
      console.error(`[CampaignScheduler] step failed enrollment=${id}`, safeErr(e));
    }
  }
  return { ran };
}
