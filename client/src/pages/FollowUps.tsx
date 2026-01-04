import { useLocation } from "wouter";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

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

export function FollowUps() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

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

  const followUps = chats
    .filter(c => c.followUp && c.followUpDate)
    .sort((a, b) => {
      const dateA = new Date(a.followUpDate!).getTime();
      const dateB = new Date(b.followUpDate!).getTime();
      return dateA - dateB;
    });

  const handleMarkDone = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    await clearFollowUpMutation.mutateAsync(chatId);
  };

  const handleRowClick = (chatId: string) => {
    setLocation(`/app/chats/${chatId}`);
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
         <h1 className="text-3xl font-display font-bold text-gray-900">Tasks</h1>
         <p className="text-gray-500 mt-1">You have {followUps.length} follow-up{followUps.length !== 1 ? 's' : ''} scheduled.</p>
       </div>

       <div className="flex-1 overflow-y-auto p-8">
         <div className="max-w-3xl">
           <div className="mb-8">
             <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Upcoming</h2>
             <div className="space-y-3">
               {followUps.map(chat => (
                 <div 
                   key={chat.id} 
                   className="group bg-white border border-gray-200 rounded-xl p-4 flex items-center hover:shadow-md transition-all hover:border-brand-green/30 cursor-pointer"
                   onClick={() => handleRowClick(chat.id)}
                   data-testid={`task-item-${chat.id}`}
                 >
                   <button 
                     className="h-6 w-6 rounded-full border-2 border-gray-300 hover:border-brand-green hover:bg-brand-green hover:text-white mr-4 shrink-0 transition-colors flex items-center justify-center"
                     onClick={(e) => handleMarkDone(e, chat.id)}
                     disabled={clearFollowUpMutation.isPending}
                     data-testid={`button-mark-done-${chat.id}`}
                     title="Mark as done"
                   >
                     {clearFollowUpMutation.isPending && clearFollowUpMutation.variables === chat.id ? (
                       <div className="h-3 w-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                     ) : (
                       <CheckCircle2 className="h-4 w-4 opacity-0 group-hover:opacity-100" />
                     )}
                   </button>
                   
                   <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-2 mb-1">
                       <span className="font-semibold text-gray-900">Follow up with {chat.name}</span>
                       <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                         {chat.followUp}
                       </span>
                     </div>
                     <p className="text-sm text-gray-500 truncate">
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
       </div>
    </div>
  );
}
