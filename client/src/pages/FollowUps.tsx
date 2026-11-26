import { useTranslation } from "react-i18next";
import { formatRegionalDate } from "@/lib/regionalFormatting";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowRight, CheckCircle2, Calendar as CalendarIcon, List, Sparkles, ChevronLeft, ChevronRight, Kanban, AlertCircle, Clock, CalendarCheck, MessageSquare, CheckCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday, isBefore, startOfWeek, endOfWeek } from "date-fns";
import { ShopifyOrderSupportTasks } from "@/components/followups/ShopifyOrderSupportTasks";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  applyKPIFilter, buildFollowUpItems, getTaskStatus, hasNeedsReply, hasTask,
  hasScheduledFollowUp, isClosedStage, isSalesOpportunity, prioritizeTasks, validTaskDate, filterPipelineItems, type PipelineFilters,
  type FollowUpItem as Chat, type FollowUpInboxItem as InboxItem, type KPIFilter,
} from "@shared/followUpTasks";

interface AppointmentRecord {
  id: string;
  contactId: string;
  contactName: string;
  appointmentType: string;
  appointmentDate: string;
  title: string;
  status: string;
}

type ViewMode = 'list' | 'calendar' | 'pipeline';

const PIPELINE_STAGES = ['Lead', 'Contacted', 'Proposal', 'Negotiation', 'Closed'] as const;
const boardStage = (stage: string) => isClosedStage(stage) ? 'Closed' : stage.trim() ? stage : 'Lead';
const EMPTY_PIPELINE_FILTERS: PipelineFilters = { search: '', channel: '', tag: '', assignment: 'all' };

