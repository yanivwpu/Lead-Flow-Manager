import { storage } from "./storage";
import { type ChatbotFlow } from "@shared/schema";

// ─── Button types ──────────────────────────────────────────────────────────

export interface ButtonOption {
  label: string;
  value: string;
  nextNodeId?: string;
}

/** Accept both legacy string format and new object format */
function resolveButton(btn: string | ButtonOption): ButtonOption {
  if (typeof btn === "string") {
    return { label: btn, value: btn };
  }
  return {
    label: btn.label || btn.value,
    value: btn.value || btn.label,
    nextNodeId: btn.nextNodeId,
  };
}

interface ChatbotNode {
  id: string;
  type: "message" | "question" | "condition" | "action" | "delay";
  data: {
    label?: string;
    content?: string;
    messageType?: string;
    mediaUrl?: string;
    mediaCaption?: string;
    fileName?: string;
    buttons?: (string | ButtonOption)[];
    options?: { label: string; nextNodeId: string }[];
    condition?: { type: string; value: string };
    action?: { type: string; value: string };
    delayMinutes?: number;
    variableName?: string;
  };
  position?: { x: number; y: number };
}

interface ChatbotEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface TriggerContext {
  userId: string;
  contactId: string;
  conversationId: string;
  channel: string;
  message: string;
  isNewConversation: boolean;
}

// ─── Per-conversation cooldown ─────────────────────────────────────────────
const COOLDOWN_MS = 30_000;
const lastFiredAt = new Map<string, number>();

function isCoolingDown(conversationId: string): boolean {
  const last = lastFiredAt.get(conversationId);
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS;
}

function markFired(conversationId: string): void {
  lastFiredAt.set(conversationId, Date.now());
  if (lastFiredAt.size > 10_000) {
    const cutoff = Date.now() - COOLDOWN_MS * 2;
    for (const [k, v] of lastFiredAt) {
      if (v < cutoff) lastFiredAt.delete(k);
    }
  }
}

// ─── Pending button state ──────────────────────────────────────────────────
// When a buttons node fires, we store the pending state so the next reply
// can be matched to a button and route to the correct next node.

interface PendingButtons {
  flowId: string;
  buttons: ButtonOption[];
  expiresAt: number; // unix ms
}

const pendingButtonsMap = new Map<string, PendingButtons>(); // conversationId → state
const BUTTON_TTL_MS = 10 * 60 * 1000; // 10 minutes

function setPendingButtons(conversationId: string, flowId: string, buttons: ButtonOption[]): void {
  pendingButtonsMap.set(conversationId, {
    flowId,
    buttons,
    expiresAt: Date.now() + BUTTON_TTL_MS,
  });
  if (pendingButtonsMap.size > 5_000) {
    const now = Date.now();
    for (const [k, v] of pendingButtonsMap) {
      if (v.expiresAt < now) pendingButtonsMap.delete(k);
    }
  }
}

function getPendingButtons(conversationId: string): PendingButtons | null {
  const state = pendingButtonsMap.get(conversationId);
  if (!state) return null;
  if (Date.now() > state.expiresAt) {
    pendingButtonsMap.delete(conversationId);
    return null;
  }
  return state;
}

function clearPendingButtons(conversationId: string): void {
  pendingButtonsMap.delete(conversationId);
}

/** Match incoming text against pending button values or labels (case-insensitive) */
function matchPendingButton(message: string, buttons: ButtonOption[]): ButtonOption | null {
  const msgNorm = message.trim().toLowerCase();
  // Exact value match
  const byValue = buttons.find(b => b.value.trim().toLowerCase() === msgNorm);
  if (byValue) return byValue;
  // Exact label match
  const byLabel = buttons.find(b => b.label.trim().toLowerCase() === msgNorm);
  if (byLabel) return byLabel;
  // Numeric match (e.g. "1" → first button)
  const num = parseInt(msgNorm, 10);
  if (!isNaN(num) && num >= 1 && num <= buttons.length) {
    return buttons[num - 1];
  }
  return null;
}

// ─── Max delay cap ─────────────────────────────────────────────────────────
const MAX_DELAY_MS = 5 * 60 * 1000;

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

