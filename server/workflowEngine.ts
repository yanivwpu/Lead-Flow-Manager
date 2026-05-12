import { storage } from "./storage";
import { type Chat, type Workflow, type Contact, type Channel } from "@shared/schema";
import { subscriptionService } from "./subscriptionService";
import {
  evaluateGrowthEngineAccess,
  isGrowthEngineWorkflow,
  isAiBrainWorkflowActionType,
  isRuntimeSafeWorkflowActionType,
} from "./growthEngineEntitlements";
import {
  getCalendlyPublicSchedulingUrl,
  isUserCalendlyBookingConnected,
} from "./calendlyBookingConnected";
import { channelService } from "./channelService";
import { sendUserWhatsAppMessage, isLegacyCalendlyWorkflowChat } from "./userTwilio";
import { scheduleHubSpotAutoSync } from "./hubspotAutoSync";
import { sendMetaWhatsAppMessage } from "./userMeta";

export interface WorkflowAction {
  type:
    | "assign"
    | "tag"
    | "set_status"
    | "set_pipeline"
    | "add_note"
    | "set_followup"
    | "message_template"
    | "task_created"
    | "language_detected"
    | "lead_fields_updated";
  value: string;
}

export interface WorkflowCondition {
  keywords?: string[];
  tags?: string[];
  /** Target pipeline stage for `pipeline_change` workflows (UI: triggerToStage) */
  stage?: string;
  assignmentRoundRobin?: boolean;
  noReplyMinutes?: number;
  durationHours?: number;
  durationMinutes?: number;
  conditions?: { type: string; value: string }[];
}

/**
 * Growth Engine workflows: single subscription gate (Pro + AI Brain + automations).
 * Returns `null` when execution may proceed, or a human-readable block reason.
 * Logs + persists a workflow execution row so skips are never silent.
 */
async function blockGrowthEngineWorkflowIfNotEntitled(
  workflow: Workflow,
  chat: Chat | null,
  conversationId: string | undefined,
  triggerData: Record<string, unknown>
): Promise<string | null> {
  if (!isGrowthEngineWorkflow(workflow)) {
    return null;
  }
  const access = await evaluateGrowthEngineAccess(workflow.userId);
  if (access.ok) {
    return null;
  }
  console.log(
    JSON.stringify({
      tag: "[GrowthEngineAccess]",
      event: "workflow_runtime_blocked",
      workflowId: workflow.id,
      workflowName: workflow.name,
      userId: workflow.userId,
      reason: access.reason,
      message: access.message,
      hasProTier: access.hasProTier,
      hasAIBrainAddon: access.hasAIBrainAddon,
      workflowsEnabled: access.workflowsEnabled,
    })
  );
  await storage
    .logWorkflowExecution({
      workflowId: workflow.id,
      chatId: chat?.id ?? null,
      conversationId: conversationId ?? null,
      triggerData: {
        ...triggerData,
        growthEngineAccessDenied: true,
        denialReason: access.reason,
      },
      actionsExecuted: [],
      status: "failed",
      errorMessage: `[Growth Engine] ${access.message}`,
    })
    .catch(() => {});
  return access.message;
}

export async function getTemplatePreferences(userId: string): Promise<Record<string, any>> {
  try {
    const prefs = await storage.getUserTemplateDataByKey(
      userId, "realtor-growth-engine", "preferences", "realtor_growth_engine_preferences"
    );
    return (prefs?.definition as Record<string, any>) || {};
  } catch {
    return {};
  }
}

// ─── Dual-write helpers ───────────────────────────────────────────────────────
// During the transition period both the legacy chat row and the unified-inbox
// contact/conversation rows are updated.  Once the manual-send UI and billing
// are migrated off the chats table the chat writes below will be removed.

async function dualWriteContact(
  contact: Contact | undefined,
  contactUpdates: Partial<Contact>,
  chat: Chat | null,
  chatUpdates: Parameters<typeof storage.updateChat>[1],
  opts?: { skipAutomationHooks?: boolean }
) {
  if (contact) {
    await storage
      .updateContact(contact.id, contactUpdates, { skipAutomationHooks: opts?.skipAutomationHooks === true })
      .catch(() => {});
    const keys = Object.keys(contactUpdates);
    if (keys.some((k) => ["tag", "pipelineStage", "name", "email", "phone"].includes(k))) {
      scheduleHubSpotAutoSync(contact.userId, contact.id);
    }
  }
  if (chat) {
    await storage.updateChat(chat.id, chatUpdates).catch(() => {});
  }
}

async function dualWriteConversation(
  conversationId: string | undefined,
  status: string,
  chat: Chat | null
) {
  if (conversationId) {
    await storage.updateConversation(conversationId, { status } as any).catch(() => {});
  }
  // Legacy chat also carries status for the chat-list UI
  if (chat) {
    await storage.updateChat(chat.id, { status } as any).catch(() => {});
  }
}

function stripUnresolvedTemplateVars(body: string): string {
  return body
    .replace(/\{\{\s*[^}]+\s*\}\}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function detectLanguageCodeFromText(text: string): "en" | "es" | "he" {
  const t = (text || "").trim();
  if (!t) return "en";
  let he = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c >= 0x0590 && c <= 0x05ff) he++;
  }
  if (he >= 3 || he / Math.max(t.length, 1) > 0.07) return "he";
  if (
    /\b(hola|gracias|por\s+favor|casa|d[ií]as|cu[aá]ndo|d[oó]nde|usted|quiero|necesito)\b/i.test(t) ||
    /[áéíóúñ¿¡]/i.test(t)
  ) {
    return "es";
  }
  return "en";
}

