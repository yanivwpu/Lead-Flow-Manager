import { storage } from "./storage";
import { type ChatbotFlow } from "@shared/schema";

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
    buttons?: string[];
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
// Prevents the bot from firing more than once every COOLDOWN_MS per conversation.
// Stored in-memory (resets on server restart) which is acceptable — a short
// restart window won't cause user-visible harm.
const COOLDOWN_MS = 30_000; // 30 seconds
const lastFiredAt = new Map<string, number>(); // conversationId → timestamp

function isCoolingDown(conversationId: string): boolean {
  const last = lastFiredAt.get(conversationId);
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS;
}

function markFired(conversationId: string): void {
  lastFiredAt.set(conversationId, Date.now());
  // Periodically prune the map to prevent unbounded growth
  if (lastFiredAt.size > 10_000) {
    const cutoff = Date.now() - COOLDOWN_MS * 2;
    for (const [k, v] of lastFiredAt) {
      if (v < cutoff) lastFiredAt.delete(k);
    }
  }
}

// ─── Max delay cap (5 minutes) ─────────────────────────────────────────────
// Longer delays are more reliably handled by a job queue. For now we cap them
// so the server doesn't hold async chains open for hours.
const MAX_DELAY_MS = 5 * 60 * 1000;

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

function keywordMatches(message: string, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  const msgNorm = normalizeText(message);
  if (!msgNorm) return false; // empty / whitespace-only messages never match
  return keywords.some((kw) => {
    const kwNorm = normalizeText(kw);
    if (!kwNorm) return false; // skip blank keywords
    // Exact word-boundary style: exact full match OR contains for multi-word
    return msgNorm === kwNorm || msgNorm.includes(kwNorm);
  });
}

/**
 * Check whether any active chatbot flow would be triggered by this message,
 * without executing it. Used by callers (e.g. auto-reply) to suppress
 * duplicate responses.
 */
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

async function sendChatbotMedia(
  ctx: TriggerContext,
  mediaUrl: string,
  contentType: string,
  caption: string
): Promise<void> {
  console.log(
    `[Chatbot] 📎 Entering media node — contactId: ${ctx.contactId}, contentType: ${contentType}, mediaUrl: "${mediaUrl.substring(0, 120)}"`
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
      `[Chatbot] 🚀 Attempting outbound media send — contactId: ${ctx.contactId}, channel: ${ctx.channel}, contentType: ${contentType}`
    );
    const result = await channelService.sendMessage({
      userId: ctx.userId,
      contactId: ctx.contactId,
      content: caption || "",
      contentType,
      mediaUrl,
    });
    if (result.success) {
      console.log(
        `[Chatbot] ✅ Media reply sent — contactId: ${ctx.contactId}, channel: ${ctx.channel}, contentType: ${contentType}, externalId: ${result.externalMessageId}`
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
          console.log(
            `[Chatbot] Action — set_tag: "${value}" on contactId: ${ctx.contactId}`
          );
        }
        break;
      case "set_status":
        if (value) {
          await storage.updateConversation(ctx.conversationId, {
            status: value as any,
          });
          console.log(
            `[Chatbot] Action — set_status: "${value}" on conversationId: ${ctx.conversationId}`
          );
        }
        break;
      case "assign":
        if (value) {
          await storage.updateContact(ctx.contactId, { assignedTo: value });
          console.log(
            `[Chatbot] Action — assign: "${value}" on contactId: ${ctx.contactId}`
          );
        }
        break;
      case "set_pipeline":
        if (value) {
          await storage.updateContact(ctx.contactId, { pipelineStage: value });
          console.log(
            `[Chatbot] Action — set_pipeline: "${value}" on contactId: ${ctx.contactId}`
          );
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
  ctx: TriggerContext
): Promise<void> {
  const nodes = (flow.nodes as ChatbotNode[]) || [];
  const edges = (flow.edges as ChatbotEdge[]) || [];

  if (nodes.length === 0) {
    console.log(`[Chatbot] Flow "${flow.name}" has no nodes — skipping`);
    return;
  }

  console.log(
    `[Chatbot] Executing flow "${flow.name}" (id: ${flow.id}) — ${nodes.length} nodes, ${edges.length} edges`
  );

  // Build adjacency map: nodeId → next nodeId (first edge wins for linear flows)
  const nextNodeMap = new Map<string, string>();
  for (const edge of edges) {
    if (edge.source && edge.target && !nextNodeMap.has(edge.source)) {
      nextNodeMap.set(edge.source, edge.target);
    }
  }

  // Build node lookup map
  const nodeMap = new Map<string, ChatbotNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Start from node with id 'start', else the first node in the array
  let currentNode: ChatbotNode | undefined =
    nodeMap.get("start") || nodes[0];

  const visited = new Set<string>();
  let cumulativeDelayMs = 0;

  while (currentNode) {
    const nodeId = currentNode.id;

    // Loop / cycle detection
    if (visited.has(nodeId)) {
      console.warn(
        `[Chatbot] ⚠ Cycle detected at node "${nodeId}" in flow "${flow.name}" — stopping to prevent loop`
      );
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

        // Determine whether this node has anything to send
        const isMediaNode = msgType === "image" || msgType === "video" || msgType === "file";
        const hasText = content.length > 0;
        const hasMedia = mediaUrl.length > 0;

        if (!hasText && !hasMedia) {
          console.log(
            `[Chatbot] Node "${nodeId}" (type: ${msgType}) has no content or mediaUrl — skipping send`
          );
          break;
        }

        // Consume accumulated delay before this send
        const delayToUse = Math.min(cumulativeDelayMs, MAX_DELAY_MS);
        cumulativeDelayMs = 0;
        if (delayToUse > 0) {
          console.log(
            `[Chatbot] Waiting ${delayToUse / 1000}s before sending node "${nodeId}"`
          );
          await new Promise((resolve) => setTimeout(resolve, delayToUse));
        }

        if (isMediaNode) {
          console.log(
            `[Chatbot] 📎 Media node "${nodeId}" — messageType: ${msgType}, hasMediaUrl: ${hasMedia}, hasCaption: ${mediaCaption.length > 0}`
          );
          if (!hasMedia) {
            console.warn(
              `[Chatbot] ⚠ Media node "${nodeId}" has messageType "${msgType}" but no mediaUrl — skipping send`
            );
          } else {
            await sendChatbotMedia(ctx, mediaUrl, msgType, mediaCaption);
          }
        } else {
          // Plain text or buttons
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
            `[Chatbot] Delay node "${nodeId}" requests ${minutes}m but is capped at ${MAX_DELAY_MS / 60_000}m for stability`
          );
        }
        if (cappedMs > 0) {
          console.log(
            `[Chatbot] Delay node — accumulating ${cappedMs / 1000}s before next message`
          );
          cumulativeDelayMs += cappedMs;
        }
        break;
      }

      case "action": {
        await executeActionNode(ctx, currentNode);
        break;
      }

      default:
        console.log(
          `[Chatbot] Unknown node type "${currentNode.type}" — skipping`
        );
    }

    // Advance to next node
    const nextNodeId = nextNodeMap.get(nodeId);
    currentNode = nextNodeId ? nodeMap.get(nextNodeId) : undefined;
  }

  console.log(`[Chatbot] ✅ Flow "${flow.name}" execution complete`);

  // Increment execution count (non-blocking)
  storage.incrementChatbotFlowExecution(flow.id).catch(() => {});
}

