export interface InboxTeammate {
  id: string;
  memberId: string | null;
  name: string | null;
  email: string;
  role: string;
  status: string;
  avatarUrl?: string | null;
}
export interface ReplySender { id: string; name: string; avatarUrl: string | null }
export function canAssignConversation(actorId: string | undefined, members: InboxTeammate[], current: string | null | undefined, next: string | null): boolean {
  const actor = members.find(m => m.memberId === actorId && m.status === "active");
  if (!actor) return false;
  if (next && !members.some(m => m.memberId === next && m.status === "active" && ["owner", "admin", "member"].includes(m.role))) return false;
  if (["owner", "admin"].includes(actor.role)) return true;
  return actor.role === "member" && (!current || current === actorId) && (!next || next === actorId);
}
export function belongsInInboxTab(tab: "all" | "unread" | "mine", row: { unreadCount: number; contact: { assignedTo?: string | null } }, actorId?: string): boolean {
  if (tab === "mine") return !!actorId && row.contact.assignedTo === actorId;
  return tab !== "unread" || row.unreadCount > 0;
}
export function inboxEmptyKind(input: { tab: string; searching: boolean; channelFiltered: boolean; rawCount: number; hasAnyChannel?: boolean }): "mine" | "unread" | "filtered" | "noChannels" | "empty" {
  if (input.searching || input.channelFiltered) return "filtered";
  if (input.tab === "mine") return "mine";
  if (input.tab === "unread") return "unread";
  return input.rawCount === 0 && input.hasAnyChannel === false ? "noChannels" : "empty";
}
export function replyIdentity(message: { generatedBy?: string | null; sentByUserId?: string | null; sender?: ReplySender | null }) {
  if (message.generatedBy === "ai_brain") return { kind: "ai" as const, sender: null };
  if (["chatbot", "workflow", "auto_reply", "campaign", "approved_asset"].includes(message.generatedBy || "")) return { kind: "automation" as const, sender: null };
  if (message.sentByUserId && message.sender?.id === message.sentByUserId) return { kind: "human" as const, sender: message.sender };
  return { kind: "unknown" as const, sender: null };
}
