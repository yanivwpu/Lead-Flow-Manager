/**
 * Server-side workspace ownership lookups. Foreign ids always resolve as missing.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  chatbotFlows,
  contacts,
  conversations,
  messageTemplates,
  workflows,
  type ChatbotFlow,
  type Contact,
  type Conversation,
  type MessageTemplate,
  type Workflow,
} from "@shared/schema";
import { ownedOrNull } from "@shared/tenantOwnership";
import { storage } from "./storage";

export async function getContactForWorkspace(
  workspaceUserId: string,
  contactId: string,
): Promise<Contact | null> {
  if (!workspaceUserId || !contactId) return null;
  const row = await storage.getContact(contactId);
  return ownedOrNull(row, workspaceUserId);
}

export async function getConversationForWorkspace(
  workspaceUserId: string,
  conversationId: string,
): Promise<Conversation | null> {
  if (!workspaceUserId || !conversationId) return null;
  const row = await storage.getConversation(conversationId);
  return ownedOrNull(row, workspaceUserId);
}

export async function getWorkflowForWorkspace(
  workspaceUserId: string,
  workflowId: string,
): Promise<Workflow | null> {
  if (!workspaceUserId || !workflowId) return null;
  const rows = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.userId, workspaceUserId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getChatbotFlowForWorkspace(
  workspaceUserId: string,
  flowId: string,
): Promise<ChatbotFlow | null> {
  if (!workspaceUserId || !flowId) return null;
  const rows = await db
    .select()
    .from(chatbotFlows)
    .where(and(eq(chatbotFlows.id, flowId), eq(chatbotFlows.userId, workspaceUserId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getMessageTemplateForWorkspace(
  workspaceUserId: string,
  templateId: string,
): Promise<MessageTemplate | null> {
  if (!workspaceUserId || !templateId) return null;
  const rows = await db
    .select()
    .from(messageTemplates)
    .where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.userId, workspaceUserId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function isAssigneeInWorkspace(
  workspaceUserId: string,
  assigneeUserId: string,
): Promise<boolean> {
  if (!workspaceUserId || !assigneeUserId) return false;
  if (assigneeUserId === workspaceUserId) return true;
  const members = await storage.getTeamMembers(workspaceUserId);
  return members.some(
    (m) => m.memberId === assigneeUserId && (m.status === "active" || m.role === "owner"),
  );
}

export async function assertJobTenantBoundary(params: {
  jobUserId?: string | null;
  contactId: string;
  conversationId?: string | null;
  workflowId?: string | null;
  flowId?: string | null;
  payloadUserId?: string | null;
}): Promise<{ ok: true; userId: string; contact: Contact } | { ok: false; reason: string }> {
  const contact = await storage.getContact(params.contactId);
  if (!contact) return { ok: false, reason: "contact_missing" };
  const owner = contact.userId;
  const ids = [params.jobUserId, params.payloadUserId, owner].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (ids.some((id) => id !== owner)) {
    return { ok: false, reason: "tenant_mismatch" };
  }
  if (params.conversationId) {
    const conv = await storage.getConversation(params.conversationId);
    if (!conv || conv.userId !== owner || conv.contactId !== contact.id) {
      return { ok: false, reason: "tenant_mismatch" };
    }
  }
  if (params.workflowId) {
    const wf = await getWorkflowForWorkspace(owner, params.workflowId);
    if (!wf) return { ok: false, reason: "tenant_mismatch" };
  }
  if (params.flowId) {
    const flow = await getChatbotFlowForWorkspace(owner, params.flowId);
    if (!flow) return { ok: false, reason: "tenant_mismatch" };
  }
  return { ok: true, userId: owner, contact };
}
