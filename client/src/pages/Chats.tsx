import { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { ChatListItem } from "@/components/ChatListItem";
import { TAG_COLORS, PIPELINE_STAGES } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Search, 
  MoreVertical, 
  Smile, 
  Paperclip, 
  Send,
  Clock,
  Smartphone,
  Lock,
  Trash2,
  AlertTriangle,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UpgradeModal, type UpgradeReason } from "@/components/UpgradeModal";
import { useSubscription } from "@/lib/subscription-context";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface Chat {
  id: string;
  userId: string;
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
  createdAt?: string;
}

type FollowUp = 'Tomorrow' | '3 days' | '1 week' | null;

export function Chats() {
  const [match, params] = useRoute("/app/chats/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();
  const { data: subscription } = useSubscription();
  const { toast } = useToast();
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>("free_reply");
  
  const canSendMessages = subscription?.limits?.canSendMessages ?? false;
  const isAtLimit = subscription?.limits?.isAtLimit ?? false;

  const { data: twilioStatus } = useQuery<{ connected: boolean; whatsappNumber: string | null }>({
    queryKey: ["/api/twilio/status"],
    enabled: !!user,
  });

  const isTwilioConnected = twilioStatus?.connected ?? false;

  const { data: chats = [], isLoading } = useQuery<Chat[]>({
    queryKey: ['/api/chats'],
    enabled: !!user,
  });

  const updateChatMutation = useMutation({
    mutationFn: async ({ chatId, updates }: { chatId: string; updates: Partial<Chat> }) => {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update chat');
      return response.json();
    },
    onMutate: async ({ chatId, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/chats'] });
      const previousChats = queryClient.getQueryData<Chat[]>(['/api/chats']);
      queryClient.setQueryData<Chat[]>(['/api/chats'], (old) =>
        old?.map((chat) => (chat.id === chatId ? { ...chat, ...updates } : chat))
      );
      return { previousChats };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousChats) {
        queryClient.setQueryData(['/api/chats'], context.previousChats);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
    },
  });

  const deleteChatMutation = useMutation({
    mutationFn: async (chatId: string) => {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete chat');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      setLocation('/app/chats');
      toast({ title: "Chat deleted", description: "The conversation has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete chat", variant: "destructive" });
    },
  });

  const handleDeleteChat = () => {
    if (!selectedChat) return;
    if (confirm(`Are you sure you want to delete the conversation with ${selectedChat.name}? This cannot be undone.`)) {
      deleteChatMutation.mutate(selectedChat.id);
    }
  };

  const selectedChatId = params?.id;
  const selectedChat = chats.find(c => c.id === selectedChatId);

  const sortedChats = useMemo(() => {
    return [...chats].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      return a.id.localeCompare(b.id);
    });
  }, [chats]);

  const filteredChats = sortedChats.filter(chat => 
    chat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chat.lastMessage.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleUpdateChat = (updates: Partial<Chat>) => {
    if (!selectedChat) return;
    updateChatMutation.mutate({ chatId: selectedChat.id, updates });
  };

  const updateTag = (tag: string) => handleUpdateChat({ tag });
  const updatePipeline = (stage: string) => handleUpdateChat({ pipelineStage: stage });
  const updateFollowUp = (followUp: FollowUp) => {
    const followUpDate = followUp ? calculateFollowUpDate(followUp) : null;
    handleUpdateChat({ followUp, followUpDate });
  };

  const calculateFollowUpDate = (followUp: string): string => {
    const now = new Date();
    switch (followUp) {
      case 'Tomorrow':
        now.setDate(now.getDate() + 1);
        break;
      case '3 days':
        now.setDate(now.getDate() + 3);
        break;
      case '1 week':
        now.setDate(now.getDate() + 7);
        break;
    }
    return now.toISOString();
  };

  const [newMessage, setNewMessage] = useState("");
  const [localNotes, setLocalNotes] = useState("");

  useEffect(() => {
    setLocalNotes(selectedChat?.notes || "");
  }, [selectedChat?.id, selectedChat?.notes]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;
    
    if (!canSendMessages) {
      setUpgradeReason("free_reply");
      setUpgradeModalOpen(true);
      return;
    }
    
    if (isAtLimit) {
      setUpgradeReason("conversation_limit");
      setUpgradeModalOpen(true);
      return;
    }

    try {
      const response = await fetch(`/api/chats/${selectedChat.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: newMessage }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.code === "PLAN_LIMIT") {
          setUpgradeReason("free_reply");
          setUpgradeModalOpen(true);
          return;
        }
        if (data.code === "CONVERSATION_LIMIT") {
          setUpgradeReason("conversation_limit");
          setUpgradeModalOpen(true);
          return;
        }
        if (data.code === "THROTTLED") {
          toast({
            title: "Message limit reached",
            description: data.error || "This conversation has too many messages. Please wait for the 24-hour window to reset.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(data.error || "Failed to send message");
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
      setNewMessage("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="text-gray-400">Loading chats...</div>
      </div>
    );
  }

  if (!isTwilioConnected) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="max-w-md text-center p-8">
          <div className="mx-auto h-16 w-16 rounded-full bg-orange-100 flex items-center justify-center mb-6">
            <AlertTriangle className="h-8 w-8 text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">WhatsApp Not Connected</h2>
          <p className="text-gray-500 mb-6">
            You need to connect your Twilio account before you can send or receive WhatsApp messages.
          </p>
          <Link href="/app/settings">
            <Button className="bg-brand-green hover:bg-brand-green/90" data-testid="button-go-to-settings">
              <Settings className="h-4 w-4 mr-2" />
              Connect WhatsApp in Settings
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      {/* Chat List */}
      <div className={cn(
        "w-full md:w-[380px] flex flex-col border-r border-gray-200 bg-white",
        selectedChatId ? "hidden md:flex" : "flex"
      )}>
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
             <h2 className="font-display font-bold text-xl text-gray-900">Chats</h2>
             <div className="flex gap-2">
               <button className="p-2 hover:bg-gray-200 rounded-full text-gray-600">
                 <MoreVertical className="h-5 w-5" />
               </button>
             </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search or start new chat"
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-chats"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
           {filteredChats.length === 0 ? (
             <div className="p-8 text-center text-gray-500">
               <p>No chats available</p>
             </div>
           ) : (
             filteredChats.map(chat => (
               <ChatListItem 
                 key={chat.id} 
                 chat={chat as any} 
                 isActive={chat.id === selectedChatId} 
               />
             ))
           )}
        </div>
      </div>

      {/* Chat Detail + CRM Panel */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col md:flex-row h-full min-w-0 bg-[#efeae2]">
           {/* Chat Conversation Area */}
           <div className="flex-1 flex flex-col min-w-0 h-full relative">
              {/* Header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-3">
                   <button onClick={() => setLocation('/app/chats')} className="md:hidden">
                     <span className="text-2xl mr-2">←</span>
                   </button>
                   {selectedChat.avatar?.startsWith('http') ? (
                     <img 
                       src={selectedChat.avatar} 
                       alt={selectedChat.name} 
                       className="h-10 w-10 rounded-full object-cover"
                     />
                   ) : (
                     <div className="h-10 w-10 rounded-full bg-brand-green/10 flex items-center justify-center text-brand-green font-semibold">
                       {selectedChat.avatar}
                     </div>
                   )}
                   <div>
                     <h3 className="font-semibold text-gray-900">{selectedChat.name}</h3>
                     <span className="text-xs text-gray-500">last seen today at 10:45 AM</span>
                   </div>
                 </div>
                 <div className="flex items-center gap-4 text-gray-500">
                    <Search className="h-5 w-5 cursor-pointer hover:text-gray-700 hidden sm:block" />
                    <MoreVertical className="h-5 w-5 cursor-pointer hover:text-gray-700" />
                 </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 relative" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', backgroundSize: '400px' }}>
                <div className="absolute inset-0 bg-[#efeae2]/90 pointer-events-none" />
                
                <div className="relative z-10 space-y-4">
                  {(selectedChat.messages || []).length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <p>No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    (selectedChat.messages || []).map((msg: any) => (
                      <div 
                        key={msg.id} 
                        className={cn(
                          "flex", 
                          msg.sender === 'me' ? "justify-end" : "justify-start"
                        )}
                      >
                        <div className={cn(
                          "max-w-[85%] md:max-w-[65%] rounded-lg px-3 py-2 text-sm shadow-sm relative",
                          msg.sender === 'me' 
                            ? "bg-[#d9fdd3] text-gray-900 rounded-tr-none" 
                            : "bg-white text-gray-900 rounded-tl-none"
                        )}>
                          <p>{msg.text}</p>
                          <span className="text-[10px] text-gray-500 block text-right mt-1 opacity-70">
                            {msg.time}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Input Area */}
              <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center gap-3 shrink-0">
                 <div className="flex gap-4 text-gray-500">
                    <Smile className="h-6 w-6 cursor-pointer hover:text-gray-700" />
                    <Paperclip className="h-6 w-6 cursor-pointer hover:text-gray-700" />
                 </div>
                 <input 
                   type="text" 
                   placeholder="Type a message" 
                   className="flex-1 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-brand-green"
                   value={newMessage}
                   onChange={(e) => setNewMessage(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                   data-testid="input-message"
                 />
                 <button 
                   onClick={handleSendMessage}
                   className="h-10 w-10 bg-brand-green hover:bg-green-600 rounded-full flex items-center justify-center text-white transition-colors shadow-sm"
                   data-testid="button-send-message"
                 >
                   <Send className="h-5 w-5 ml-0.5" />
                 </button>
              </div>
           </div>

           {/* CRM Sidebar Panel */}
           <div className="w-full md:w-[320px] bg-white border-l border-gray-200 overflow-y-auto shrink-0 flex flex-col shadow-xl md:shadow-none z-10">
              <div className="p-5 border-b border-gray-100">
                 <h3 className="font-display font-bold text-gray-900 mb-4">Lead Details</h3>
                 
                 <div className="mb-6">
                   <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Pipeline Stage</label>
                   <Select value={selectedChat.pipelineStage} onValueChange={updatePipeline}>
                      <SelectTrigger className="w-full bg-gray-50 border-gray-200" data-testid="select-pipeline">
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {PIPELINE_STAGES.map(stage => (
                          <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                        ))}
                      </SelectContent>
                   </Select>
                 </div>

                 <div className="mb-6">
                   <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Status Tag</label>
                   <div className="flex flex-wrap gap-2">
                     {Object.keys(TAG_COLORS).map((tag) => (
                       <button
                         key={tag}
                         onClick={() => updateTag(tag)}
                         className={cn(
                           "text-xs px-2.5 py-1 rounded-full border transition-all",
                           selectedChat.tag === tag 
                             ? TAG_COLORS[tag as keyof typeof TAG_COLORS] + " ring-1 ring-offset-1 ring-gray-300"
                             : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                         )}
                         data-testid={`button-tag-${tag.toLowerCase()}`}
                       >
                         {tag}
                       </button>
                     ))}
                   </div>
                 </div>

                 <div className="mb-6">
                   <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Follow-up Reminder</label>
                   <div className="grid grid-cols-3 gap-2">
                      {(['Tomorrow', '3 days', '1 week'] as const).map((time) => (
                        <button
                          key={time}
                          onClick={() => updateFollowUp(selectedChat.followUp === time ? null : time)}
                          className={cn(
                            "text-xs py-2 rounded-lg border text-center transition-colors flex flex-col items-center justify-center gap-1",
                            selectedChat.followUp === time
                              ? "bg-brand-green/10 text-brand-green border-brand-green font-medium"
                              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                          )}
                          data-testid={`button-followup-${time.replace(' ', '-').toLowerCase()}`}
                        >
                          <Clock className="h-3 w-3" />
                          {time}
                        </button>
                      ))}
                   </div>
                 </div>

                 <div className="mb-6">
                   <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Notes</label>
                   <textarea 
                     className="w-full h-32 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-yellow-400 resize-none"
                     placeholder="Add a note..."
                     value={localNotes}
                     onChange={(e) => setLocalNotes(e.target.value)}
                     onBlur={() => handleUpdateChat({ notes: localNotes })}
                     data-testid="textarea-notes"
                   />
                 </div>
              </div>

              <div className="p-5 mt-auto bg-gray-50">
                <Button 
                  variant="outline" 
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
                  onClick={handleDeleteChat}
                  disabled={deleteChatMutation.isPending}
                  data-testid="button-delete-chat"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleteChatMutation.isPending ? "Deleting..." : "Delete Chat"}
                </Button>
              </div>
           </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 bg-[#efeae2] items-center justify-center flex-col text-center p-8 border-b-8 border-brand-green relative overflow-hidden">
           <div className="max-w-md bg-white p-8 rounded-2xl shadow-sm z-10">
             <div className="h-16 w-16 bg-brand-green/10 rounded-full flex items-center justify-center mx-auto mb-6">
               <Smartphone className="h-8 w-8 text-brand-green" />
             </div>
             <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">WhatsApp Web CRM</h2>
             <p className="text-gray-500 mb-6">Select a chat to view details, manage pipeline stages, and set follow-up reminders.</p>
             <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
               <div className="h-2 w-2 rounded-full bg-gray-300" />
               <span>End-to-end encrypted</span>
             </div>
           </div>
           
           <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', backgroundSize: '400px' }} />
        </div>
      )}
      
      <UpgradeModal
        open={upgradeModalOpen}
        onOpenChange={setUpgradeModalOpen}
        reason={upgradeReason}
        currentPlan={subscription?.limits?.plan}
      />
    </div>
  );
}
