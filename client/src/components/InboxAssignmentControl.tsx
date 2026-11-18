import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, UserRound } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChatAvatar } from "@/components/ChatAvatar";
import { canAssignConversation, type InboxTeammate } from "@shared/inboxTeam";

export function AssigneeAvatar({ assignedTo, members }: { assignedTo?: string | null; members: InboxTeammate[] }) {
  const { t } = useTranslation();
  const member = members.find(m => m.memberId === assignedTo);
  const name = member?.name || member?.email.split("@")[0] || t(assignedTo ? "inboxTeam.teammate" : "inboxTeam.unassigned");
  return <span className="shrink-0 inline-flex" title={`${t("inboxTeam.assignedTo")}: ${name}`} aria-label={`${t("inboxTeam.assignedTo")}: ${name}`}>
    {assignedTo ? <ChatAvatar src={member?.avatarUrl} name={name} size="sm" className="h-6 w-6 text-[10px] ring-2 ring-white" /> :
      <span className="h-6 w-6 rounded-full border border-dashed border-slate-400 flex items-center justify-center bg-slate-50"><UserRound className="h-3.5 w-3.5 text-slate-500" aria-hidden /></span>}
  </span>;
}
export function InboxAssignmentControl({ assignedTo, members, actorId, onAssign, pending = false, compact = false, open: controlledOpen, onOpenChange }: {
  assignedTo?: string | null; members: InboxTeammate[]; actorId?: string; onAssign: (id: string | null) => void; pending?: boolean; compact?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange || setLocalOpen;
  const member = members.find(m => m.memberId === assignedTo);
  const name = member?.name || member?.email.split("@")[0] || t(assignedTo ? "inboxTeam.teammate" : "inboxTeam.unassigned");
  const canEdit = canAssignConversation(actorId, members, assignedTo, null) || canAssignConversation(actorId, members, assignedTo, actorId || null);
  const options = members.filter(m => m.status === "active" && m.memberId && canAssignConversation(actorId, members, assignedTo, m.memberId));
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" disabled={pending || !canEdit}
      className={`${compact ? "flex-col gap-0.5 px-1" : "gap-2 px-2"} inline-flex min-w-0 max-w-full items-center rounded-lg border py-1.5 text-start disabled:cursor-default ${assignedTo ? "border-emerald-200 bg-emerald-50/60" : "border-dashed border-slate-300 bg-white"}`}
      data-testid={compact ? "button-ai-assign" : "inbox-assigned-to"} aria-label={`${t("inboxTeam.assignedTo")}: ${name}`}>
      <AssigneeAvatar assignedTo={assignedTo} members={members} />
      <span className="min-w-0"><span className={compact ? "sr-only" : "block text-[10px] leading-tight text-slate-500"}>{t("inboxTeam.assignedTo")}</span><span className={`${compact ? "max-w-[3.25rem] text-[10px]" : "max-w-[9rem] text-xs"} block truncate font-medium text-slate-800`}>{name}</span></span>
      {canEdit && !compact && <ChevronDown className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />}
    </button></PopoverTrigger>
    <PopoverContent className="w-56 p-1.5" align="start">
      <p className="px-2 py-1 text-xs font-semibold">{t("inboxTeam.assignedTo")}</p>
      {canAssignConversation(actorId, members, assignedTo, null) && <button type="button" className="flex w-full items-center gap-2 rounded p-2 text-start text-sm hover:bg-slate-50" data-testid="assign-option-unassigned" onClick={() => { onAssign(null); setOpen(false); }}><AssigneeAvatar members={members} />{t("inboxTeam.unassigned")}</button>}
      {options.map(m => <button type="button" key={m.id} data-testid={`assign-option-${m.memberId}`} className="flex w-full items-center gap-2 rounded p-2 text-start text-sm hover:bg-emerald-50" onClick={() => { onAssign(m.memberId); setOpen(false); }}><AssigneeAvatar assignedTo={m.memberId} members={members} /><span className="truncate">{m.name || m.email.split("@")[0]}</span></button>)}
    </PopoverContent>
  </Popover>;
}