function extractInboundSnippetForLanguage(triggerData: Record<string, unknown>, chat: Chat | null): string {
  const fromTrigger =
    (typeof triggerData?.inboundText === "string" && (triggerData.inboundText as string)) ||
    (typeof triggerData?.message === "string" && (triggerData.message as string)) ||
    "";
  if (fromTrigger.trim()) return fromTrigger;
  const msgs = (chat as any)?.messages as
    | { text?: string; content?: string; sender?: string; direction?: string; sent?: boolean }[]
    | undefined;
  if (msgs?.length) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      const body = String(m?.text ?? m?.content ?? "").trim();
      const isInbound =
        m?.direction === "inbound" ||
        m?.sender === "them" ||
        (m?.sent === false && m?.sender !== "me");
      if (isInbound && body) return body;
    }
    const last = msgs[msgs.length - 1];
    return String(last?.text ?? last?.content ?? "");
  }
  return "";
}

function interpolateRgeMessageTemplate(body: string, contact: Contact): string {
  const cf = (contact.customFields as Record<string, unknown>) || {};
  const rawName = (contact.name || "").trim() || "there";
  const firstName = rawName.split(/\s+/)[0] || "there";
  const city = String(cf.city ?? cf.City ?? "your area");
  return body
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstName)
    .replace(/\{\{\s*city\s*\}\}/gi, city);
}

async function executeSendMessageTemplateAction(params: {
  workflow: Workflow;
  contact: Contact | undefined;
  conversationId: string | undefined;
  templateKey: string;
}): Promise<boolean> {
  const { workflow, contact, conversationId, templateKey } = params;
  if (!contact?.id) {
    console.warn(
      JSON.stringify({
        tag: "[WorkflowAction]",
        event: "send_message_template_skipped",
        reason: "no_contact",
        workflowId: workflow.id,
        templateKey,
      })
    );
    return false;
  }
  if (!conversationId) {
    console.warn(
      JSON.stringify({
        tag: "[WorkflowAction]",
        event: "send_message_template_skipped",
        reason: "no_conversation_id",
        workflowId: workflow.id,
        contactId: contact.id,
        templateKey,
      })
    );
    return false;
  }
  const tc = workflow.triggerConditions as { templateId?: string };
  const templateId = tc?.templateId || "realtor-growth-engine";
  const row = await storage.getUserTemplateDataByKey(
    workflow.userId,
    templateId,
    "message_templates",
    `msg_${templateKey}`
  );
  const def = row?.definition as { body?: string; title?: string } | undefined;
  const rawBody = typeof def?.body === "string" ? def.body : "";
  if (!rawBody.trim()) {
    console.warn(
      JSON.stringify({
        tag: "[WorkflowAction]",
        event: "send_message_template_skipped",
        reason: "template_missing_or_empty",
        workflowId: workflow.id,
        templateKey,
        templateId,
      })
    );
    return false;
  }
  const content = stripUnresolvedTemplateVars(interpolateRgeMessageTemplate(rawBody, contact));
  if (!content.trim()) {
    console.warn(
      JSON.stringify({
        tag: "[WorkflowAction]",
        event: "send_message_template_skipped",
        reason: "empty_after_interpolation",
        workflowId: workflow.id,
        templateKey,
      })
    );
    return false;
  }
  const { withAutomationSendDedup } = await import("./automationSendGuard");
  const dedupKey = `wf_msg_tpl:${workflow.id}:${templateKey}:${contact.id}:${content.slice(0, 80)}`;
  const out = await withAutomationSendDedup(dedupKey, workflow.userId, contact.id, async () => {
    let forceChannel: Channel | undefined;
    const conv = await storage.getConversation(conversationId);
    if (conv?.channel && conv.channel !== "calendly") {
      forceChannel = conv.channel as Channel;
    }
    return channelService.sendMessage({
      userId: workflow.userId,
      contactId: contact.id,
      content,
      contentType: "text",
      ...(forceChannel ? { forceChannel, suppressFallback: true as const } : {}),
      enforceWhatsAppCustomerServiceWindow: false,
    });
  });
  if (!out.ok) {
    console.log(JSON.stringify({ tag: "[WorkflowAction]", event: "send_message_template_deduped", templateKey }));
    return false;
  }
  if (!out.result.success) {
    console.warn(
      JSON.stringify({
        tag: "[WorkflowAction]",
        event: "send_message_template_failed",
        templateKey,
        error: out.result.error,
      })
    );
    return false;
  }
  return true;
}

