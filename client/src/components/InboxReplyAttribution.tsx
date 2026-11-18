import { useTranslation } from "react-i18next";
import { Bot, Workflow, UserRound } from "lucide-react";
import { ChatAvatar } from "@/components/ChatAvatar";
import { replyIdentity, type ReplySender } from "@shared/inboxTeam";

export type InboxAttributionMessage = {
  sentByUserId?: string | null;
  generatedBy?: string | null;
  sender?: ReplySender | null;
  createdAt: string;
  sentAt?: string | null;
};

/** Deterministic, muted fallback colors: each agent retains the same color across messages. */
const TEAM_AVATAR_COLORS = [
  "bg-sky-100 text-sky-800",
  "bg-amber-100 text-amber-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
  "bg-rose-100 text-rose-800",
  "bg-indigo-100 text-indigo-800",
] as const;

export function teammateAvatarColor(identity: string): string {
  let hash = 0;
  for (const char of identity) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return TEAM_AVATAR_COLORS[(hash >>> 0) % TEAM_AVATAR_COLORS.length];
}

/** A visible teammate avatar beside the bubble, rather than a tiny icon inside it. */
export function InboxReplyAvatar({ message }: { message: InboxAttributionMessage }) {
  const { t } = useTranslation();
  const identity = replyIdentity(message);
  const name = identity.sender?.name || t(`inboxTeam.${identity.kind === "unknown" ? "sent" : identity.kind}`);
  return <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center" title={name} aria-label={name} data-testid="reply-sender-avatar">
    {identity.sender ? <ChatAvatar src={identity.sender.avatarUrl} name={name} size="sm" className="h-8 w-8 ring-1 ring-slate-200" fallbackClassName={teammateAvatarColor(message.sentByUserId || name)} /> :
      <span className={`flex h-8 w-8 items-center justify-center rounded-full ${identity.kind === "ai" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>
        {identity.kind === "ai" ? <Bot className="h-4 w-4" /> : identity.kind === "automation" ? <Workflow className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
      </span>}
  </span>;
}

/** Sender and timestamp beneath the bubble; does not alter customer-facing message content. */
export function InboxReplyAttribution({ message }: { message: InboxAttributionMessage }) {
  const { t, i18n } = useTranslation();
  const identity = replyIdentity(message);
  const name = identity.sender?.name || t(`inboxTeam.${identity.kind === "unknown" ? "sent" : identity.kind}`);
  const date = new Date(message.sentAt || message.createdAt);
  const validDate = Number.isFinite(date.getTime());
  return <div className="mt-1 flex min-w-0 max-w-full items-center justify-end gap-1.5 text-[11px] leading-tight text-slate-500" data-testid="reply-attribution" data-reply-kind={identity.kind}>
    <span className="max-w-[11rem] truncate font-medium" data-testid={identity.kind === "ai" ? "text-ai-generated-message" : undefined}>{name}</span>
    {validDate && <time className="shrink-0 tabular-nums" dateTime={date.toISOString()} title={new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(date)}>{new Intl.DateTimeFormat(i18n.language, { hour: "numeric", minute: "2-digit" }).format(date)}</time>}
  </div>;
}
