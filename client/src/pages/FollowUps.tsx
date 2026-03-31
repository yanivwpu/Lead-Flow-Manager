import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowRight, CheckCircle2, Calendar as CalendarIcon, List, Sparkles, ChevronLeft, ChevronRight, Kanban, AlertCircle, Clock, CalendarCheck, MessageSquare, CheckCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday, isBefore, startOfWeek, endOfWeek } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

interface Chat {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  tag: string;
  followUp: string | null;
  followUpDate: string | null;
  notes: string;
  pipelineStage: string;
  messages: any[];
  lastMessageDirection?: string;
}

interface InboxItem {
  contact: {
    id: string;
    name: string;
    avatar?: string;
    tag: string;
    pipelineStage: string;
    notes?: string;
    followUp?: string | null;
    followUpDate?: string | null;
  };
  conversation?: {
    lastMessageDirection?: string;
  } | null;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
}

type ViewMode = 'list' | 'calendar' | 'pipeline';
type KPIFilter = 'overdue' | 'today' | 'booking-requested' | 'booked' | 'needs-reply' | 'active-deals' | null;

const PIPELINE_STAGES = ['Lead', 'Contacted', 'Proposal', 'Negotiation', 'Closed'] as const;

function getTaskStatus(followUpDate: string | null): 'overdue' | 'today' | 'upcoming' | null {
  if (!followUpDate) return null;
  const dueDate = new Date(followUpDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  
  if (dueDateOnly < today) return 'overdue';
  if (isSameDay(dueDate, now)) return 'today';
  return 'upcoming';
}

function isClosedStage(stage: string): boolean {
  return stage === 'Closed' || stage === 'Closed Won';
}

function hasNeedsReply(chat: Chat): boolean {
  return (chat.lastMessageDirection === 'inbound' && chat.unread > 0) || chat.unread > 0;
}

function KPIHeader({ chats, activeFilter, onFilterChange }: { 
  chats: Chat[]; 
  activeFilter: KPIFilter;
  onFilterChange: (filter: KPIFilter) => void;
}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const overdueCount = useMemo(() => 
    chats.filter(c => {
      if (!c.followUpDate) return false;
      const dueDate = new Date(c.followUpDate);
      const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      return dueDateOnly < today;
    }).length, 
  [chats, today]);

  const todayCount = useMemo(() => 
    chats.filter(c => c.followUpDate && isSameDay(new Date(c.followUpDate), now)).length,
  [chats, now]);

  const bookingRequestedCount = useMemo(() => 
    chats.filter(c => c.pipelineStage === 'Negotiation').length,
  [chats]);

  const bookedCount = useMemo(() => 
    chats.filter(c => isClosedStage(c.pipelineStage)).length,
  [chats]);

  const needsReplyCount = useMemo(() => 
    chats.filter(c => hasNeedsReply(c)).length,
  [chats]);

  const activeDealsCount = useMemo(() => 
    chats.filter(c => !isClosedStage(c.pipelineStage)).length,
  [chats]);

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
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 mb-6" data-testid="kpi-header">
      {kpis.map(kpi => (
        <button 
          key={kpi.label}
          onClick={() => handleClick(kpi.filterKey)}
          className={cn(
            "rounded-xl border p-3 md:p-4 text-left transition-all cursor-pointer hover:shadow-md",
            kpi.bg,
            activeFilter === kpi.filterKey ? kpi.activeBorder : kpi.border
          )}
          data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <kpi.icon className={cn("h-4 w-4", kpi.color)} />
            <span className="text-xs md:text-sm font-medium text-gray-600">{kpi.label}</span>
          </div>
          <p className={cn("text-xl md:text-2xl font-bold", kpi.color)}>{kpi.value}</p>
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
  onClick 
}: { 
  chat: Chat; 
  onMarkDone: (e: React.MouseEvent, chatId: string) => void;
  isPending: boolean;
  pendingId: string | undefined;
  onClick: (chatId: string) => void;
}) {
  const status = chat.followUpDate ? getTaskStatus(chat.followUpDate) : null;
  const needsReply = hasNeedsReply(chat);
  
  return (
    <div 
      className="group bg-white border border-gray-200 rounded-xl p-4 flex items-center hover:shadow-md transition-all hover:border-brand-green/30 cursor-pointer"
      onClick={() => onClick(chat.id)}
      data-testid={`task-item-${chat.id}`}
    >
      <button 
        className="h-6 w-6 rounded-full border-2 border-gray-300 hover:border-brand-green hover:bg-brand-green hover:text-white mr-4 shrink-0 transition-colors flex items-center justify-center"
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
      </button>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-semibold text-gray-900" data-testid={`text-contact-${chat.id}`}>
            {chat.name}
          </span>
          {status && <StatusTag status={status} />}
          {needsReply && (
            <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium" data-testid={`tag-unreplied-${chat.id}`}>
              Needs Reply
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 mb-1">
          Follow up: {chat.followUp}
          {chat.followUpDate && (
            <span className="text-gray-400 ml-2">
              ({format(new Date(chat.followUpDate), 'MMM d, yyyy')})
            </span>
          )}
        </p>
        <p className="text-sm text-gray-500 truncate" data-testid={`text-lastmessage-${chat.id}`}>
          Last message: "{chat.lastMessage}"
        </p>
        {chat.notes && (
          <p className="text-xs text-gray-400 truncate mt-1">
            Note: {chat.notes}
          </p>
        )}
      </div>

      <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-brand-green transition-colors ml-4" data-testid={`icon-arrow-${chat.id}`} />
    </div>
  );
}

function PipelineCard({ 
  chat, 
  onClick,
  onDragStart,
  onDragEnd,
  isDragging
}: { 
  chat: Chat; 
  onClick: (chatId: string) => void;
  onDragStart: (e: React.DragEvent, chat: Chat) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const status = getTaskStatus(chat.followUpDate);
  const needsReply = hasNeedsReply(chat);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, chat)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(chat.id)}
      className={cn(
        "bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-md transition-all hover:border-brand-green/30",
        isDragging && "opacity-50"
      )}
      data-testid={`pipeline-card-${chat.id}`}
    >
      <div className="font-semibold text-gray-900 text-sm mb-1 truncate" data-testid={`pipeline-contact-${chat.id}`}>
        {chat.name}
      </div>
      <p className="text-xs text-gray-500 truncate mb-2" data-testid={`pipeline-lastmessage-${chat.id}`}>
        {chat.lastMessage}
      </p>
      <div className="flex flex-wrap gap-1">
        {needsReply && (
          <span className="text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded font-bold shadow-sm">
            Needs Reply
          </span>
        )}
        {status === 'overdue' && (
          <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold shadow-sm">
            Overdue
          </span>
        )}
        {status === 'today' && (
          <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-medium">
            Today
          </span>
        )}
        {chat.followUpDate && status === 'upcoming' && (
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
            {format(new Date(chat.followUpDate), 'MMM d')}
          </span>
        )}
      </div>
    </div>
  );
}

function PipelineView({ 
  chats, 
  onCardClick,
  onStageChange,
  isMobile
}: { 
  chats: Chat[]; 
  onCardClick: (chatId: string) => void;
  onStageChange: (chatId: string, newStage: string) => void;
  isMobile: boolean;
}) {
  const [draggedChat, setDraggedChat] = useState<Chat | null>(null);

  const chatsByStage = useMemo(() => {
    const map = new Map<string, Chat[]>();
    PIPELINE_STAGES.forEach(stage => map.set(stage, []));
    chats.forEach(chat => {
      let stage: string = chat.pipelineStage;
      if (isClosedStage(stage)) stage = 'Closed';
      if (!PIPELINE_STAGES.includes(stage as any)) stage = 'Lead';
      map.get(stage)?.push(chat);
    });
    return map;
  }, [chats]);

  const handleDragStart = (e: React.DragEvent, chat: Chat) => {
    if (isMobile) return;
    setDraggedChat(chat);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isMobile) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, stage: string) => {
    if (isMobile) return;
    e.preventDefault();
    if (draggedChat && draggedChat.pipelineStage !== stage) {
      onStageChange(draggedChat.id, stage);
    }
    setDraggedChat(null);
  };

  const handleDragEnd = () => {
    setDraggedChat(null);
  };

  const stageColors: Record<string, { bg: string; border: string; header: string }> = {
    'Lead': { bg: 'bg-gray-50', border: 'border-gray-300', header: 'bg-gray-100' },
    'Contacted': { bg: 'bg-blue-50', border: 'border-blue-300', header: 'bg-blue-100' },
    'Proposal': { bg: 'bg-purple-50', border: 'border-purple-300', header: 'bg-purple-100' },
    'Negotiation': { bg: 'bg-amber-50', border: 'border-amber-300', header: 'bg-amber-100' },
    'Closed': { bg: 'bg-green-50', border: 'border-green-300', header: 'bg-green-100' },
  };

  const emptyStateMessages: Record<string, string> = {
    'Lead': 'No new leads yet',
    'Contacted': 'No leads contacted yet',
    'Proposal': 'No proposals sent yet',
    'Negotiation': 'No deals in negotiation',
    'Closed': 'Drag here when deal is won',
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" data-testid="pipeline-view">
      {PIPELINE_STAGES.map(stage => {
        const stageChats = chatsByStage.get(stage) || [];
        const colors = stageColors[stage] || stageColors['Lead'];
        
        return (
          <div
            key={stage}
            className={cn(
              "flex-shrink-0 w-[280px] md:w-[300px] rounded-xl border",
              colors.bg,
              colors.border,
              draggedChat && draggedChat.pipelineStage !== stage && "ring-2 ring-brand-green/30"
            )}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, stage)}
            data-testid={`pipeline-column-${stage.toLowerCase()}`}
          >
            <div className={cn("p-3 rounded-t-xl border-b", colors.header, colors.border)}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">{stage}</h3>
                  <p className="text-xs text-gray-500">{stageChats.length} contact{stageChats.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>
            <div className="p-2 space-y-2 max-h-[500px] overflow-y-auto">
              {stageChats.map(chat => (
                <PipelineCard
                  key={chat.id}
                  chat={chat}
                  onClick={onCardClick}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  isDragging={draggedChat?.id === chat.id}
                />
              ))}
              {stageChats.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm italic">
                  {emptyStateMessages[stage]}
                </div>
              )}
            </div>
          </div>
        );
      })}
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
    if (isMobile) return;
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

  const dayNames = isMobile 
    ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] 
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const maxTasksToShow = isMobile ? 2 : 3;
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid="calendar-view">
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-gray-200">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-1.5 md:p-2 hover:bg-gray-100 rounded-lg transition-colors"
          data-testid="button-prev-month"
        >
          <ChevronLeft className="h-4 w-4 md:h-5 md:w-5 text-gray-600" />
        </button>
        <h3 className="text-base md:text-lg font-semibold text-gray-900" data-testid="text-current-month">
          {format(currentMonth, isMobile ? 'MMM yyyy' : 'MMMM yyyy')}
        </h3>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-1.5 md:p-2 hover:bg-gray-100 rounded-lg transition-colors"
          data-testid="button-next-month"
        >
          <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-gray-600" />
        </button>
      </div>
      
      <div className="grid grid-cols-7">
        {dayNames.map((day, idx) => (
          <div key={idx} className="p-1 md:p-2 text-center text-[10px] md:text-xs font-semibold text-gray-500 border-b border-gray-200 bg-gray-50">
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
                "min-h-[60px] md:min-h-[100px] p-0.5 md:p-1 border-b border-r border-gray-100 transition-colors",
                !isCurrentMonth && "bg-gray-50",
                isDayToday && "bg-amber-50",
                !isMobile && draggedTask && "hover:bg-green-50"
              )}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, day)}
              data-testid={`calendar-day-${dateKey}`}
            >
              <div className={cn(
                "text-[10px] md:text-xs font-medium mb-0.5 md:mb-1 text-right pr-0.5 md:pr-1",
                !isCurrentMonth && "text-gray-400",
                isDayToday && "text-amber-600",
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
                      draggable={!isMobile}
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTaskClick(task.id);
                      }}
                      className={cn(
                        "text-[9px] md:text-xs p-0.5 md:p-1 rounded cursor-pointer truncate transition-all hover:shadow-sm",
                        status === 'overdue' && "bg-red-100 text-red-700 hover:bg-red-200",
                        status === 'today' && "bg-amber-100 text-amber-700 hover:bg-amber-200",
                        status === 'upcoming' && "bg-blue-100 text-blue-700 hover:bg-blue-200",
                        !status && "bg-gray-100 text-gray-700 hover:bg-gray-200",
                        draggedTask?.id === task.id && "opacity-50"
                      )}
                      data-testid={`calendar-task-${task.id}`}
                      title={task.name}
                    >
                      {isMobile ? task.name.split(' ')[0] : task.name}
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