export async function executeWorkflowActions(
  workflow: Workflow,
  chat: Chat | null,
  triggerData: any = {},
  contact?: Contact,
  conversationId?: string
): Promise<{ success: boolean; actionsExecuted: WorkflowAction[]; blockedReason?: string }> {
  const actions = workflow.actions as any[];
  const executedActions: WorkflowAction[] = [];
  
  try {
    const blockedReason = await blockGrowthEngineWorkflowIfNotEntitled(workflow, chat, conversationId, triggerData);
    if (blockedReason) {
      return { success: false, actionsExecuted: [], blockedReason };
    }
    for (const action of actions) {
      if (action.type === "apply_tag" && typeof action.tag === "string" && action.tag) {
        await dualWriteContact(
          contact,
          { tag: action.tag },
          chat,
          { tag: action.tag },
          { skipAutomationHooks: true }
        );
        executedActions.push({ type: "tag", value: action.tag });
        continue;
      }
      // RGE seed JSON uses `set_pipeline_stage` + `stage`; executor historically used `set_pipeline` + `value`.
      if (action.type === "set_pipeline_stage" && typeof action.stage === "string" && action.stage) {
        await dualWriteContact(
          contact,
          { pipelineStage: action.stage },
          chat,
          { pipelineStage: action.stage },
          { skipAutomationHooks: true }
        );
        executedActions.push({ type: "set_pipeline", value: action.stage });
        continue;
      }
      if (action.type === "detect_language") {
        const snippet = extractInboundSnippetForLanguage(triggerData, chat);
        const lang = detectLanguageCodeFromText(snippet);
        if (contact?.id) {
          const prev = (contact.customFields as Record<string, unknown>) || {};
          await storage
            .updateContact(
              contact.id,
              {
                customFields: {
                  ...prev,
                  languageDetected: lang,
                  _languageDetectedAt: new Date().toISOString(),
                },
              },
              { skipAutomationHooks: true }
            )
            .catch(() => {});
        }
        if (chat) {
          const prev = ((chat as any).customFields as Record<string, unknown>) || {};
          await storage
            .updateChat(chat.id, { customFields: { ...prev, languageDetected: lang } } as any)
            .catch(() => {});
        }
        if (contact?.id) {
          await storage
            .createActivityEvent({
              userId: workflow.userId,
              contactId: contact.id,
              conversationId: conversationId ?? null,
              eventType: "note",
              eventData: {
                kind: "language_detected",
                content: `Language detected: ${lang} (from inbound snippet)`,
                language: lang,
              },
              actorType: "system",
            })
            .catch(() => {});
        }
        executedActions.push({ type: "language_detected", value: lang });
        continue;
      }
      if (action.type === "update_lead_fields" && Array.isArray(action.fields) && contact?.id) {
        const fresh = await storage.getContact(contact.id);
        if (!fresh) continue;
        const cf = { ...((fresh.customFields as Record<string, unknown>) || {}) };
        let changed = false;
        if (action.fields.includes("languageDetected")) {
          if (typeof cf.languageDetected !== "string" || !cf.languageDetected) {
            const snippet = extractInboundSnippetForLanguage(triggerData, chat);
            cf.languageDetected = detectLanguageCodeFromText(snippet);
            cf._languageDetectedAt = new Date().toISOString();
            changed = true;
          }
        }
        if (changed) {
          await storage.updateContact(contact.id, { customFields: cf }, { skipAutomationHooks: true }).catch(() => {});
        }
        executedActions.push({ type: "lead_fields_updated", value: action.fields.map(String).join(",") });
        continue;
      }
      if (action.type === "create_or_update_lead") {
        // Inbound unified inbox already materializes contacts; nothing to create.
        continue;
      }
      if (action.type === "send_message_template" && typeof action.templateKey === "string" && action.templateKey) {
        const sent = await executeSendMessageTemplateAction({
          workflow,
          contact,
          conversationId,
          templateKey: action.templateKey,
        });
        if (sent) {
          executedActions.push({ type: "message_template", value: action.templateKey });
        }
        continue;
      }
      if (action.type === "create_task" && typeof action.title === "string" && action.title.trim() && contact?.id) {
        const dueDays = Number.isFinite(Number(action.dueDays)) ? Number(action.dueDays) : 1;
        const title = action.title.trim();
        const wfLabel = workflow.name || "Workflow";
        const dueAt = new Date();
        dueAt.setDate(dueAt.getDate() + Math.max(0, dueDays));
        const content = `Task: ${title}\nDue: ${dueAt.toLocaleDateString()} (${dueDays} day(s))\nWorkflow: ${wfLabel}`;
        await storage
          .createActivityEvent({
            userId: workflow.userId,
            contactId: contact.id,
            conversationId: conversationId ?? null,
            eventType: "note",
            eventData: {
              kind: "workflow_task",
              content,
              title,
              dueDays,
              dueAt: dueAt.toISOString(),
              workflowId: workflow.id,
              workflowName: wfLabel,
            },
            actorType: "system",
          })
          .catch(() => {});
        executedActions.push({ type: "task_created", value: action.title.trim() });
        continue;
      }
      switch (action.type) {
        case "assign":
          if (action.value === "round_robin") {
            const teamMembers = await storage.getTeamMembers(workflow.userId);
            const activeMembers = teamMembers.filter(m => m.status === "active" && m.memberId);
            if (activeMembers.length > 0) {
              const randomIndex = Math.floor(Math.random() * activeMembers.length);
              const assignee = activeMembers[randomIndex];
              await dualWriteContact(
                contact,
                { assignedTo: assignee.memberId ?? null },
                chat,
                { assignedTo: assignee.memberId },
                { skipAutomationHooks: true }
              );
              executedActions.push({ type: "assign", value: assignee.memberId || "unassigned" });
            }
          } else if (action.value) {
            await dualWriteContact(
              contact,
              { assignedTo: action.value },
              chat,
              { assignedTo: action.value },
              { skipAutomationHooks: true }
            );
            executedActions.push(action);
          }
          break;
          
        case "tag":
          if (action.value) {
            await dualWriteContact(
              contact,
              { tag: action.value },
              chat,
              { tag: action.value },
              { skipAutomationHooks: true }
            );
            executedActions.push(action);
          }
          break;
          
        case "set_status":
          // status belongs on conversation in the unified inbox; legacy chat
          // also stores status so both are updated during the dual-write window.
          if (action.value) {
            await dualWriteConversation(conversationId, action.value, chat);
            executedActions.push(action);
          }
          break;
          
        case "set_pipeline":
          if (action.value) {
            await dualWriteContact(
              contact,
              { pipelineStage: action.value },
              chat,
              { pipelineStage: action.value },
              { skipAutomationHooks: true }
            );
            executedActions.push(action);
          }
          break;
          
        case "add_note":
          if (action.value) {
            // Read existing notes from the authoritative source
            const currentNotes = (contact ? contact.notes : chat?.notes) || "";
            const timestamp = new Date().toLocaleString();
            const newNote = currentNotes
              ? `${currentNotes}\n\n[${timestamp}] ${action.value}`
              : `[${timestamp}] ${action.value}`;
            await dualWriteContact(
              contact,
              { notes: newNote },
              chat,
              { notes: newNote },
              { skipAutomationHooks: true }
            );
            executedActions.push(action);
          }
          break;
          
        case "set_followup":
          if (action.value) {
            const days = parseInt(action.value) || 1;
            const followUpDate = new Date();
            followUpDate.setDate(followUpDate.getDate() + days);
            const followUp = `${days} day${days > 1 ? 's' : ''}`;
            await dualWriteContact(
              contact,
              { followUpDate, followUp },
              chat,
              { followUpDate, followUp },
              { skipAutomationHooks: true }
            );
            executedActions.push(action);
          }
          break;

        default: {
          const t = action?.type as string | undefined;
          if (t) {
            const aiBucket = isAiBrainWorkflowActionType(t);
            const safeBucket = isRuntimeSafeWorkflowActionType(t);
            console.log(
              JSON.stringify({
                tag: "[WorkflowAction]",
                event: safeBucket ? "not_implemented_runtime_safe" : aiBucket ? "not_implemented_ai_brain_action" : "unknown_action_type",
                actionType: t,
                workflowId: workflow.id,
                workflowName: workflow.name,
                userId: workflow.userId,
                requiresAIBrainWhenImplemented: aiBucket,
              })
            );
          }
          break;
        }
      }
    }
    
    await storage.incrementWorkflowExecution(workflow.id);
    await storage.logWorkflowExecution({
      workflowId: workflow.id,
      chatId: chat?.id ?? null,
      // Phase E Step 3: also log conversationId (unified inbox reference)
      conversationId: conversationId ?? null,
      triggerData,
      actionsExecuted: executedActions,
      status: "success",
    });
    
    return { success: true, actionsExecuted: executedActions };
  } catch (error: any) {
    console.error("Workflow execution error:", error);
    await storage.logWorkflowExecution({
      workflowId: workflow.id,
      chatId: chat?.id ?? null,
      conversationId: conversationId ?? null,
      triggerData,
      actionsExecuted: executedActions,
      status: "failed",
      errorMessage: error.message,
    });
    return { success: false, actionsExecuted: executedActions };
  }
}

