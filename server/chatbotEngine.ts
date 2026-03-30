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

interface TriggerContext {
  userId: string;
  contactId: string;
  conversationId: string;
  channel: string;
  message: string;
  isNewConversation: boolean;
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

function keywordMatches(message: string, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  const msgNorm = normalizeText(message);
  return keywords.some((kw) => {
    const kwNorm = normalizeText(kw);
    if (!kwNorm) return false;
    // Exact match first, then contains match for multi-word keywords
    return msgNorm === kwNorm || msgNorm.includes(kwNorm);
  });
}

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
      `[Chatbot] ✅ Reply sent — contactId: ${ctx.contactId}, channel: ${ctx.channel}, preview: "${content.substring(0, 80)}"`
    );
  } catch (err: any) {
    console.error(
      `[Chatbot] ❌ Failed to send reply to contactId: ${ctx.contactId} — error: ${err.message}`
    );
  }
}

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
          await storage.updateConversation(ctx.conversationId, { status: value as any });
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
        console.log(`[Chatbot] Unknown action type: ${type}`);
    }
  } catch (err: any) {
    console.error(`[Chatbot] Action node error: ${err.message}`);
  }
}

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

  // Build adjacency map: nodeId → next nodeId via edges
  const nextNodeMap = new Map<string, string>();
  for (const edge of edges) {
    if (edge.source && edge.target) {
      nextNodeMap.set(edge.source, edge.target);
    }
  }

  // Build node lookup map
  const nodeMap = new Map<string, ChatbotNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Start execution from the first node (id 'start' takes priority, else first in array)
  let currentNode: ChatbotNode | undefined =
    nodeMap.get("start") || nodes[0];

  const visited = new Set<string>();
  let cumulativeDelayMs = 0;

  while (currentNode) {
    const nodeId = currentNode.id;

    if (visited.has(nodeId)) {
      console.warn(
        `[Chatbot] Cycle detected at node "${nodeId}" in flow "${flow.name}" — stopping`
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
        const content = currentNode.data.content?.trim();
        if (content) {
          const delayToUse = cumulativeDelayMs;
          cumulativeDelayMs = 0; // reset after consuming
          if (delayToUse > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayToUse));
          }
          await sendChatbotReply(ctx, content);
        } else {
          console.log(
            `[Chatbot] Node "${nodeId}" has no content — skipping send`
          );
        }
        break;
      }
      case "delay": {
        const minutes = currentNode.data.delayMinutes || 0;
        const delayMs = minutes * 60 * 1000;
        if (delayMs > 0) {
          console.log(
            `[Chatbot] Delay node — waiting ${minutes} minute(s) before next step`
          );
          cumulativeDelayMs += delayMs;
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

    // Follow the edge to the next node
    const nextNodeId = nextNodeMap.get(nodeId);
    currentNode = nextNodeId ? nodeMap.get(nextNodeId) : undefined;
  }

  console.log(`[Chatbot] Flow "${flow.name}" execution complete`);

  // Increment execution count asynchronously (non-blocking)
  storage.incrementChatbotFlowExecution(flow.id).catch(() => {});
}

export async function triggerChatbotFlows(ctx: TriggerContext): Promise<void> {
  try {
    console.log(
      `[Chatbot] Evaluating flows — userId: ${ctx.userId}, channel: ${ctx.channel}, isNewConversation: ${ctx.isNewConversation}, message: "${ctx.message.substring(0, 80)}"`
    );

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

      // Keyword trigger — normalize and match
      if (keywords.length > 0) {
        const matched = keywordMatches(ctx.message, keywords);
        if (matched) {
          shouldTrigger = true;
          triggerReason = `keyword match (keywords: [${keywords.join(", ")}])`;
        } else {
          console.log(
            `[Chatbot] Flow "${flow.name}" — keyword NOT matched. Message: "${normalizeText(ctx.message)}", keywords: [${keywords.map(normalizeText).join(", ")}]`
          );
        }
      }

      // New chat trigger
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
        `[Chatbot] ✅ Flow "${flow.name}" (id: ${flow.id}) TRIGGERED — reason: ${triggerReason}`
      );
      flowTriggered = true;

      // Execute asynchronously so webhook can return 200 quickly
      executeFlow(flow, ctx).catch((err) =>
        console.error(
          `[Chatbot] Flow execution error for flow "${flow.name}": ${err.message}`
        )
      );

      // Only trigger the first matching flow to avoid spam
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