function applyKPIFilter(chatList: Chat[], filter: KPIFilter): Chat[] {
  if (!filter) return chatList;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (filter) {
    case 'overdue':
      return chatList.filter(c => {
        if (!c.followUpDate) return false;
        const dueDate = new Date(c.followUpDate);
        const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        return dueDateOnly < today;
      });
    case 'today':
      return chatList.filter(c => c.followUpDate && isSameDay(new Date(c.followUpDate), now));
    case 'booking-requested':
      return chatList.filter(c => c.pipelineStage === 'Negotiation');
    case 'booked':
      return chatList.filter(c => isClosedStage(c.pipelineStage));
    case 'needs-reply':
      return chatList.filter(c => hasNeedsReply(c));
    case 'active-deals':
      return chatList.filter(c => !isClosedStage(c.pipelineStage));
    default:
      return chatList;
  }
}

export function FollowUps() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [kpiFilter, setKpiFilter] = useState<KPIFilter>(null);
  const isMobile = useIsMobile();

  const isDemoUser = user?.email === 'demo@whachat.com';

  // Demo users: keep using /api/chats. Real users: use /api/inbox.
  const { data: rawChats = [], isLoading: chatsLoading } = useQuery<Chat[]>({
    queryKey: ['/api/chats'],
    enabled: !!user && isDemoUser,
  });

  const { data: inboxData = [], isLoading: inboxLoading } = useQuery<InboxItem[]>({
    queryKey: ['/api/inbox'],
    enabled: !!user && !isDemoUser,
  });

  const isLoading = isDemoUser ? chatsLoading : inboxLoading;

  // Map /api/inbox items to the Chat shape used by this page
  const chats = useMemo<Chat[]>(() => {
    if (isDemoUser) return rawChats;
    return inboxData.map(item => ({
      id: item.contact.id,
      name: item.contact.name,
      avatar: item.contact.avatar || '',
      lastMessage: item.lastMessage,
      time: item.lastMessageAt || '',
      unread: item.unreadCount,
      tag: item.contact.tag,
      followUp: item.contact.followUp ?? null,
      followUpDate: item.contact.followUpDate
        ? typeof item.contact.followUpDate === 'string'
          ? item.contact.followUpDate
          : new Date(item.contact.followUpDate as any).toISOString()
        : null,
      notes: item.contact.notes || '',
      pipelineStage: item.contact.pipelineStage,
      messages: [],
      lastMessageDirection: item.conversation?.lastMessageDirection,
    }));
  }, [isDemoUser, rawChats, inboxData]);

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

  const patchChat = async (chatId: string, fields: Record<string, unknown>) => {
    const res = await fetch(`/api/chats/${chatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error('Failed to update chat');
    return res.json();
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/inbox'] });
    queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
  };

  const clearFollowUpMutation = useMutation({
    mutationFn: async (contactId: string) => {
      if (isDemoUser) return patchChat(contactId, { followUp: null, followUpDate: null });
      return patchContact(contactId, { followUp: null, followUpDate: null });
    },
    onSuccess: invalidateAll,
  });

  const updateFollowUpDateMutation = useMutation({
    mutationFn: async ({ chatId, newDate }: { chatId: string; newDate: Date }) => {
      if (isDemoUser) return patchChat(chatId, { followUpDate: newDate.toISOString() });
      return patchContact(chatId, { followUpDate: newDate.toISOString() });
    },
    onSuccess: invalidateAll,
  });

  const updatePipelineStageMutation = useMutation({
    mutationFn: async ({ chatId, newStage }: { chatId: string; newStage: string }) => {
      if (isDemoUser) return patchChat(chatId, { pipelineStage: newStage });
      return patchContact(chatId, { pipelineStage: newStage });
    },
    onSuccess: invalidateAll,
  });

  const filteredChats = useMemo(() => {
    return applyKPIFilter(chats, kpiFilter);
  }, [chats, kpiFilter]);

  const followUps = useMemo(() => {
    const baseList = kpiFilter 
      ? filteredChats 
      : filteredChats.filter(c => c.followUp && c.followUpDate);
    
    return baseList.sort((a, b) => {
      const dateA = a.followUpDate ? new Date(a.followUpDate).getTime() : Infinity;
      const dateB = b.followUpDate ? new Date(b.followUpDate).getTime() : Infinity;
      return dateA - dateB;
    });
  }, [filteredChats, kpiFilter]);

  const aiRecommendedTasks = useMemo(() => {
    return [...followUps].sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      
      if (hasNeedsReply(a)) scoreA += 50;
      if (hasNeedsReply(b)) scoreB += 50;
      
      const statusA = getTaskStatus(a.followUpDate);
      const statusB = getTaskStatus(b.followUpDate);
      if (statusA === 'overdue') scoreA += 40;
      if (statusB === 'overdue') scoreB += 40;
      if (statusA === 'today') scoreA += 20;
      if (statusB === 'today') scoreB += 20;
      
      scoreA += (a.unread || 0) * 5;
      scoreB += (b.unread || 0) * 5;
      
      return scoreB - scoreA;
    }).slice(0, 5);
  }, [followUps]);

  const regularTasks = useMemo(() => {
    const aiRecommendedIds = new Set(aiRecommendedTasks.map(t => t.id));
    return followUps.filter(t => !aiRecommendedIds.has(t.id));
  }, [followUps, aiRecommendedTasks]);

  const handleMarkDone = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    await clearFollowUpMutation.mutateAsync(chatId);
  };

  const handleRowClick = (chatId: string) => {
    setLocation(`/app/inbox/${chatId}`);
  };

  const handleReschedule = (chatId: string, newDate: Date) => {
    updateFollowUpDateMutation.mutate({ chatId, newDate });
  };

  const handleStageChange = (chatId: string, newStage: string) => {
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
    <div className="flex-1 h-full bg-white flex flex-col">
      <div className="p-4 md:p-8 pb-4 border-b border-gray-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-display font-bold text-gray-900">Tasks</h1>
            <p className="text-sm md:text-base text-gray-500 mt-1">You have {followUps.length} follow-up{followUps.length !== 1 ? 's' : ''} scheduled.</p>
          </div>
          
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg self-start md:self-auto" data-testid="view-toggle">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors",
                viewMode === 'list' 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
              data-testid="toggle-list-view"
            >
              <List className="h-3.5 w-3.5 md:h-4 md:w-4" />
              {isMobile ? 'List' : 'List View'}
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                "flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors",
                viewMode === 'calendar' 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
              data-testid="toggle-calendar-view"
            >
              <CalendarIcon className="h-3.5 w-3.5 md:h-4 md:w-4" />
              {isMobile ? 'Calendar' : 'Calendar View'}
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              className={cn(
                "flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors",
                viewMode === 'pipeline' 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
              data-testid="toggle-pipeline-view"
            >
              <Kanban className="h-3.5 w-3.5 md:h-4 md:w-4" />
              {isMobile ? 'Pipeline' : 'Pipeline View'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <KPIHeader chats={chats} activeFilter={kpiFilter} onFilterChange={setKpiFilter} />
        
        {kpiFilter && (
          <div className="mb-4 flex items-center gap-2">
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
        
        {viewMode === 'list' ? (
          <div className="max-w-3xl">
            {aiRecommendedTasks.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <h2 className="text-sm font-semibold text-purple-600 uppercase tracking-wider" data-testid="section-ai-recommended">
                    AI Recommended
                  </h2>
                </div>
                <p className="text-xs text-gray-500 mb-3" title="AI Recommended: Prioritized tasks based on engagement, overdue status, and unread messages.">
                  Prioritized based on engagement, overdue status, and unread messages
                </p>
                <div className="space-y-3">
                  {aiRecommendedTasks.map(chat => (
                    <div key={chat.id} className="relative">
                      <div className="absolute -left-2 top-4 w-1 h-8 bg-gradient-to-b from-purple-500 to-purple-300 rounded-full" />
                      <TaskListItem
                        chat={chat}
                        onMarkDone={handleMarkDone}
                        isPending={clearFollowUpMutation.isPending}
                        pendingId={clearFollowUpMutation.variables}
                        onClick={handleRowClick}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-8">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4" data-testid="section-all-tasks">
                {aiRecommendedTasks.length > 0 ? 'Other Tasks' : 'All Tasks'}
              </h2>
              <div className="space-y-3">
                {regularTasks.map(chat => (
                  <TaskListItem
                    key={chat.id}
                    chat={chat}
                    onMarkDone={handleMarkDone}
                    isPending={clearFollowUpMutation.isPending}
                    pendingId={clearFollowUpMutation.variables}
                    onClick={handleRowClick}
                  />
                ))}
                
                {followUps.length === 0 && (
                  <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <CheckCircle2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">All caught up!</p>
                    <p className="text-sm text-gray-400 mt-1">No tasks pending.</p>
                    <Button 
                      className="mt-4 bg-brand-green hover:bg-emerald-700" 
                      data-testid="button-view-chats"
                      onClick={() => setLocation('/app/inbox')}
                    >
                      Go to Inbox
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : viewMode === 'calendar' ? (
          <TaskCalendarView
            tasks={followUps}
            onTaskClick={handleRowClick}
            onReschedule={handleReschedule}
            isMobile={isMobile}
          />
        ) : (
          <PipelineView
            chats={filteredChats}
            onCardClick={handleRowClick}
            onStageChange={handleStageChange}
            isMobile={isMobile}
          />
        )}
      </div>
    </div>
  );
}