function KPIHeader({ chats, activeFilter, onFilterChange }: { 
  chats: Chat[]; 
  activeFilter: KPIFilter;
  onFilterChange: (filter: KPIFilter) => void;
}) {
  // Counters and filters use the same predicates as every view.
  const overdueCount = applyKPIFilter(chats, 'overdue').length;
  const todayCount = applyKPIFilter(chats, 'today').length;
  const bookingRequestedCount = applyKPIFilter(chats, 'booking-requested').length;
  const bookedCount = applyKPIFilter(chats, 'booked').length;
  const needsReplyCount = applyKPIFilter(chats, 'needs-reply').length;
  const activeDealsCount = applyKPIFilter(chats, 'active-deals').length;

  const kpis: { label: string; filterKey: KPIFilter; value: number; icon: any; color: string; bg: string; border: string; activeBorder: string }[] = [
    { label: 'Active Deals', filterKey: 'active-deals', value: activeDealsCount, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100', activeBorder: 'border-indigo-500 ring-2 ring-indigo-200' },
    { label: 'Overdue', filterKey: 'overdue', value: overdueCount, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', activeBorder: 'border-red-500 ring-2 ring-red-200' },
    { label: 'Due Today', filterKey: 'today', value: todayCount, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', activeBorder: 'border-amber-500 ring-2 ring-amber-200' },
    { label: 'Needs Reply', filterKey: 'needs-reply', value: needsReplyCount, icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', activeBorder: 'border-blue-500 ring-2 ring-blue-200' },
    { label: 'High Intent', filterKey: 'booking-requested', value: bookingRequestedCount, icon: CalendarCheck, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', activeBorder: 'border-purple-500 ring-2 ring-purple-200' },
    { label: 'Closed', filterKey: 'booked', value: bookedCount, icon: CheckCheck, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100', activeBorder: 'border-green-500 ring-2 ring-green-200' },
  ];

  const handleClick = (filterKey: KPIFilter) => {
    onFilterChange(activeFilter === filterKey ? null : filterKey);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 mb-5" data-testid="kpi-header">
      {kpis.map(kpi => (
        <button 
          key={kpi.label}
          onClick={() => handleClick(kpi.filterKey)}
          className={cn(
            "min-w-0 rounded-xl border bg-white p-3 text-start shadow-sm transition-colors hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
            activeFilter === kpi.filterKey ? "border-emerald-500 ring-1 ring-emerald-500" : "border-slate-200"
          )}
          aria-pressed={activeFilter === kpi.filterKey}
          data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", kpi.bg, kpi.color)}><kpi.icon className="h-4 w-4" /></span>
            <span className="text-xs font-medium text-slate-600">{kpi.label}</span>
          </div>
          <p className={cn("text-2xl font-semibold tabular-nums", kpi.color)}>{kpi.value}</p>
        </button>
      ))}
    </div>
  );
}

function StatusTag({ status }: { status: 'overdue' | 'today' | 'upcoming' | null }) {
  if (!status) return null;
  
  const styles = {
    overdue: 'bg-red-100 text-red-700 border-red-200',
    today: 'bg-amber-100 text-amber-700 border-amber-200',
    upcoming: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  
  const labels = {
    overdue: 'Overdue',
    today: 'Today',
    upcoming: 'Upcoming',
  };
  
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium border", styles[status])} data-testid={`status-tag-${status}`}>
      {labels[status]}
    </span>
  );
}

function TaskListItem({ 
  chat, 
  onMarkDone, 
  isPending, 
  pendingId,
  onClick,
  onSetReminder,
}: { 
  chat: Chat; 
  onMarkDone: (e: React.MouseEvent, chatId: string) => void;
  isPending: boolean;
  pendingId: string | undefined;
  onClick: (chatId: string) => void;
  onSetReminder?: (chat: Chat) => void;
}) {
  const status = chat.followUpDate ? getTaskStatus(chat.followUpDate) : null;
  const needsReply = hasNeedsReply(chat);
  
  return (
    <div 
      className="group bg-white border border-slate-200 rounded-xl p-3.5 md:p-4 flex items-center shadow-sm hover:shadow-md transition-shadow hover:border-brand-green/40 cursor-pointer"
      onClick={() => onClick(chat.id)}
      data-testid={`task-item-${chat.id}`}
    >
      {hasTask(chat) && !chat.isAppointment && !chat.reviewRecommended && <button
        className="h-6 w-6 rounded-full border-2 border-gray-300 hover:border-brand-green hover:bg-brand-green hover:text-white me-3 shrink-0 transition-colors flex items-center justify-center"
        onClick={(e) => onMarkDone(e, chat.id)}
        disabled={isPending}
        data-testid={`button-mark-done-${chat.id}`}
        title="Mark as done"
      >
        {isPending && pendingId === chat.id ? (
          <div className="h-3 w-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4 opacity-0 group-hover:opacity-100" />
        )}
      </button>}
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-semibold text-gray-900" data-testid={`text-contact-${chat.id}`}>
            {chat.name}
          </span>
          {status && <StatusTag status={status} />}
          {needsReply && (
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium" data-testid={`tag-unreplied-${chat.id}`}>
              Needs Reply
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 mb-1">
          {chat.reviewRecommended || (hasTask(chat) ? `Follow up: ${chat.followUp}` : needsReply ? 'Reply to customer inquiry' : `Sales opportunity · ${chat.pipelineStage}`)}
          {chat.followUpDate && (
            <span className="text-slate-500 ms-2">
              ({format(new Date(chat.followUpDate), 'MMM d, yyyy')})
            </span>
          )}
        </p>
        <p className="text-sm text-gray-500 truncate" data-testid={`text-lastmessage-${chat.id}`}>
          Last message: {chat.lastMessage}
        </p>
        {chat.notes && (
          <p className="text-xs text-gray-400 truncate mt-1">
            Note: {chat.notes}
          </p>
        )}
      </div>

      {chat.reviewRecommended && onSetReminder ? <Button size="sm" variant="outline" className="ms-3 shrink-0"
        onClick={(event) => { event.stopPropagation(); onSetReminder(chat); }}>Set Reminder</Button>
        : <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-brand-green transition-colors ms-3 shrink-0 rtl:rotate-180" data-testid={`icon-arrow-${chat.id}`} />}
    </div>
  );
}

function PipelineCard({ 
  chat, 
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
  stage, stages, onStageChange, onSetReminder, isMobile, stagePending
}: { 
  chat: Chat; 
  onClick: (chatId: string) => void;
  onDragStart: (e: React.DragEvent, chat: Chat) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  stage: string; stages: string[];
  onStageChange: (chatId: string, stage: string) => void;
  onSetReminder: (chat: Chat) => void;
  isMobile: boolean; stagePending: boolean;
}) {
  const { t } = useTranslation();
  const status = getTaskStatus(chat.followUpDate);
  const needsReply = hasNeedsReply(chat);

  return (
    <div
      draggable={!isMobile && !stagePending}
      onDragStart={(e) => onDragStart(e, chat)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(chat.id)}
      className={cn(
        "bg-white border border-slate-200 rounded-xl p-3 cursor-pointer shadow-sm hover:shadow-md transition-shadow hover:border-brand-green/40",
        isDragging && "opacity-50"
      )}
      data-testid={`pipeline-card-${chat.id}`}
    >
      <div className="flex min-w-0 items-center gap-2 mb-2">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{chat.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "?"}</span>
        <div className="min-w-0 flex-1 font-semibold text-slate-900 text-sm truncate" data-testid={`pipeline-contact-${chat.id}`}>{chat.name}</div>
        {!isMobile && <span aria-hidden="true" className="hidden md:block text-slate-400 cursor-grab text-base leading-none">⠿</span>}
      </div>
      <p className="text-xs text-slate-600 line-clamp-2 break-words mb-3" data-testid={`pipeline-lastmessage-${chat.id}`}>
        {chat.lastMessage}
      </p>
      <div className="flex flex-wrap gap-1">
        {needsReply && (
          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            Needs Reply
          </span>
        )}
        {status === 'overdue' && (
          <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">
            Overdue
          </span>
        )}
        {status === 'today' && (
          <span className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full font-medium">
            Today
          </span>
        )}
        {chat.followUpDate && status === 'upcoming' && (
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {format(new Date(chat.followUpDate), 'MMM d')}
          </span>
        )}
      </div>
      {(chat.channel || chat.tag) && <div className="mt-2 flex flex-wrap gap-1 text-xs text-slate-600">{[chat.channel, chat.tag].filter(Boolean).map((value, index) => <span key={index} className="rounded bg-slate-100 px-1.5 py-0.5">{value}</span>)}</div>}
      <div className="mt-3 space-y-2 border-t border-slate-100 pt-2" onClick={event => event.stopPropagation()}>
        <select className="w-full min-w-0 rounded-md border border-slate-200 bg-white p-1.5 text-xs text-slate-700" aria-label={t("followups.moveDeal")} data-testid={`pipeline-move-${chat.id}`} value={stage} disabled={stagePending} onChange={event => onStageChange(chat.id, event.target.value)}>
          {stages.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <div className="flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-auto flex-1 px-1.5 py-1 text-xs" onClick={() => onClick(chat.id)} data-testid={`pipeline-open-${chat.id}`}><MessageSquare className="h-3.5 w-3.5 shrink-0" />{t("followups.openConversation")}</Button>
          <Button type="button" size="sm" variant="ghost" className="h-auto flex-1 px-1.5 py-1 text-xs" onClick={() => onSetReminder(chat)} data-testid={`pipeline-reminder-${chat.id}`}><CalendarIcon className="h-3.5 w-3.5 shrink-0" />{t("followups.reminder")}</Button>
        </div>
      </div>
    </div>
  );
}

function PipelineView({ 
  chats, 
  onCardClick,
  onStageChange,
  isMobile, actorId, stagePending, onSetReminder
}: { 
  chats: Chat[]; 
  onCardClick: (chatId: string) => void;
  onStageChange: (chatId: string, newStage: string) => void;
  isMobile: boolean; actorId?: string; stagePending: boolean;
  onSetReminder: (chat: Chat) => void;
}) {
  const { t } = useTranslation();
  const [draggedChat, setDraggedChat] = useState<Chat | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const [filters, setFilters] = useState<PipelineFilters>(EMPTY_PIPELINE_FILTERS);
  const visibleChats = useMemo(() => filterPipelineItems(chats, filters, actorId), [chats, filters, actorId]);
  const channels = useMemo(() => [...new Set(chats.map(chat => chat.channel).filter((value): value is string => Boolean(value)))].sort(), [chats]);
  const tags = useMemo(() => [...new Set(chats.map(chat => chat.tag).filter(Boolean))].sort(), [chats]);
  const stages = useMemo(() => [...new Set<string>([...PIPELINE_STAGES, ...chats.map(chat => boardStage(chat.pipelineStage))])], [chats]);
  const chatsByStage = useMemo(() => {
    const map = new Map<string, Chat[]>(stages.map(stage => [stage, []]));
    visibleChats.forEach(chat => map.get(boardStage(chat.pipelineStage))?.push(chat));
    return map;
  }, [visibleChats, stages]);

  const handleDragStart = (e: React.DragEvent, chat: Chat) => {
    if (isMobile || stagePending) { e.preventDefault(); return; }
    setDraggedChat(chat);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-whachat-pipeline', 'move');
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    if (isMobile || stagePending || !draggedChat) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropStage(stage);
  };

  const handleDrop = (e: React.DragEvent, stage: string) => {
    if (isMobile || stagePending || !draggedChat) return;
    e.preventDefault();
    if (boardStage(draggedChat.pipelineStage) !== stage) onStageChange(draggedChat.id, stage);
    setDraggedChat(null);
    setDropStage(null);
  };

  const handleDragEnd = () => {
    setDraggedChat(null);
    setDropStage(null);
  };

  const stageColors: Record<string, string> = {
    'Lead': 'bg-slate-400',
    'Contacted': 'bg-blue-500',
    'Proposal': 'bg-violet-500',
    'Negotiation': 'bg-amber-500',
    'Closed': 'bg-emerald-600',
  };

  const emptyStateMessages: Record<string, string> = {
    'Lead': 'No new leads yet',
    'Contacted': 'No leads contacted yet',
    'Proposal': 'No proposals sent yet',
    'Negotiation': 'No deals in negotiation',
    'Closed': 'No closed opportunities',
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="pipeline-filters">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
          <input className="xl:col-span-2 min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm" aria-label={t("followups.searchPipeline")} placeholder={t("followups.searchPipeline")} value={filters.search} onChange={event => setFilters(prev => ({...prev, search: event.target.value}))} data-testid="pipeline-search" />
          <select className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm" aria-label={t("followups.allChannels")} value={filters.channel} onChange={event => setFilters(prev => ({...prev, channel: event.target.value}))} data-testid="pipeline-filter-channel">
            <option value="">{t("followups.allChannels")}</option>{channels.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm" aria-label={t("followups.allTags")} value={filters.tag} onChange={event => setFilters(prev => ({...prev, tag: event.target.value}))} data-testid="pipeline-filter-tag">
            <option value="">{t("followups.allTags")}</option>{tags.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm" aria-label={t("followups.allAssignees")} value={filters.assignment} onChange={event => setFilters(prev => ({...prev, assignment: event.target.value as PipelineFilters["assignment"]}))} data-testid="pipeline-filter-assignment">
            <option value="all">{t("followups.allAssignees")}</option><option value="mine">{t("followups.assignedToMe")}</option><option value="unassigned">{t("followups.unassigned")}</option><option value="others">{t("followups.assignedToOthers")}</option>
          </select>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600"><span aria-live="polite">{t("followups.pipelineResults", { shown: visibleChats.length, total: chats.length })}</span><Button type="button" variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={() => setFilters(EMPTY_PIPELINE_FILTERS)}>{t("followups.resetPipelineFilters")}</Button></div>
      </div>
      {visibleChats.length === 0 && chats.length > 0 && <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">{t("followups.noMatchingDeals")}</p>}
      <div className="grid grid-flow-col items-stretch gap-3 w-full min-w-0 overflow-x-auto pb-3" style={{ gridAutoColumns: isMobile ? "minmax(240px, 1fr)" : "minmax(170px, 1fr)" }} data-testid="pipeline-view">
      {[...chatsByStage.keys()].map(stage => {
        const stageChats = chatsByStage.get(stage) || [];
        const colors = stageColors[stage] || stageColors['Lead'];
        
        return (
          <div
            key={stage}
            className={cn(
              "min-w-0 min-h-[360px] rounded-xl border border-slate-200 bg-slate-100/80 flex flex-col",
              draggedChat && dropStage === stage && boardStage(draggedChat.pipelineStage) !== stage && "ring-2 ring-inset ring-emerald-500 bg-emerald-50"
            )}
            onDragOver={(e) => handleDragOver(e, stage)}
            onDragLeave={(e) => { if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setDropStage(prev => prev === stage ? null : prev); }}
            onDrop={(e) => handleDrop(e, stage)}
            data-testid={`pipeline-column-${stage.toLowerCase()}`}
          >
            <div className="p-3 border-b border-slate-200">
              <div className={cn("h-1 rounded-full mb-3", colors)} />
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 break-words font-semibold text-slate-900 text-sm">{stage}</h3>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 tabular-nums" aria-label={t("followups.opportunitiesCount", { total: stageChats.length })}>{stageChats.length}</span>
              </div>
            </div>
            <div className="flex-1 p-2 space-y-2 max-h-[500px] overflow-y-auto">
              {stageChats.map(chat => (
                <PipelineCard
                  key={chat.id}
                  chat={chat}
                  onClick={onCardClick}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  isDragging={draggedChat?.id === chat.id}
                  stage={stage} stages={stages} isMobile={isMobile} stagePending={stagePending}
                  onStageChange={onStageChange} onSetReminder={onSetReminder}
                />
              ))}
              {stageChats.length === 0 && (
                <div className="text-center p-4 mt-1 rounded-lg border border-dashed border-slate-300 text-slate-500 text-xs leading-relaxed">
                  {emptyStateMessages[stage] || t("followups.emptyPipelineStage")}
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function TaskCalendarView({ 
  tasks, 
  onTaskClick,
  onReschedule,
  isMobile
}: { 
  tasks: Chat[]; 
  onTaskClick: (chatId: string) => void;
  onReschedule: (chatId: string, newDate: Date) => void;
  isMobile: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [draggedTask, setDraggedTask] = useState<Chat | null>(null);
  
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Chat[]>();
    tasks.forEach(task => {
      if (task.followUpDate) {
        const dateKey = format(new Date(task.followUpDate), 'yyyy-MM-dd');
        if (!map.has(dateKey)) {
          map.set(dateKey, []);
        }
        map.get(dateKey)!.push(task);
      }
    });
    return map;
  }, [tasks]);
  
  const handleDragStart = (e: React.DragEvent, task: Chat) => {
    if (isMobile || task.isAppointment) return;
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    if (isMobile) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  
  const handleDrop = (e: React.DragEvent, date: Date) => {
    if (isMobile) return;
    e.preventDefault();
    if (draggedTask) {
      onReschedule(draggedTask.id, date);
      setDraggedTask(null);
    }
  };
  
  const handleDragEnd = () => {
    setDraggedTask(null);
  };

  const dayNames = days.slice(0, 7).map((day) =>
    formatRegionalDate(day, i18n.language, { weekday: isMobile ? "narrow" : "short" }),
  );

  const maxTasksToShow = isMobile ? 2 : 3;
  
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" data-testid="calendar-view">
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-slate-200">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-2 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label={t("calendar.previousMonth")}
          data-testid="button-prev-month"
        >
          <ChevronLeft className="h-4 w-4 md:h-5 md:w-5 text-gray-600 rtl:rotate-180" />
        </button>
        <h3 className="text-base md:text-lg font-semibold text-gray-900" data-testid="text-current-month">
          {formatRegionalDate(currentMonth, i18n.language, { month: isMobile ? "short" : "long", year: "numeric" })}
        </h3>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-2 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label={t("calendar.nextMonth")}
          data-testid="button-next-month"
        >
          <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-gray-600 rtl:rotate-180" />
        </button>
      </div>
      
      <div className="grid grid-cols-7">
        {dayNames.map((day, idx) => (
          <div key={idx} className="p-2 text-center text-xs font-medium text-slate-600 border-b border-slate-200 bg-slate-50">
            {day}
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayTasks = tasksByDate.get(dateKey) || [];
          const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
          const isDayToday = isToday(day);
          const isPastDay = isBefore(day, new Date()) && !isDayToday;
          
          return (
            <div
              key={idx}
              className={cn(
                "min-w-0 min-h-[72px] md:min-h-[116px] p-1 md:p-2 border-b border-e border-slate-100 transition-colors",
                !isCurrentMonth && "bg-slate-50",
                isDayToday && "bg-emerald-50/60",
                !isMobile && draggedTask && "hover:bg-green-50"
              )}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, day)}
              data-testid={`calendar-day-${dateKey}`}
            >
              <div className={cn(
                "text-xs font-medium mb-1 text-end text-slate-700",
                !isCurrentMonth && "text-gray-400",
                isDayToday && "text-emerald-800 font-bold",
                isPastDay && isCurrentMonth && "text-gray-500"
              )}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5 md:space-y-1">
                {dayTasks.slice(0, maxTasksToShow).map(task => {
                  const status = getTaskStatus(task.followUpDate);
                  return (
                    <div
                      key={task.id}
                      draggable={!isMobile && !task.isAppointment}
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTaskClick(task.id);
                      }}
                      className={cn(
                        "text-[10px] md:text-xs px-1 py-1 md:px-2 rounded-md cursor-pointer truncate transition-colors",
                        status === 'overdue' && "bg-red-100 text-red-700 hover:bg-red-200",
                        status === 'today' && "bg-amber-100 text-amber-700 hover:bg-amber-200",
                        status === 'upcoming' && "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
                        !status && "bg-gray-100 text-gray-700 hover:bg-gray-200",
                        draggedTask?.id === task.id && "opacity-50"
                      )}
                      data-testid={`calendar-task-${task.id}`}
                      title={task.isAppointment ? `${task.appointmentType} · ${task.name}` : (task.followUp ? `${task.name} · ${task.followUp}` : task.name)}
                    >
                      {task.isAppointment
                        ? (isMobile ? task.appointmentType! : `${task.appointmentType} · ${task.name}`)
                        : (isMobile ? task.name.split(' ')[0] : (task.followUp ? `${task.name} · ${task.followUp.split(' · ')[0]}` : task.name))
                      }
                    </div>
                  );
                })}
                {dayTasks.length > maxTasksToShow && (
                  <div className="text-[9px] md:text-xs text-gray-500 pl-0.5 md:pl-1">
                    +{dayTasks.length - maxTasksToShow}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FollowUps() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  useEffect(() => {
    if (!user?.id) return;
    try {
      const saved = window.localStorage.getItem(`whachat.followups.view.${user.id}`);
      setViewMode(saved === 'pipeline' || saved === 'calendar' ? saved : 'list');
    } catch { setViewMode('list'); }
  }, [user?.id]);
  const selectView = (view: ViewMode) => {
    setViewMode(view);
    if (user?.id) { try { window.localStorage.setItem(`whachat.followups.view.${user.id}`, view); } catch { /* preference is optional */ } }
  };
  const [kpiFilter, setKpiFilter] = useState<KPIFilter>(null);
  const isMobile = useIsMobile();
  const [leadReviewsOnly, setLeadReviewsOnly] = useState(false);

  const { data: inboxData = [], isLoading } = useQuery<InboxItem[]>({
    queryKey: ['/api/inbox'],
    enabled: !!user,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 30_000,
  });

  const { data: appointmentsData = [] } = useQuery<AppointmentRecord[]>({
    queryKey: ['/api/appointments'],
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    let ws: WebSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/presence`);
    ws.onopen = () => {
      ws?.send(JSON.stringify({ type: "auth", userId: user.id, userName: user.name || "Agent" }));
      heartbeat = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "heartbeat" }));
        }
      }, 25000);
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "calendly_booking_confirmed") {
          queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
          queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
          toast({
            title: "Booking confirmed",
            description:
              typeof msg.title === "string" && msg.title ? msg.title : "Calendly booking saved to Tasks.",
          });
        }
      } catch {
        /* ignore malformed WS frames */
      }
    };
    return () => {
      if (heartbeat) clearInterval(heartbeat);
      ws?.close();
    };
  }, [user, queryClient, toast]);

  const chats = useMemo(() => buildFollowUpItems(inboxData), [inboxData]);
  const scheduledFollowUps = useMemo(() => chats.filter(hasScheduledFollowUp), [chats]);
  const [reminder, setReminder] = useState<Chat | undefined>(undefined);

  const patchContact = async (contactId: string, fields: Record<string, unknown>) => {
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error('Failed to update contact');
    return res.json();
  };

  const invalidateAll = () => {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/inbox'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] }),
    ]);
  };

  const clearFollowUpMutation = useMutation({
    mutationFn: async (contactId: string) => {
      return patchContact(contactId, { followUp: null, followUpDate: null });
    },
    onSuccess: invalidateAll,
  });

  const updateFollowUpDateMutation = useMutation({
    mutationFn: async ({ chatId, newDate, title }: { chatId: string; newDate: Date; title?: string }) => {
      return patchContact(chatId, { followUpDate: newDate.toISOString(), ...(title ? { followUp: title } : {}) });
    },
    onSuccess: () => { invalidateAll(); setReminder(undefined); toast({ title: t('followups.reminderSaved') }); },
    onError: () => toast({ title: 'Could not save reminder', variant: 'destructive' }),
  });

  const updatePipelineStageMutation = useMutation({
    mutationFn: async ({ chatId, newStage }: { chatId: string; newStage: string }) => {
      return patchContact(chatId, { pipelineStage: newStage });
    },
    onSuccess: async () => { await invalidateAll(); toast({ title: t('followups.stageSaved') }); },
    onError: () => toast({ title: t('followups.stageSaveFailed'), variant: 'destructive' }),
  });

  const filteredChats = useMemo(() => {
    return applyKPIFilter(chats, kpiFilter);
  }, [chats, kpiFilter]);

  const followUps = useMemo(() => {
    const items = kpiFilter ? filteredChats : filteredChats.filter(c => c.reviewRecommended || hasTask(c) || hasNeedsReply(c));
    return [...items].sort((a, b) =>
      (a.followUpDate ? Date.parse(a.followUpDate) : Infinity) -
      (b.followUpDate ? Date.parse(b.followUpDate) : Infinity));
  }, [filteredChats, kpiFilter]);

  const savedTasks = followUps.filter(task => !task.reviewRecommended && (hasTask(task) || !hasNeedsReply(task)));
  const replyTasks = useMemo(() => prioritizeTasks(followUps.filter(task => task.reviewRecommended || !hasTask(task))), [followUps]);
  const leadReviews = replyTasks.filter(task => task.reviewRecommended);
  const showOnlyLeadReviews = !kpiFilter && leadReviewsOnly && leadReviews.length > 0;
  const visibleRecommendations = showOnlyLeadReviews ? leadReviews : replyTasks;
  const recommendedTasks = visibleRecommendations.slice(0, 5);
  const remainingReplies = visibleRecommendations.slice(5);

  const appointmentTasks = useMemo<Chat[]>(() => {
    return appointmentsData.filter(appt => validTaskDate(appt.appointmentDate)).map(appt => ({
      id: appt.id,
      name: appt.contactName,
      avatar: '',
      lastMessage: '',
      time: '',
      unread: 0,
      tag: '',
      followUp: appt.appointmentType,
      followUpDate: validTaskDate(appt.appointmentDate),
      notes: '',
      pipelineStage: '',
      needsReply: false, isOpportunity: false, urgent: false, engaged: false,
      appointmentId: appt.id,
      contactId: appt.contactId,
      appointmentType: appt.appointmentType,
      isAppointment: true,
    }));
  }, [appointmentsData]);

  const calendarTasks = useMemo<Chat[]>(() => {
    // Only dated work belongs on the calendar; filter appointments by their own date.
    const selectedContactIds = new Set(filteredChats.map(chat => chat.id));
    const appointments = kpiFilter === 'overdue' || kpiFilter === 'today'
      ? applyKPIFilter(appointmentTasks, kpiFilter)
      : appointmentTasks.filter(task => !kpiFilter || selectedContactIds.has(task.contactId!));
    const followUpEvents = followUps.filter(hasScheduledFollowUp).filter(task =>
      !appointments.some(appt => appt.contactId === task.id &&
        appt.followUpDate === task.followUpDate &&
        (appt.followUp === task.followUp || appointmentsData.find(a => a.id === appt.id)?.title === task.followUp)));
    return [...followUpEvents, ...appointments];
  }, [followUps, appointmentTasks, appointmentsData, filteredChats, kpiFilter]);

  const handleMarkDone = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    await clearFollowUpMutation.mutateAsync(chatId);
  };

  const handleRowClick = (chatId: string) => {
    const appt = appointmentsData.find(a => a.id === chatId);
    const chat = chats.find(c => c.id === chatId);
    const conversationQuery = chat?.conversationId ? `?conversation=${encodeURIComponent(chat.conversationId)}` : '';
    setLocation(`/app/inbox/${appt ? appt.contactId : chatId}${appt ? '' : conversationQuery}`);
  };

  const handleReschedule = (chatId: string, newDate: Date) => {
    updateFollowUpDateMutation.mutate({ chatId, newDate });
  };

  const handleStageChange = (chatId: string, newStage: string) => {
    const chat = chats.find(item => item.id === chatId && item.isOpportunity);
    if (!chat || updatePipelineStageMutation.isPending || boardStage(chat.pipelineStage) === newStage) return;
    if (!isSalesOpportunity({ id: chat.id, name: chat.name, tag: chat.tag, pipelineStage: newStage }) && !window.confirm(t('followups.moveOutOfPipeline'))) return;
    updatePipelineStageMutation.mutate({ chatId, newStage });
  };

  if (isLoading) {
    return (
      <div className="flex-1 h-full bg-white flex items-center justify-center">
        <div className="text-gray-400">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 h-full bg-slate-50 flex flex-col">
      <div className="shrink-0 bg-white px-4 py-4 md:px-6 md:py-5 border-b border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-display font-bold text-gray-900">Tasks</h1>
            <p className="text-sm md:text-base text-gray-500 mt-1">{scheduledFollowUps.length} scheduled follow-up{scheduledFollowUps.length !== 1 ? 's' : ''} · {appointmentTasks.length} appointment{appointmentTasks.length !== 1 ? 's' : ''}</p>
            <p className="text-xs text-gray-400 mt-1">Contact task and deal counts reflect the recent inbox.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 border border-slate-200 p-1 rounded-xl self-start md:self-auto" data-testid="view-toggle">
            <button
              onClick={() => selectView('list')}
              className={cn(
                "flex items-center gap-1.5 md:gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                viewMode === 'list' 
                  ? "bg-brand-green text-white shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
              aria-pressed={viewMode === 'list'}
              data-testid="toggle-list-view"
            >
              <List className="h-3.5 w-3.5 md:h-4 md:w-4" />
              {isMobile ? 'List' : 'List View'}
            </button>
            <button
              onClick={() => selectView('calendar')}
              className={cn(
                "flex items-center gap-1.5 md:gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                viewMode === 'calendar' 
                  ? "bg-brand-green text-white shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
              aria-pressed={viewMode === 'calendar'}
              data-testid="toggle-calendar-view"
            >
              <CalendarIcon className="h-3.5 w-3.5 md:h-4 md:w-4" />
              {isMobile ? 'Calendar' : 'Calendar View'}
            </button>
            <button
              onClick={() => selectView('pipeline')}
              className={cn(
                "flex items-center gap-1.5 md:gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                viewMode === 'pipeline' 
                  ? "bg-brand-green text-white shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
              aria-pressed={viewMode === 'pipeline'}
              data-testid="toggle-pipeline-view"
            >
              <Kanban className="h-3.5 w-3.5 md:h-4 md:w-4" />
              {isMobile ? 'Pipeline' : 'Pipeline View'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-6">
        <KPIHeader chats={chats} activeFilter={kpiFilter} onFilterChange={setKpiFilter} />
        <Dialog open={!!reminder} onOpenChange={(open) => { if (!open) setReminder(undefined); }}>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>Set Reminder</DialogTitle>
            <form className="space-y-4" onSubmit={(event) => {
              event.preventDefault();
              const date = new Date(String(new FormData(event.currentTarget).get('reminderAt')));
              const title = String(new FormData(event.currentTarget).get('reminderTitle') || '').trim();
              if (reminder && title && Number.isFinite(date.getTime())) updateFollowUpDateMutation.mutate({ chatId: reminder.id, newDate: date, title });
            }}>
              <label className="grid gap-1 text-sm">{t("followups.reminderTitle")}
                <input key={reminder?.id} name="reminderTitle" required defaultValue={reminder?.followUp || reminder?.reviewRecommended || ""} className="rounded-md border border-gray-300 p-2" />
              </label>
              <label className="grid gap-1 text-sm">Date and time
                <input key={reminder?.id} name="reminderAt" type="datetime-local" required defaultValue={reminder?.followUpDate ? format(new Date(reminder.followUpDate), "yyyy-MM-dd'T'HH:mm") : ""} className="rounded-md border border-gray-300 p-2" />
              </label>
              <Button type="submit" disabled={updateFollowUpDateMutation.isPending}>Save Reminder</Button>
            </form>
          </DialogContent>
        </Dialog>
        {viewMode === "list" && !kpiFilter && <ShopifyOrderSupportTasks />}
        
        {kpiFilter && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="text-sm text-gray-600">
              Filtering by: <span className="font-semibold">
                {{
                  'overdue': 'Overdue',
                  'today': 'Due Today',
                  'booking-requested': 'High Intent',
                  'booked': 'Closed',
                  'needs-reply': 'Needs Reply',
                  'active-deals': 'Active Deals',
                }[kpiFilter]}
              </span>
            </span>
            <button 
              onClick={() => setKpiFilter(null)}
              className="text-sm text-brand-green hover:underline"
              data-testid="button-clear-filter"
            >
              Clear filter
            </button>
          </div>
        )}
        
        {viewMode === 'list' && leadReviews.length > 0 && !kpiFilter && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <a href="#recommended-tasks-heading" onClick={() => setLeadReviewsOnly(true)} className="text-sm font-medium text-purple-700 underline underline-offset-2">
              Lead reviews ({leadReviews.length})
            </a>
          </div>
        )}

        {viewMode === 'list' ? (
          <div className={cn("grid items-start gap-4 md:gap-5", savedTasks.length > 0 && recommendedTasks.length > 0
            ? "lg:grid-cols-2" : "max-w-3xl")} data-testid="follow-up-list-columns">
            {savedTasks.length > 0 && (
              <section className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-100/60 p-3 md:p-4" aria-labelledby="follow-up-tasks-heading">
                <h2 id="follow-up-tasks-heading" className="text-base font-semibold text-slate-900" data-testid="section-all-tasks">
                  {kpiFilter ? 'Matching Tasks' : 'Follow-up Tasks'}
                </h2>
                {savedTasks.map(chat => (
                  <TaskListItem key={chat.id} chat={chat} onMarkDone={handleMarkDone}
                    isPending={clearFollowUpMutation.isPending} pendingId={clearFollowUpMutation.variables}
                    onClick={handleRowClick} />
                ))}
              </section>
            )}

            {recommendedTasks.length > 0 && (
              <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-100/60 p-3 md:p-4" aria-labelledby="recommended-tasks-heading">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <h2 id="recommended-tasks-heading" tabIndex={-1} className="text-base font-semibold text-slate-900" data-testid="section-recommended">
                    Recommended Tasks
                  </h2>
                </div>
                <p className="text-xs text-gray-500 mb-3" title="Rule-based priority using due dates, urgency, customer inquiries, and sales qualification.">
                  Prioritized by due date, urgency, and customer intent
                </p>
                {!kpiFilter && leadReviews.length > 0 && leadReviews.length < replyTasks.length && (
                  <Button type="button" size="sm" variant="outline" className="mb-3"
                    aria-pressed={showOnlyLeadReviews} onClick={() => setLeadReviewsOnly(!showOnlyLeadReviews)}>
                    Lead reviews only ({leadReviews.length})
                  </Button>
                )}
                <div className="space-y-3">
                  {recommendedTasks.map(chat => (
                    <div key={chat.id} className="relative">
                      <div className="absolute start-0 top-4 w-1 h-8 bg-violet-400 rounded-e-full" />
                      <TaskListItem
                        chat={chat}
                        onMarkDone={handleMarkDone}
                        isPending={clearFollowUpMutation.isPending}
                        pendingId={clearFollowUpMutation.variables}
                        onClick={handleRowClick}
                        onSetReminder={setReminder}
                      />
                    </div>
                  ))}
                </div>
                {remainingReplies.length > 0 && (
                  <details className="mt-4 space-y-3">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-700">
                      More recommendations ({remainingReplies.length})
                    </summary>
                    {remainingReplies.map(chat => (
                      <TaskListItem key={chat.id} chat={chat} onMarkDone={handleMarkDone}
                        isPending={clearFollowUpMutation.isPending} pendingId={clearFollowUpMutation.variables}
                        onClick={handleRowClick} onSetReminder={setReminder} />
                    ))}
                  </details>
                )}
              </section>
            )}

            {followUps.length === 0 && (
              <div className="text-center py-12 px-4 bg-white rounded-xl border border-dashed border-slate-300">
                <CheckCircle2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-slate-900 font-semibold">No matching tasks</p>
                <p className="text-sm text-slate-600 mt-1">{t("followups.emptyTasksHint")}</p>
                <Button className="mt-4 bg-brand-green hover:bg-emerald-700" data-testid="button-view-chats"
                  onClick={() => setLocation('/app/inbox')}>
                  Go to Inbox
                </Button>
              </div>
            )}
          </div>
        ) : viewMode === 'calendar' ? (
          <TaskCalendarView
            tasks={calendarTasks}
            onTaskClick={handleRowClick}
            onReschedule={handleReschedule}
            isMobile={isMobile}
          />
        ) : (
          <PipelineView
            chats={filteredChats.filter(chat => chat.isOpportunity)}
            onCardClick={handleRowClick}
            onStageChange={handleStageChange}
            isMobile={isMobile} actorId={user?.id} stagePending={updatePipelineStageMutation.isPending} onSetReminder={setReminder}
          />
        )}
      </div>
    </div>
  );
}
