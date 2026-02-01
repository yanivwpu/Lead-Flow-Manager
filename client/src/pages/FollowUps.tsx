import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowRight, CheckCircle2, Calendar as CalendarIcon, List, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday, isBefore, startOfWeek, endOfWeek, parseISO } from "date-fns";

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
}

type ViewMode = 'list' | 'calendar';

function getTaskStatus(followUpDate: string): 'overdue' | 'today' | 'upcoming' {
  const dueDate = new Date(followUpDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  
  if (dueDateOnly < today) return 'overdue';
  if (isSameDay(dueDate, now)) return 'today';
  return 'upcoming';
}

function StatusTag({ status }: { status: 'overdue' | 'today' | 'upcoming' }) {
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
  const status = getTaskStatus(chat.followUpDate!);
  const hasUnrepliedInbound = chat.messages?.length > 0 && 
    chat.messages[chat.messages.length - 1]?.sender !== 'me';
  
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
          <StatusTag status={status} />
          {hasUnrepliedInbound && (
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

function TaskCalendarView({ 
  tasks, 
  onTaskClick,
  onReschedule
}: { 
  tasks: Chat[]; 
  onTaskClick: (chatId: string) => void;
  onReschedule: (chatId: string, newDate: Date) => void;
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
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  
  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (draggedTask) {
      onReschedule(draggedTask.id, date);
      setDraggedTask(null);
    }
  };
  
  const handleDragEnd = () => {
    setDraggedTask(null);
  };
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" data-testid="calendar-view">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          data-testid="button-prev-month"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h3 className="text-lg font-semibold text-gray-900" data-testid="text-current-month">
          {format(currentMonth, 'MMMM yyyy')}
        </h3>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          data-testid="button-next-month"
        >
          <ChevronRight className="h-5 w-5 text-gray-600" />
        </button>
      </div>
      
      <div className="grid grid-cols-7">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="p-2 text-center text-xs font-semibold text-gray-500 border-b border-gray-200 bg-gray-50">
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
                "min-h-[100px] p-1 border-b border-r border-gray-100 transition-colors",
                !isCurrentMonth && "bg-gray-50",
                isDayToday && "bg-amber-50",
                draggedTask && "hover:bg-green-50"
              )}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, day)}
              data-testid={`calendar-day-${dateKey}`}
            >
              <div className={cn(
                "text-xs font-medium mb-1 text-right pr-1",
                !isCurrentMonth && "text-gray-400",
                isDayToday && "text-amber-600",
                isPastDay && isCurrentMonth && "text-gray-500"
              )}>
                {format(day, 'd')}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map(task => {
                  const status = getTaskStatus(task.followUpDate!);
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTaskClick(task.id);
                      }}
                      className={cn(
                        "text-xs p-1 rounded cursor-pointer truncate transition-all hover:shadow-sm",
                        status === 'overdue' && "bg-red-100 text-red-700 hover:bg-red-200",
                        status === 'today' && "bg-amber-100 text-amber-700 hover:bg-amber-200",
                        status === 'upcoming' && "bg-blue-100 text-blue-700 hover:bg-blue-200",
                        draggedTask?.id === task.id && "opacity-50"
                      )}
                      data-testid={`calendar-task-${task.id}`}
                      title={task.name}
                    >
                      {task.name}
                    </div>
                  );
                })}
                {dayTasks.length > 3 && (
                  <div className="text-xs text-gray-500 pl-1">
                    +{dayTasks.length - 3} more
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
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const { data: chats = [], isLoading } = useQuery<Chat[]>({
    queryKey: ['/api/chats'],
    enabled: !!user,
  });

  const clearFollowUpMutation = useMutation({
    mutationFn: async (chatId: string) => {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          followUp: null,
          followUpDate: null,
        }),
      });
      if (!response.ok) throw new Error('Failed to clear follow-up');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
    },
  });

  const updateFollowUpDateMutation = useMutation({
    mutationFn: async ({ chatId, newDate }: { chatId: string; newDate: Date }) => {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          followUpDate: newDate.toISOString(),
        }),
      });
      if (!response.ok) throw new Error('Failed to update follow-up date');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
    },
  });

  const followUps = useMemo(() => {
    return chats
      .filter(c => c.followUp && c.followUpDate)
      .sort((a, b) => {
        const dateA = new Date(a.followUpDate!).getTime();
        const dateB = new Date(b.followUpDate!).getTime();
        return dateA - dateB;
      });
  }, [chats]);

  const aiRecommendedTasks = useMemo(() => {
    return [...followUps].sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      
      const hasUnrepliedA = a.messages?.length > 0 && a.messages[a.messages.length - 1]?.sender !== 'me';
      const hasUnrepliedB = b.messages?.length > 0 && b.messages[b.messages.length - 1]?.sender !== 'me';
      if (hasUnrepliedA) scoreA += 50;
      if (hasUnrepliedB) scoreB += 50;
      
      const statusA = getTaskStatus(a.followUpDate!);
      const statusB = getTaskStatus(b.followUpDate!);
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
    setLocation(`/app/chats/${chatId}`);
  };

  const handleReschedule = (chatId: string, newDate: Date) => {
    updateFollowUpDateMutation.mutate({ chatId, newDate });
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
      <div className="p-8 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900">Tasks</h1>
            <p className="text-gray-500 mt-1">You have {followUps.length} follow-up{followUps.length !== 1 ? 's' : ''} scheduled.</p>
          </div>
          
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg" data-testid="view-toggle">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                viewMode === 'list' 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
              data-testid="toggle-list-view"
            >
              <List className="h-4 w-4" />
              List View
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                viewMode === 'calendar' 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
              data-testid="toggle-calendar-view"
            >
              <CalendarIcon className="h-4 w-4" />
              Calendar View
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
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
                <p className="text-xs text-gray-500 mb-3">
                  Prioritized based on unreplied messages, overdue status, and engagement
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
                      onClick={() => setLocation('/app/chats')}
                    >
                      View All Chats
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <TaskCalendarView
            tasks={followUps}
            onTaskClick={handleRowClick}
            onReschedule={handleReschedule}
          />
        )}
      </div>
    </div>
  );
}
