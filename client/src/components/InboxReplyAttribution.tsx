import { useTranslation } from "react-i18next";
import { Bot, Workflow, UserRound } from "lucide-react";
import { ChatAvatar } from "@/components/ChatAvatar";
import { replyIdentity, type ReplySender } from "@shared/inboxTeam";
export function InboxReplyAttribution({ message }: { message: { sentByUserId?: string | null; generatedBy?: string | null; sender?: ReplySender | null; createdAt: string; sentAt?: string | null } }) {
  const { t, i18n } = useTranslation();
  const identity = replyIdentity(message);
  const name = identity.sender?.name || t(`inboxTeam.${identity.kind === "unknown" ? "sent" : identity.kind}`);
  const date = new Date(message.sentAt || message.createdAt);
  const validDate = Number.isFinite(date.getTime());
  return <div className="mb-1 flex min-w-0 max-w-full items-center gap-1.5 text-xs text-inherit opacity-90" data-testid="reply-attribution" data-reply-kind={identity.kind}>
    {identity.sender ? <ChatAvatar src={identity.sender.avatarUrl} name={name} size="sm" className="h-6 w-6 bg-white text-[10px]" /> :
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${identity.kind === "ai" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>{identity.kind === "ai" ? <Bot className="h-3.5 w-3.5" /> : identity.kind === "automation" ? <Workflow className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}</span>}
    <span className="max-w-[10rem] truncate font-medium" data-testid={identity.kind === "ai" ? "text-ai-generated-message" : undefined}>{name}</span>
    {validDate && <time className="shrink-0 tabular-nums" dateTime={date.toISOString()} title={new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(date)}>{new Intl.DateTimeFormat(i18n.language, { hour: "numeric", minute: "2-digit" }).format(date)}</time>}
  </div>;
}