export async function triggerNewChatWorkflows(
  userId: string,
  chat: Chat,
  contact?: Contact,
  conversationId?: string,
  inboundMessage?: string
): Promise<void> {
  try {
    const limits = await subscriptionService.getUserLimits(userId);
    if (!limits?.workflowsEnabled) {
      console.log(`[Workflow] Skipping new_chat triggers — plan does not include automations for user ${userId}`);
      return;
    }
    const workflows = await storage.getActiveWorkflowsByTrigger(userId, "new_chat");
    for (const workflow of workflows) {
      await executeWorkflowActions(
        workflow,
        chat,
        { trigger: "new_chat", inboundText: inboundMessage ?? "" },
        contact,
        conversationId
      );
    }
  } catch (error) {
    console.error("Error triggering new chat workflows:", error);
  }
}

const W3_CALENDLY_PROMPT_THROTTLE_MS = 24 * 60 * 60 * 1000;
const W3_CALENDLY_SENT_AT_KEY = "_w3CalendlyBookingSentAt";

function readW3CalendlySentAtMs(contact: Contact | undefined, chat: Chat): number {
  const cf =
    (contact?.customFields as Record<string, unknown> | undefined) ||
    ((chat as any).customFields as Record<string, unknown> | undefined);
  const raw = cf?.[W3_CALENDLY_SENT_AT_KEY];
  if (typeof raw === "string") return Date.parse(raw);
  if (typeof raw === "number") return raw;
  return NaN;
}

async function persistW3CalendlySentAt(contact: Contact | undefined, chat: Chat): Promise<void> {
  const ts = new Date().toISOString();
  if (contact) {
    const prev = (contact.customFields as Record<string, unknown> | null) || {};
    await storage
      .updateContact(contact.id, { customFields: { ...prev, [W3_CALENDLY_SENT_AT_KEY]: ts } }, { skipAutomationHooks: true })
      .catch(() => {});
  } else {
    const prev = ((chat as any).customFields as Record<string, unknown> | null) || {};
    await storage
      .updateChat(chat.id, { customFields: { ...prev, [W3_CALENDLY_SENT_AT_KEY]: ts } } as any)
      .catch(() => {});
  }
}

async function finalizeW3CalendlyWorkflowRun(
  workflow: Workflow,
  chat: Chat,
  conversationId: string | undefined,
  triggerData: Record<string, unknown>,
  executedActions: WorkflowAction[]
): Promise<void> {
  await storage.incrementWorkflowExecution(workflow.id);
  await storage.logWorkflowExecution({
    workflowId: workflow.id,
    chatId: chat.id,
    conversationId: conversationId ?? null,
    triggerData,
    actionsExecuted: executedActions,
    status: "success",
  });
}

/**
 * RGE W3 with Calendly: keep keyword intent, tag the lead, send a single Calendly booking line (no manual W3 link).
 * Throttled per contact/chat; skips Calendly CRM/system lines and legacy Calendly-only chat keys.
 */