// ─── Public entry point ────────────────────────────────────────────────────

export async function triggerChatbotFlows(ctx: TriggerContext): Promise<void> {
  try {
    console.log(
      `[Chatbot] Evaluating flows — userId: ${ctx.userId}, channel: ${ctx.channel}, isNewConversation: ${ctx.isNewConversation}, message: "${ctx.message.substring(0, 80)}"`
    );

    // Per-conversation cooldown: prevent spam replies for rapid messages
    if (isCoolingDown(ctx.conversationId)) {
      console.log(
        `[Chatbot] ⏳ Cooldown active for conversationId: ${ctx.conversationId} — skipping`
      );
      return;
    }

    const activeFlows = await storage.getActiveChatbotFlows(ctx.userId);

    if (activeFlows.length === 0) {
      console.log(
        `[Chatbot] No active flows for userId: ${ctx.userId} — skipping`
      );
      return;
    }

    console.log(
      `[Chatbot] Found ${activeFlows.length} active flow(s) for userId: ${ctx.userId}`
    );

    let flowTriggered = false;

    for (const flow of activeFlows) {
      const keywords = (flow.triggerKeywords as string[]) || [];
      const triggerOnNewChat = flow.triggerOnNewChat ?? false;

      let shouldTrigger = false;
      let triggerReason = "";

      // 1. Keyword trigger — normalize + match
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

      // 2. New conversation trigger
      if (!shouldTrigger && triggerOnNewChat && ctx.isNewConversation) {
        shouldTrigger = true;
        triggerReason = "new conversation trigger";
      }

      if (!shouldTrigger) {
        console.log(
          `[Chatbot] Flow "${flow.name}" — no trigger matched, skipping`
        );
        continue;
      }

      console.log(
        `[Chatbot] ✅ Flow "${flow.name}" (id: ${flow.id}) TRIGGERED — ${triggerReason}`
      );

      // Mark cooldown BEFORE executing so concurrent rapid messages don't sneak through
      markFired(ctx.conversationId);
      flowTriggered = true;

      // Execute asynchronously — webhook returns 200 immediately
      executeFlow(flow, ctx).catch((err) =>
        console.error(
          `[Chatbot] Flow execution error for flow "${flow.name}": ${err.message}`,
          err.stack
        )
      );

      // Only trigger the first matching flow per message
      break;
    }

    if (!flowTriggered) {
      console.log(
        `[Chatbot] No flows triggered for message: "${ctx.message.substring(0, 80)}"`
      );
    }
  } catch (err: any) {
    console.error(
      `[Chatbot] triggerChatbotFlows error: ${err.message}`,
      err.stack
    );
  }
}