function keywordMatches(message: string, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  const msgNorm = normalizeText(message);
  if (!msgNorm) return false;
  return keywords.some((kw) => {
    const kwNorm = normalizeText(kw);
    if (!kwNorm) return false;
    return msgNorm === kwNorm || msgNorm.includes(kwNorm);
  });
}

export async function willChatbotTrigger(
  userId: string,
  message: string,
  isNewConversation: boolean
): Promise<boolean> {
  try {
    const activeFlows = await storage.getActiveChatbotFlows(userId);
    for (const flow of activeFlows) {
      const keywords = (flow.triggerKeywords as string[]) || [];
      if (keywords.length > 0 && keywordMatches(message, keywords)) return true;
      if (flow.triggerOnNewChat && isNewConversation) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── WhatsApp provider detection ───────────────────────────────────────────

async function getWhatsAppProvider(userId: string): Promise<"meta" | "twilio"> {
  try {
    const user = await storage.getUser(userId);
    return (user?.whatsappProvider as "meta" | "twilio") || "twilio";
  } catch {
    return "twilio";
  }
}

// ─── Reply senders ─────────────────────────────────────────────────────────

async function sendChatbotReply(
  ctx: TriggerContext,
  content: string
): Promise<void> {
  try {
    const { channelService } = await import("./channelService");
    await channelService.sendMessage({
      userId: ctx.userId,
      contactId: ctx.contactId,
      content,
      contentType: "text",
    });
    console.log(
      `[Chatbot] ✅ Text reply sent — contactId: ${ctx.contactId}, channel: ${ctx.channel}, preview: "${content.substring(0, 80)}"`
    );
  } catch (err: any) {
    console.error(
      `[Chatbot] ❌ Failed to send text reply to contactId: ${ctx.contactId} — error: ${err.message}`
    );
  }
}

function normaliseMediaContentType(msgType: string): string {
  if (msgType === "file") return "document";
  return msgType;
}

async function sendChatbotMedia(
  ctx: TriggerContext,
  mediaUrl: string,
  contentType: string,
  caption: string
): Promise<void> {
  const normalisedType = normaliseMediaContentType(contentType);
  console.log(
    `[Chatbot] 📎 Entering media node — contactId: ${ctx.contactId}, contentType: ${contentType} → normalised: ${normalisedType}, mediaUrl: "${mediaUrl.substring(0, 120)}"`
  );
  if (!mediaUrl) {
    console.warn(
      `[Chatbot] ⚠ Media node skipped — mediaUrl is missing for contactId: ${ctx.contactId}`
    );
    return;
  }
  try {
    const { channelService } = await import("./channelService");
    console.log(
      `[Chatbot] 🚀 Attempting outbound media send — contactId: ${ctx.contactId}, channel: ${ctx.channel}, contentType: ${normalisedType}`
    );
    const result = await channelService.sendMessage({
      userId: ctx.userId,
      contactId: ctx.contactId,
      content: caption || "",
      contentType: normalisedType,
      mediaUrl,
    });
    if (result.success) {
      console.log(
        `[Chatbot] ✅ Media reply sent — contactId: ${ctx.contactId}, channel: ${ctx.channel}, contentType: ${normalisedType}, externalId: ${result.externalMessageId}`
      );
    } else {
      console.error(
        `[Chatbot] ❌ Media send failed — contactId: ${ctx.contactId}, error: ${result.error}`
      );
    }
  } catch (err: any) {
    console.error(
      `[Chatbot] ❌ Exception sending media to contactId: ${ctx.contactId} — error: ${err.message}`
    );
  }
}

// ─── Button senders ────────────────────────────────────────────────────────

/**
 * Meta WhatsApp: send real interactive button message.
 * Supports up to 3 buttons. If more than 3 are provided, extra are truncated (with warning).
 */
async function sendChatbotButtonsMeta(
  ctx: TriggerContext,
  promptText: string,
  buttons: ButtonOption[]
): Promise<boolean> {
  if (buttons.length === 0) return false;
  const capped = buttons.slice(0, 3);
  if (buttons.length > 3) {
    console.warn(
      `[Chatbot] ⚠ Buttons node — ${buttons.length} buttons provided but WhatsApp supports max 3. Truncating to first 3.`
    );
  }

  try {
    const contact = await storage.getContact(ctx.contactId);
    if (!contact?.phone) {
      console.warn(`[Chatbot] ⚠ Meta buttons — no phone number for contactId: ${ctx.contactId}`);
      return false;
    }

    const { sendMetaInteractiveMessage } = await import("./userMeta");

    // Build the Meta interactive button payload
    const metaButtons = capped.map((btn, i) => ({
      type: "reply",
      reply: {
        id: `btn_${i}_${btn.value.substring(0, 240)}`,
        title: btn.label.substring(0, 20), // WhatsApp label limit: 20 chars
      },
    }));

    const interactive = {
      body: { text: promptText || "Please choose an option:" },
      action: { buttons: metaButtons },
    };

    console.log(
      `[Chatbot] 🔘 Sending Meta interactive buttons — contactId: ${ctx.contactId}, buttons: [${capped.map(b => b.label).join(", ")}]`
    );

    const phone = contact.phone.startsWith("+") ? contact.phone : `+${contact.phone}`;
    const result = await sendMetaInteractiveMessage(
      ctx.userId,
      phone,
      "button",
      interactive
    );

    // Store message in DB manually (Meta interactive doesn't go through channelService)
    const conversation = await storage.getConversationByContactAndChannel(ctx.contactId, "whatsapp");
    if (conversation) {
      await storage.createMessage({
        conversationId: conversation.id,
        contactId: ctx.contactId,
        userId: ctx.userId,
        direction: "outbound",
        content: promptText,
        contentType: "buttons",
        status: "sent",
        externalMessageId: result.messageId,
        sentAt: new Date(),
        templateVariables: { chatbotButtons: capped },
      });
      await storage.updateConversation(conversation.id, {
        lastMessageAt: new Date(),
        lastMessagePreview: promptText.substring(0, 100),
        lastMessageDirection: "outbound",
      });
    }

    console.log(
      `[Chatbot] ✅ Meta interactive buttons sent — contactId: ${ctx.contactId}, externalId: ${result.messageId}`
    );
    return true;
  } catch (err: any) {
    console.error(
      `[Chatbot] ❌ Meta interactive buttons failed — contactId: ${ctx.contactId} — error: ${err.message}. Falling back to text.`
    );
    return false;
  }
}

/**
 * WebChat: store button data in the message so the widget renders real clickable buttons.
 */
async function sendChatbotButtonsWebchat(
  ctx: TriggerContext,
  promptText: string,
  buttons: ButtonOption[]
): Promise<void> {
  if (buttons.length === 0) {
    await sendChatbotReply(ctx, promptText || "Please choose an option:");
    return;
  }
  try {
    const { channelService } = await import("./channelService");
    const result = await channelService.sendMessage({
      userId: ctx.userId,
      contactId: ctx.contactId,
      content: promptText,
      contentType: "buttons",
      templateVariables: { chatbotButtons: buttons },
    });
    if (result.success) {
      console.log(
        `[Chatbot] ✅ WebChat interactive buttons sent — contactId: ${ctx.contactId}, options: [${buttons.map(b => b.label).join(", ")}]`
      );
    } else {
      console.error(`[Chatbot] ❌ WebChat buttons send failed: ${result.error}`);
    }
  } catch (err: any) {
    console.error(`[Chatbot] ❌ WebChat buttons exception: ${err.message}`);
  }
}

/**
 * Fallback for Twilio WhatsApp, SMS, Telegram, Instagram, Facebook:
 * send a numbered plain-text list.
 * NOTE: Twilio WhatsApp interactive buttons require the Content API with
 * pre-approved templates — not wired in this stack. Telegram, Instagram,
 * and Facebook Messenger do not support WhatsApp-style reply buttons.
 */
async function sendChatbotButtonsFallback(
  ctx: TriggerContext,
  promptText: string,
  buttons: ButtonOption[],
  reason: string
): Promise<void> {
  console.warn(
    `[Chatbot] ⚠ Buttons node — interactive buttons not supported on channel "${ctx.channel}" (${reason}). Falling back to plain-text numbered list.`
  );
  const numberedList = buttons.map((b, i) => `${i + 1}. ${b.label}`).join("\n");
  const fullText = promptText ? `${promptText}\n\n${numberedList}` : numberedList;
  console.log(
    `[Chatbot] 📋 Sending buttons as plain text — contactId: ${ctx.contactId}, options: ${buttons.length}`
  );
  await sendChatbotReply(ctx, fullText);
}

/**
 * Channel-aware button sender. Returns the resolved button list for pending state storage.
 */
async function sendChatbotButtons(
  ctx: TriggerContext,
  promptText: string,
  rawButtons: (string | ButtonOption)[]
): Promise<void> {
  const buttons = rawButtons.map(resolveButton);
  const channel = ctx.channel;

  console.log(
    `[Chatbot] 🔘 Buttons node — channel: ${channel}, prompt: "${promptText.substring(0, 60)}", buttons: [${buttons.map(b => b.label).join(", ")}]`
  );

  if (channel === "whatsapp") {
    const provider = await getWhatsAppProvider(ctx.userId);
    if (provider === "meta") {
      const sent = await sendChatbotButtonsMeta(ctx, promptText, buttons);
      if (!sent) {
        await sendChatbotButtonsFallback(ctx, promptText, buttons, "Meta API error, fallback");
      }
    } else {
      // Twilio WhatsApp — interactive buttons require Content API templates (not wired)
      await sendChatbotButtonsFallback(ctx, promptText, buttons, "Twilio WhatsApp — Content API templates required for interactive buttons");
    }
  } else if (channel === "webchat") {
    await sendChatbotButtonsWebchat(ctx, promptText, buttons);
  } else {
    // Instagram, Facebook, Telegram, SMS — no native interactive button support
    const reasons: Record<string, string> = {
      instagram: "Instagram DM does not support interactive buttons",
      facebook: "Facebook Messenger basic API does not support interactive buttons in this stack",
      telegram: "Telegram inline keyboards not wired",
      sms: "SMS does not support interactive buttons",
    };
    await sendChatbotButtonsFallback(ctx, promptText, buttons, reasons[channel] || "unsupported channel");
  }

  // Store pending button state for flow branching
  if (buttons.length > 0) {
    setPendingButtons(ctx.conversationId, "", buttons);
    console.log(
      `[Chatbot] 📌 Pending button state stored — conversationId: ${ctx.conversationId}, options: [${buttons.map(b => `${b.label}→${b.nextNodeId || "none"}`).join(", ")}]`
    );
  }
}

// ─── Action node ───────────────────────────────────────────────────────────

async function executeActionNode(
  ctx: TriggerContext,
  node: ChatbotNode
): Promise<void> {
  if (!node.data.action) return;
  const { type, value } = node.data.action;
  try {
    switch (type) {
      case "set_tag":
        if (value) {
          await storage.updateContact(ctx.contactId, { tag: value });
          console.log(`[Chatbot] Action — set_tag: "${value}" on contactId: ${ctx.contactId}`);
        }
        break;
      case "set_status":
        if (value) {
          await storage.updateConversation(ctx.conversationId, { status: value as any });
          console.log(`[Chatbot] Action — set_status: "${value}" on conversationId: ${ctx.conversationId}`);
        }
        break;
      case "assign":
        if (value) {
          await storage.updateContact(ctx.contactId, { assignedTo: value });
          console.log(`[Chatbot] Action — assign: "${value}" on contactId: ${ctx.contactId}`);
        }
        break;
      case "set_pipeline":
        if (value) {
          await storage.updateContact(ctx.contactId, { pipelineStage: value });
          console.log(`[Chatbot] Action — set_pipeline: "${value}" on contactId: ${ctx.contactId}`);
        }
        break;
      default:
        console.log(`[Chatbot] Unknown action type: "${type}" — skipping`);
    }
  } catch (err: any) {
    console.error(`[Chatbot] Action node error: ${err.message}`);
  }
}

// ─── Flow executor ─────────────────────────────────────────────────────────

async function executeFlow(
  flow: ChatbotFlow,
  ctx: TriggerContext,
  startFromNodeId?: string
): Promise<void> {
  const nodes = (flow.nodes as ChatbotNode[]) || [];
  const edges = (flow.edges as ChatbotEdge[]) || [];

  if (nodes.length === 0) {
    console.log(`[Chatbot] Flow "${flow.name}" has no nodes — skipping`);
    return;
  }

  console.log(
    `[Chatbot] Executing flow "${flow.name}" (id: ${flow.id}) — ${nodes.length} nodes, ${edges.length} edges${startFromNodeId ? ` — starting from node: "${startFromNodeId}"` : ""}`
  );

  const nextNodeMap = new Map<string, string>();
  for (const edge of edges) {
    if (edge.source && edge.target && !nextNodeMap.has(edge.source)) {
      nextNodeMap.set(edge.source, edge.target);
    }
  }

  const nodeMap = new Map<string, ChatbotNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  let currentNode: ChatbotNode | undefined;
  if (startFromNodeId) {
    currentNode = nodeMap.get(startFromNodeId);
    if (!currentNode) {
      console.warn(`[Chatbot] startFromNodeId "${startFromNodeId}" not found in flow — falling back to start node`);
      currentNode = nodeMap.get("start") || nodes[0];
    }
  } else {
    currentNode = nodeMap.get("start") || nodes[0];
  }

  const visited = new Set<string>();
  let cumulativeDelayMs = 0;

  while (currentNode) {
    const nodeId = currentNode.id;

    if (visited.has(nodeId)) {
      console.warn(`[Chatbot] ⚠ Cycle detected at node "${nodeId}" in flow "${flow.name}" — stopping`);
      break;
    }
    visited.add(nodeId);

    console.log(
      `[Chatbot] Processing node id="${nodeId}" type="${currentNode.type}" label="${currentNode.data.label || ""}"`
    );

    switch (currentNode.type) {
      case "message":
      case "question": {
        const msgType = currentNode.data.messageType || "text";
        const content = currentNode.data.content?.trim() || "";
        const mediaUrl = currentNode.data.mediaUrl?.trim() || "";
        const mediaCaption = currentNode.data.mediaCaption?.trim() || "";

        const isMediaNode = msgType === "image" || msgType === "video" || msgType === "file";
        const hasText = content.length > 0;
        const hasMedia = mediaUrl.length > 0;

        if (!hasText && !hasMedia && msgType !== "buttons") {
          console.log(
            `[Chatbot] Node "${nodeId}" (type: ${msgType}) has no content or mediaUrl — skipping send`
          );
          break;
        }

        const delayToUse = Math.min(cumulativeDelayMs, MAX_DELAY_MS);
        cumulativeDelayMs = 0;
        if (delayToUse > 0) {
          console.log(`[Chatbot] Waiting ${delayToUse / 1000}s before sending node "${nodeId}"`);
          await new Promise((resolve) => setTimeout(resolve, delayToUse));
        }

        if (msgType === "template") {
          // Template message — interpolate variables and send as text
          // WhatsApp template API sends are channel-specific; here we interpolate body text as a safe fallback
          const templateId = (currentNode.data as any).templateId as string | undefined;
          const templateVariables = ((currentNode.data as any).templateVariables || {}) as Record<string, string>;
          if (!templateId) {
            console.warn(`[Chatbot] ⚠ Template node "${nodeId}" has no templateId — skipping`);
            break;
          }
          if (ctx.channel !== "whatsapp") {
            console.warn(`[Chatbot] ⚠ Template node "${nodeId}" on channel "${ctx.channel}" — templates only supported on WhatsApp, skipping`);
            break;
          }
          const delayToUseTemplate = Math.min(cumulativeDelayMs, MAX_DELAY_MS);
          cumulativeDelayMs = 0;
          if (delayToUseTemplate > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayToUseTemplate));
          }
          try {
            const tpl = await storage.getMessageTemplate(templateId);
            if (!tpl) {
              console.warn(`[Chatbot] ⚠ Template "${templateId}" not found — skipping`);
              break;
            }
            let body = tpl.bodyText || "";
            for (const [k, v] of Object.entries(templateVariables)) {
              body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
            }
            console.log(`[Chatbot] 📨 Template node "${nodeId}" — sending template "${tpl.name}" (${tpl.language})`);
            await sendChatbotReply(ctx, body);
          } catch (err: any) {
            console.error(`[Chatbot] ❌ Template node "${nodeId}" send error: ${err.message}`);
          }
          break;
        } else if (isMediaNode) {
          console.log(
            `[Chatbot] 📎 Media node "${nodeId}" — messageType: ${msgType}, hasMediaUrl: ${hasMedia}, hasCaption: ${mediaCaption.length > 0}`
          );
          if (!hasMedia) {
            console.warn(`[Chatbot] ⚠ Media node "${nodeId}" has messageType "${msgType}" but no mediaUrl — skipping send`);
          } else {
            await sendChatbotMedia(ctx, mediaUrl, msgType, mediaCaption);
          }
        } else if (msgType === "buttons") {
          const rawButtons = (currentNode.data.buttons as (string | ButtonOption)[] | undefined) || [];
          await sendChatbotButtons(ctx, content, rawButtons);
          // After a buttons node, stop linear execution — resume only when user responds
          // (pending button state will route to nextNodeId on next message)
          console.log(`[Chatbot] ⏸ Pausing flow execution after buttons node — awaiting user reply`);
          return;
        } else {
          if (hasText) {
            await sendChatbotReply(ctx, content);
          } else {
            console.log(`[Chatbot] Node "${nodeId}" text node has no content — skipping send`);
          }
        }
        break;
      }

      case "delay": {
        const minutes = currentNode.data.delayMinutes || 0;
        const rawMs = minutes * 60 * 1000;
        const cappedMs = Math.min(rawMs, MAX_DELAY_MS);
        if (rawMs > MAX_DELAY_MS) {
          console.warn(
            `[Chatbot] Delay node "${nodeId}" requests ${minutes}m but is capped at ${MAX_DELAY_MS / 60_000}m`
          );
        }
        if (cappedMs > 0) {
          console.log(`[Chatbot] Delay node — accumulating ${cappedMs / 1000}s before next message`);
          cumulativeDelayMs += cappedMs;
        }
        break;
      }

      case "action": {
        await executeActionNode(ctx, currentNode);
        break;
      }

      default:
        console.log(`[Chatbot] Unknown node type "${currentNode.type}" — skipping`);
    }

    const nextNodeId = nextNodeMap.get(nodeId);
    currentNode = nextNodeId ? nodeMap.get(nextNodeId) : undefined;
  }

  console.log(`[Chatbot] ✅ Flow "${flow.name}" execution complete`);
  storage.incrementChatbotFlowExecution(flow.id).catch(() => {});
}

// ─── Pending button branch continuation ────────────────────────────────────

/**
 * Check if the incoming message is a button reply and route to the correct next node.
 * Returns true if the message was consumed as a button reply.
 */
async function checkAndResolvePendingButton(ctx: TriggerContext): Promise<boolean> {
  const pending = getPendingButtons(ctx.conversationId);
  if (!pending) return false;

  const matched = matchPendingButton(ctx.message, pending.buttons);
  if (!matched) {
    // Message doesn't match any button — clear pending state and let normal flow handle it
    console.log(
      `[Chatbot] 💬 Pending buttons exist but message "${ctx.message.substring(0, 40)}" doesn't match any option — clearing pending state`
    );
    clearPendingButtons(ctx.conversationId);
    return false;
  }

  clearPendingButtons(ctx.conversationId);

  console.log(
    `[Chatbot] ✅ Button reply matched — label: "${matched.label}", value: "${matched.value}", nextNodeId: ${matched.nextNodeId || "none"} — conversationId: ${ctx.conversationId}`
  );

  if (!matched.nextNodeId) {
    console.log(
      `[Chatbot] 📌 Button "${matched.label}" has no nextNodeId — selection recorded, flow ends here`
    );
    return true; // Consumed: no further flow execution needed
  }

  // Find the flow and execute from nextNodeId
  const flows = await storage.getActiveChatbotFlows(ctx.userId);
  if (flows.length === 0) {
    console.log(`[Chatbot] No active flows found for button branch — skipping`);
    return true;
  }

  // Find the flow that contains the nextNodeId
  let targetFlow: ChatbotFlow | undefined;
  for (const flow of flows) {
    const nodes = (flow.nodes as ChatbotNode[]) || [];
    if (nodes.find(n => n.id === matched.nextNodeId)) {
      targetFlow = flow;
      break;
    }
  }

  if (!targetFlow) {
    console.warn(`[Chatbot] ⚠ nextNodeId "${matched.nextNodeId}" not found in any active flow`);
    return true;
  }

  console.log(
    `[Chatbot] 🔀 Branching to node "${matched.nextNodeId}" in flow "${targetFlow.name}"`
  );

  markFired(ctx.conversationId);
  executeFlow(targetFlow, ctx, matched.nextNodeId).catch((err) =>
    console.error(`[Chatbot] Branch execution error: ${err.message}`, err.stack)
  );

  return true;
}

// ─── Public entry point ────────────────────────────────────────────────────

export async function triggerChatbotFlows(ctx: TriggerContext): Promise<void> {
  try {
    console.log(
      `[Chatbot] Evaluating flows — userId: ${ctx.userId}, channel: ${ctx.channel}, isNewConversation: ${ctx.isNewConversation}, message: "${ctx.message.substring(0, 80)}"`
    );

    // ── Step 1: Check for pending button state first ──────────────────────
    const handledAsButton = await checkAndResolvePendingButton(ctx);
    if (handledAsButton) {
      console.log(`[Chatbot] Message handled as button reply — skipping keyword matching`);
      return;
    }

    // ── Step 2: Per-conversation cooldown ─────────────────────────────────
    if (isCoolingDown(ctx.conversationId)) {
      console.log(
        `[Chatbot] ⏳ Cooldown active for conversationId: ${ctx.conversationId} — skipping`
      );
      return;
    }

    const activeFlows = await storage.getActiveChatbotFlows(ctx.userId);

    if (activeFlows.length === 0) {
      console.log(`[Chatbot] No active flows for userId: ${ctx.userId} — skipping`);
      return;
    }

    console.log(`[Chatbot] Found ${activeFlows.length} active flow(s) for userId: ${ctx.userId}`);

    let flowTriggered = false;

    for (const flow of activeFlows) {
      const keywords = (flow.triggerKeywords as string[]) || [];
      const triggerOnNewChat = flow.triggerOnNewChat ?? false;
      const triggerChannels = (flow.triggerChannels as string[] | null) || [];

      // ── Channel filter ────────────────────────────────────────────────────
      if (triggerChannels.length > 0 && !triggerChannels.includes(ctx.channel)) {
        console.log(
          `[Chatbot] Flow "${flow.name}" — channel "${ctx.channel}" not in triggerChannels [${triggerChannels.join(", ")}] — skipping`
        );
        continue;
      }

      let shouldTrigger = false;
      let triggerReason = "";

      if (keywords.length > 0) {
        const matched = keywordMatches(ctx.message, keywords);
        if (matched) {
          shouldTrigger = true;
          triggerReason = `keyword match — message: "${normalizeText(ctx.message)}", matched against: [${keywords.map(normalizeText).join(", ")}]`;
        } else {
          console.log(
            `[Chatbot] Flow "${flow.name}" — keyword NOT matched. Message: "${normalizeText(ctx.message)}", keywords: [${keywords.map(normalizeText).join(", ")}]`
          );
        }
      }

      if (!shouldTrigger && triggerOnNewChat && ctx.isNewConversation) {
        shouldTrigger = true;
        triggerReason = "new conversation trigger";
      }

      if (!shouldTrigger) {
        console.log(`[Chatbot] Flow "${flow.name}" — no trigger matched, skipping`);
        continue;
      }

      console.log(
        `[Chatbot] ✅ Flow "${flow.name}" (id: ${flow.id}) TRIGGERED — ${triggerReason}`
      );

      markFired(ctx.conversationId);
      flowTriggered = true;

      executeFlow(flow, ctx).catch((err) =>
        console.error(`[Chatbot] Flow execution error for flow "${flow.name}": ${err.message}`, err.stack)
      );

      break;
    }

    if (!flowTriggered) {
      console.log(`[Chatbot] No flows triggered for message: "${ctx.message.substring(0, 80)}"`);
    }
  } catch (err: any) {
    console.error(`[Chatbot] triggerChatbotFlows error: ${err.message}`, err.stack);
  }
}