async function executeW3CalendlyKeywordResponse(
  workflow: Workflow,
  chat: Chat,
  message: string,
  contact: Contact | undefined,
  conversationId: string | undefined
): Promise<void> {
  const denied = await blockGrowthEngineWorkflowIfNotEntitled(workflow, chat, conversationId, {
    trigger: "keyword",
    message,
    templateKey: "W3",
    path: "w3_calendly",
  });
  if (denied) {
    return;
  }

  const lastMs = readW3CalendlySentAtMs(contact, chat);
  const now = Date.now();
  if (!Number.isNaN(lastMs) && now - lastMs < W3_CALENDLY_PROMPT_THROTTLE_MS) {
    return;
  }

  await dualWriteContact(
    contact,
    { tag: "Appointment Requested" },
    chat,
    { tag: "Appointment Requested" }
  );

  const url = await getCalendlyPublicSchedulingUrl(workflow.userId);
  const body = url ? `You can book directly here: ${url}` : "";

  const baseExecuted: WorkflowAction[] = [{ type: "tag", value: "Appointment Requested" }];

  if (!body) {
    console.log(
      `[W3+Calendly] No calendlyPrimarySchedulingUrl for user ${workflow.userId} — tag applied, outbound skipped`
    );
    await persistW3CalendlySentAt(contact, chat);
    await finalizeW3CalendlyWorkflowRun(
      workflow,
      chat,
      conversationId,
      { trigger: "keyword", message, templateKey: "W3", w3CalendlyPromptSent: false, w3CalendlyReason: "no_scheduling_url" },
      baseExecuted
    );
    return;
  }

  if (isLegacyCalendlyWorkflowChat(chat.whatsappPhone)) {
    await persistW3CalendlySentAt(contact, chat);
    await finalizeW3CalendlyWorkflowRun(
      workflow,
      chat,
      conversationId,
      { trigger: "keyword", message, templateKey: "W3", w3CalendlyPromptSent: false, w3CalendlyReason: "legacy_calendly_chat" },
      baseExecuted
    );
    return;
  }

  let sent = false;
  if (contact?.id) {
    let forceChannel: Channel | undefined;
    if (conversationId) {
      const conv = await storage.getConversation(conversationId);
      if (conv?.channel && conv.channel !== "calendly") {
        forceChannel = conv.channel as Channel;
      }
    }
    const { withAutomationSendDedup } = await import("./automationSendGuard");
    const dedupKey = `w3cal_send:${workflow.userId}:${contact.id}:${body.slice(0, 120)}`;
    const sendOutcome = await withAutomationSendDedup(dedupKey, workflow.userId, contact.id, async () =>
      channelService.sendMessage({
        userId: workflow.userId,
        contactId: contact.id,
        content: body,
        contentType: "text",
        ...(forceChannel ? { forceChannel, suppressFallback: true as const } : {}),
        enforceWhatsAppCustomerServiceWindow: false,
      })
    );
    if (sendOutcome.ok && sendOutcome.result.success) {
      sent = true;
    } else if (!sendOutcome.ok) {
      console.log(JSON.stringify({ tag: "[W3+Calendly]", deduped: true, contactId: contact.id }));
    } else {
      console.warn(`[W3+Calendly] channelService.sendMessage failed contact=${contact.id}: ${sendOutcome.result.error}`);
    }
  } else {
    const raw = ((contact?.phone as string | undefined) || chat.whatsappPhone || "").toString();
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 10) {
      try {
        const { withAutomationSendDedup } = await import("./automationSendGuard");
        const dedupKey = `w3cal_fallback:${workflow.userId}:${digits}:${body.slice(0, 120)}`;
        const out = await withAutomationSendDedup(dedupKey, workflow.userId, contact?.id ?? null, async () => {
          const user = await storage.getUser(workflow.userId);
          if (user?.whatsappProvider === "meta") {
            await sendMetaWhatsAppMessage(workflow.userId, digits, body);
          } else {
            await sendUserWhatsAppMessage(workflow.userId, digits, body);
          }
        });
        if (out.ok) {
          sent = true;
        } else {
          console.log(JSON.stringify({ tag: "[W3+Calendly]", deduped: true, digits }));
        }
      } catch (e: any) {
        console.warn(`[W3+Calendly] WhatsApp fallback send failed: ${e?.message || e}`);
      }
    } else {
      console.warn(`[W3+Calendly] No contact id or dialable phone — outbound skipped for chat ${chat.id}`);
    }
  }

  if (sent) {
    await persistW3CalendlySentAt(contact, chat);
  }

  await finalizeW3CalendlyWorkflowRun(
    workflow,
    chat,
    conversationId,
    { trigger: "keyword", message, templateKey: "W3", w3CalendlyPromptSent: sent },
    baseExecuted
  );
}

export async function triggerKeywordWorkflows(
  userId: string,
  chat: Chat,
  message: string,
  contact?: Contact,
  conversationId?: string
): Promise<void> {
  try {
    const limits = await subscriptionService.getUserLimits(userId);
    if (!limits?.workflowsEnabled) {
      return;
    }
    const calendlyBooking = await isUserCalendlyBookingConnected(userId);
    let conversationChannel: string | undefined;
    if (conversationId) {
      const conv = await storage.getConversation(conversationId);
      conversationChannel = conv?.channel || undefined;
    }
    const sysCalendlyInbound = /^(Booked:|Rescheduled to|Booking canceled\b)/i.test((message || "").trim());

    const workflows = await storage.getActiveWorkflowsByTrigger(userId, "keyword");
    for (const workflow of workflows) {
      const templateKey = (workflow.triggerConditions as { templateKey?: string } | undefined)?.templateKey;
      if (templateKey === "W3" && (sysCalendlyInbound || conversationChannel === "calendly")) {
        continue;
      }
      const conditions = workflow.triggerConditions as WorkflowCondition;
      const keywords = conditions?.keywords || [];
      const messageLower = message.toLowerCase();
      
      const keywordMatched = keywords.some(keyword => 
        messageLower.includes(keyword.toLowerCase())
      );
      
      if (keywordMatched) {
        if (calendlyBooking && templateKey === "W3") {
          await executeW3CalendlyKeywordResponse(workflow, chat, message, contact, conversationId);
        } else {
          await executeWorkflowActions(workflow, chat, { 
            trigger: "keyword", 
            message,
            matchedKeywords: keywords.filter(k => messageLower.includes(k.toLowerCase()))
          }, contact, conversationId);
        }
      }
    }
  } catch (error) {
    console.error("Error triggering keyword workflows:", error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// W2 Buyer Readiness / Financial Qualification Engine
// ─────────────────────────────────────────────────────────────────────────────

function splitKeywords(raw: string): string[] {
  return raw.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some(k => text.includes(k));
}

interface W2Result {
  scoreAdjustment: number;
  qualificationQuestion: string | null;
  fieldUpdates: Record<string, any>;
  signalsDetected: string[];
}

export async function runW2QualificationEngine(
  userId: string,
  chat: Chat,
  message: string,
  contact?: Contact
): Promise<W2Result> {
  const prefs = await getTemplatePreferences(userId);
  const def = {
    financialKeywords: "pre approved, preapproved, mortgage, lender, financing, loan, down payment, credit score, cash buyer, cash, fha, va, conventional",
    budgetKeywords: "budget, price range, max price, up to, around, afford, under, over, million",
    timelineKeywords: "asap, immediately, this month, next month, 30 days, 60 days, 90 days, 3 months, soon, just browsing, researching",
    bookingKeywords: "tour, showing, visit, schedule, appointment, call, see property, viewing",
    buyerKeywords: "buy, purchase, looking for, apartment, house, condo",
    askFinancingFollowUp: true,
    askBudgetFollowUp: true,
    askTimelineFollowUp: true,
    limitOneQuestion: true,
    financingQuestion: "Are you currently pre-approved, working with a lender, or still exploring financing options?",
    budgetQuestion: "Do you have a budget or price range in mind?",
    timelineQuestion: "Are you planning to move soon, or are you still exploring options?",
    lenderQuestion: "If helpful, I can also connect you with a lender for pre-approval guidance.",
  };

  const get = (field: string) => prefs[`W2_${field}`] !== undefined ? prefs[`W2_${field}`] : (def as any)[field];

  const msgLower = message.toLowerCase();
  const financialKw = splitKeywords(get("financialKeywords"));
  const budgetKw = splitKeywords(get("budgetKeywords"));
  const timelineKw = splitKeywords(get("timelineKeywords"));
  const bookingKw = splitKeywords(get("bookingKeywords"));
  const buyerKw = splitKeywords(get("buyerKeywords"));

  const signals: string[] = [];
  let score = 0;
  const fieldUpdates: Record<string, any> = {};
  // Phase B: read signal state from contact.customFields if available (unified inbox),
  // falling back to chat.customFields for backwards compatibility.
  // Note: customFields is not in the Chat Drizzle type (it's a DB-only column added
  // via push migration) so we read it via (chat as any).customFields.
  const existingCustomFields = contact
    ? ((contact.customFields as Record<string, any>) || {})
    : (((chat as any).customFields as Record<string, any>) || {});

  // Lead type detection
  const isBuyer = matchesAny(msgLower, buyerKw);
  if (isBuyer && !existingCustomFields.leadType) {
    fieldUpdates.leadType = "Buyer";
  }

  // Financial / pre-approval signals
  const isPreApproved = /pre.?approv|already approv/i.test(message);
  const isCashBuyer = /cash buyer|paying cash|all cash|no mortgage/i.test(message);
  const isWorkingWithLender = /working with (a |my )?lender|have (a |my )?lender|with (a |my )?realtor/i.test(message) || (matchesAny(msgLower, financialKw) && !isPreApproved && !isCashBuyer);
  const isBrowsing = /just browsing|only browsing|still researching|not ready|not sure yet/i.test(message);

  if (isPreApproved) {
    signals.push("PREAPPROVED_YES");
    score += 30;
    fieldUpdates.preApproved = "yes";
    fieldUpdates.financingType = "mortgage";
  } else if (isCashBuyer) {
    signals.push("CASH_BUYER");
    score += 40;
    fieldUpdates.preApproved = "yes";
    fieldUpdates.financingType = "cash";
  } else if (isWorkingWithLender) {
    signals.push("WORKING_WITH_LENDER");
    score += 20;
    fieldUpdates.lenderConnected = "yes";
    fieldUpdates.financingType = "mortgage";
  } else if (matchesAny(msgLower, financialKw)) {
    signals.push("NEEDS_FINANCING");
    score += 5;
    if (!existingCustomFields.financingType) fieldUpdates.financingType = "unknown";
  }

  // Budget detection
  const budgetMatch = message.match(/\b(\$[\d,]+k?|\d+[\d,]*\s*k\b|\d+[\d,]*\s*million\b)/i);
  if (budgetMatch) {
    signals.push("BUDGET_MENTIONED");
    score += 20;
    fieldUpdates.budgetRange = budgetMatch[0].trim();
  } else if (matchesAny(msgLower, budgetKw)) {
    signals.push("BUDGET_KEYWORD");
    score += 10;
  }

  // Timeline detection
  const isAsap = /asap|immediately|right away|this month|next month|30 days|in a month/i.test(message);
  const is60to90 = /60 days|90 days|3 months|few months/i.test(message);
  if (isAsap) {
    signals.push("TIMELINE_30_DAYS_OR_LESS");
    score += 30;
    fieldUpdates.timeline = "asap";
  } else if (is60to90) {
    signals.push("TIMELINE_60_TO_90_DAYS");
    score += 15;
    fieldUpdates.timeline = "60-90d";
  } else if (isBrowsing) {
    signals.push("JUST_BROWSING");
    score += 5;
    fieldUpdates.timeline = "browsing";
  } else if (matchesAny(msgLower, timelineKw)) {
    signals.push("TIMELINE_KEYWORD");
    score += 8;
  }

  // Booking / high-intent
  const hasBookingIntent = matchesAny(msgLower, bookingKw);
  if (hasBookingIntent) {
    signals.push("BOOKING_INTENT");
  }

  // Cap per-message positive score
  score = Math.min(score, 60);

  // Apply field updates — dual-write to contact.customFields (unified inbox) and
  // chat.customFields (legacy, kept during transition window).
  if (Object.keys(fieldUpdates).length > 0) {
    const merged = { ...existingCustomFields, ...fieldUpdates };
    try {
      if (contact) {
        await storage.updateContact(contact.id, { customFields: merged }, { skipAutomationHooks: true }).catch(() => {});
      }
      await storage.updateChat(chat.id, { customFields: merged } as any).catch(() => {});
    } catch (e) {
      // non-critical — continue
    }
  }

  // Qualification follow-up logic — only for buyers with missing info
  let qualificationQuestion: string | null = null;
  const cf = { ...existingCustomFields, ...fieldUpdates };
  const isQualifiedLead = isBuyer || existingCustomFields.leadType === "Buyer";
  // Phase D guard: prefer contact pipeline/tag (unified inbox); fall back to chat.
  const alreadyUnqualified = contact
    ? (contact.pipelineStage === "Unqualified" || contact.tag === "Do Not Contact")
    : (chat.pipelineStage === "Unqualified" || chat.tag === "Do Not Contact");

  if (isQualifiedLead && !alreadyUnqualified && !hasBookingIntent) {
    const lastAsked = existingCustomFields._lastQualificationAskedAt;
    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
    const cooldownOk = !lastAsked || new Date(lastAsked).getTime() < twelveHoursAgo;

    if (cooldownOk) {
      const askFinancing = get("askFinancingFollowUp") !== false;
      const askBudget = get("askBudgetFollowUp") !== false;
      const askTimeline = get("askTimelineFollowUp") !== false;
      const limitOne = get("limitOneQuestion") !== false;

      const missingFinancing = !cf.preApproved && !cf.financingType && !isPreApproved && !isCashBuyer && !isWorkingWithLender;
      const missingBudget = !cf.budgetRange && !budgetMatch;
      const missingTimeline = !cf.timeline && !isAsap && !is60to90 && !isBrowsing;

      if (askFinancing && missingFinancing) {
        qualificationQuestion = get("financingQuestion");
      } else if (askBudget && missingBudget && (!limitOne || !missingFinancing || !askFinancing)) {
        qualificationQuestion = get("budgetQuestion");
      } else if (askTimeline && missingTimeline && (!limitOne || (!missingFinancing && !missingBudget))) {
        qualificationQuestion = get("timelineQuestion");
      }

      if (qualificationQuestion) {
        const cfWithTimestamp = { ...cf, _lastQualificationAskedAt: new Date().toISOString() };
        try {
          if (contact) {
            await storage.updateContact(contact.id, { customFields: cfWithTimestamp }, { skipAutomationHooks: true }).catch(() => {});
          }
          await storage.updateChat(chat.id, { customFields: cfWithTimestamp } as any).catch(() => {});
        } catch (e) { /* non-critical */ }
      }
    }
  }

  // Cumulative CRM score on `contacts.lead_score` (0–100) + Copilot-facing custom field mirrors.
  if (contact?.id && (score > 0 || signals.length > 0)) {
    try {
      const fresh = await storage.getContact(contact.id);
      if (fresh) {
        const prevLead =
          typeof fresh.leadScore === "number" && Number.isFinite(fresh.leadScore) ? fresh.leadScore : 0;
        const nextLead = Math.min(100, Math.max(0, prevLead + score));
        const cfPrev = (fresh.customFields as Record<string, unknown>) || {};
        await storage
          .updateContact(
            contact.id,
            {
              leadScore: nextLead,
              customFields: {
                ...cfPrev,
                leadScore: nextLead,
                lastW2InboundAt: new Date().toISOString(),
                lastW2Signals: signals,
                ...(signals.length ? { lastScoreReasons: signals.join(", ") } : {}),
              },
            },
            { skipAutomationHooks: true }
          )
          .catch(() => {});
        void import("./automationEventDispatcher").then(({ dispatchAiScoreChanged }) =>
          dispatchAiScoreChanged({
            userId,
            contactId: contact.id,
            score: nextLead,
            bucket: nextLead >= 80 ? "hot" : nextLead >= 50 ? "warm" : nextLead >= 20 ? "mild" : "cold",
          })
        );
      }
    } catch {
      /* non-critical */
    }
  }

  return { scoreAdjustment: score, qualificationQuestion, fieldUpdates, signalsDetected: signals };
}

interface ServiceConfig {
  type: string;
  name: string;
  enabled: boolean;
  keywords: string;
  offerMessage: string;
  routingType: "contact_info" | "link" | "task";
  partnerName: string;
  contact: string;
  link: string;
  tags: string[];
}

export interface ServiceRoutingResult {
  offerMessage: string | null;
  routingMessage: string | null;
  taskNote: string | null;
  tagsToApply: string[];
  serviceType: string | null;
}

async function getServiceRoutingConfig(userId: string): Promise<ServiceConfig[]> {
  try {
    const data = await storage.getUserTemplateDataByKey(
      userId, "realtor-growth-engine", "routing_config", "realtor_service_routing"
    );
    const services = (data?.definition as any)?.services;
    return Array.isArray(services) ? services : [];
  } catch {
    return [];
  }
}

const CONFIRM_PATTERNS = /\b(yes|yeah|yep|sure|ok|okay|please|definitely|absolutely|sounds good|go ahead|do it|connect me|yes please|i would|i'd like)\b/i;
const DECLINE_PATTERNS = /\b(no|nope|not now|no thanks|don't|dont|maybe later|not interested|pass|not yet)\b/i;

export async function runServiceRoutingEngine(
  userId: string,
  chat: Chat,
  message: string,
  contact?: Contact
): Promise<ServiceRoutingResult> {
  const empty: ServiceRoutingResult = { offerMessage: null, routingMessage: null, taskNote: null, tagsToApply: [], serviceType: null };

  try {
    const services = await getServiceRoutingConfig(userId);
    const enabledServices = services.filter(s => s.enabled && s.keywords?.trim());
    if (enabledServices.length === 0) return empty;

    // Phase D guard: prefer contact pipeline/tag; fall back to chat.
    const alreadyUnqualified = contact
      ? (contact.pipelineStage === "Unqualified" || contact.tag === "Do Not Contact")
      : (chat.pipelineStage === "Unqualified" || chat.tag === "Do Not Contact");
    if (alreadyUnqualified) return empty;

    // Phase B: read signal state from contact.customFields if available.
    const cf = contact
      ? ((contact.customFields as Record<string, any>) || {})
      : (((chat as any).customFields as Record<string, any>) || {});
    const msgLower = message.toLowerCase();
    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    // Check if there's a pending offer awaiting confirmation
    const pending = cf._pendingServiceOffer as { type: string; timestamp: number } | undefined;
    if (pending && (now - pending.timestamp) < twentyFourHoursMs) {
      const svc = enabledServices.find(s => s.type === pending.type);
      if (svc) {
        if (CONFIRM_PATTERNS.test(message)) {
          // Execute routing
          let routingMessage: string | null = null;
          let taskNote: string | null = null;

          if (svc.routingType === "contact_info" && svc.contact) {
            const name = svc.partnerName ? `${svc.partnerName}: ` : "";
            routingMessage = `Here are the details: ${name}${svc.contact}`;
          } else if (svc.routingType === "link" && svc.link) {
            const name = svc.partnerName ? `with ${svc.partnerName} ` : "";
            routingMessage = `You can book ${name}here: ${svc.link}`;
          } else {
            // "task" — internal note + optional contact/link if available
            const name = svc.partnerName || svc.name;
            const details = [svc.contact, svc.link].filter(Boolean).join(" | ");
            taskNote = `Connect lead with ${name}${details ? ` (${details})` : ""}`;
            routingMessage = svc.contact
              ? `Here are the details: ${svc.partnerName ? svc.partnerName + ": " : ""}${svc.contact}${svc.link ? " | Book: " + svc.link : ""}`
              : null;
          }

          // Clear pending offer and record execution — dual-write
          const cfAfterRoute = {
            ...cf,
            _pendingServiceOffer: null,
            [`_serviceRouted_${svc.type}`]: new Date().toISOString(),
          };
          try {
            if (contact) {
              await storage.updateContact(contact.id, { customFields: cfAfterRoute }, { skipAutomationHooks: true }).catch(() => {});
            }
            await storage.updateChat(chat.id, { customFields: cfAfterRoute } as any).catch(() => {});
          } catch { /* non-critical */ }

          return { offerMessage: null, routingMessage, taskNote, tagsToApply: svc.tags || [], serviceType: svc.type };
        }

        if (DECLINE_PATTERNS.test(message)) {
          // Clear the pending offer — dual-write
          const cfDeclined = { ...cf, _pendingServiceOffer: null };
          try {
            if (contact) {
              await storage.updateContact(contact.id, { customFields: cfDeclined }, { skipAutomationHooks: true }).catch(() => {});
            }
            await storage.updateChat(chat.id, { customFields: cfDeclined } as any).catch(() => {});
          } catch { /* non-critical */ }
        }

        return empty;
      }
    }

    // No pending offer — check for service intent in this message
    for (const svc of enabledServices) {
      const kws = svc.keywords.split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);
      const detected = kws.some((kw: string) => msgLower.includes(kw));
      if (!detected) continue;

      // Check 24h cooldown per service
      const lastOffered = cf[`_serviceOffered_${svc.type}`];
      if (lastOffered && (now - new Date(lastOffered).getTime()) < twentyFourHoursMs) continue;

      // Already routed?
      const lastRouted = cf[`_serviceRouted_${svc.type}`];
      if (lastRouted && (now - new Date(lastRouted).getTime()) < twentyFourHoursMs) continue;

      // Set pending offer — dual-write
      const cfWithOffer = {
        ...cf,
        _pendingServiceOffer: { type: svc.type, timestamp: now },
        [`_serviceOffered_${svc.type}`]: new Date().toISOString(),
      };
      try {
        if (contact) {
          await storage.updateContact(contact.id, { customFields: cfWithOffer }, { skipAutomationHooks: true }).catch(() => {});
        }
        await storage.updateChat(chat.id, { customFields: cfWithOffer } as any).catch(() => {});
      } catch { /* non-critical */ }

      return { offerMessage: svc.offerMessage, routingMessage: null, taskNote: null, tagsToApply: [], serviceType: svc.type };
    }

    return empty;
  } catch (error) {
    console.error("[ServiceRoutingEngine] Error:", error);
    return empty;
  }
}

export async function triggerPipelineChangeWorkflows(
  userId: string,
  chat: Chat | null,
  oldStage: string,
  newStage: string,
  contact?: Contact,
  conversationId?: string
): Promise<void> {
  try {
    const limits = await subscriptionService.getUserLimits(userId);
    if (!limits?.workflowsEnabled) {
      return;
    }
    const workflows = await storage.getActiveWorkflowsByTrigger(userId, "pipeline_change");
    for (const workflow of workflows) {
      const conditions = workflow.triggerConditions as WorkflowCondition;
      const targetStage = conditions?.stage;
      const matches =
        !targetStage ||
        targetStage === "any" ||
        targetStage.trim() === "" ||
        targetStage === newStage;
      if (!matches) continue;

      console.log(
        JSON.stringify({
          tag: "[WorkflowTrigger]",
          trigger: "pipeline_change",
          workflowId: workflow.id,
          workflowName: workflow.name,
          oldStage,
          newStage,
        })
      );
      await executeWorkflowActions(
        workflow,
        chat,
        {
          trigger: "pipeline_change",
          oldStage,
          newStage,
        },
        contact,
        conversationId
      );
    }
  } catch (error) {
    console.error("Error triggering pipeline change workflows:", error);
  }
}

export async function triggerTagChangeWorkflows(
  userId: string,
  chat: Chat | null,
  oldTag: string,
  newTag: string,
  contact?: Contact,
  conversationId?: string
): Promise<void> {
  try {
    const limits = await subscriptionService.getUserLimits(userId);
    if (!limits?.workflowsEnabled) {
      return;
    }
    const workflows = await storage.getActiveWorkflowsByTrigger(userId, "tag_change");
    for (const workflow of workflows) {
      const conditions = workflow.triggerConditions as WorkflowCondition;
      const targetTags = conditions?.tags || [];

      if (targetTags.length === 0 || targetTags.includes(newTag)) {
        console.log(
          JSON.stringify({
            tag: "[WorkflowTrigger]",
            trigger: "tag_change",
            workflowId: workflow.id,
            workflowName: workflow.name,
            newTag,
          })
        );
        await executeWorkflowActions(workflow, chat, {
          trigger: "tag_change",
          oldTag,
          newTag,
        }, contact, conversationId);
      }
    }
  } catch (error) {
    console.error("Error triggering tag change workflows:", error);
  }
}
