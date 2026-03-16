import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { ChatListItem } from "@/components/ChatListItem";
import { TAG_COLORS, PIPELINE_STAGES } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePresence } from "@/lib/usePresence";
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
  Settings,
  Play,
  X,
  Users,
  User,
  UserCheck,
  CheckCircle2,
  Calendar as CalendarIcon,
  Image as ImageIcon,
  FileText,
  Download,
  Loader2,
  Sparkles,
  Brain,
  RefreshCw,
  Edit,
  History
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { DEMO_CHATS, type DemoChat } from "@/lib/demo-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UpgradeModal, type UpgradeReason, type ConversationLimitInfo } from "@/components/UpgradeModal";
import { useSubscription } from "@/lib/subscription-context";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { ChatAvatar } from "@/components/ChatAvatar";

interface TeamMember {
  id: string;
  ownerId: string;
  memberId: string | null;
  email: string;
  name: string | null;
  role: string;
  status: string;
}

interface Chat {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  whatsappPhone?: string | null;
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
  status?: string;
  assignedTo?: string | null;
}

type FollowUp = 'Tomorrow' | '3 days' | '1 week' | null;

const CHAT_STATUSES = [
  { value: "open", label: "Open", color: "bg-blue-100 text-blue-700" },
  { value: "pending", label: "Pending", color: "bg-slate-100 text-slate-700" },
  { value: "resolved", label: "Resolved", color: "bg-emerald-100 text-emerald-700" },
  { value: "closed", label: "Closed", color: "bg-gray-100 text-gray-700" },
];

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
  const [upgradeLimitInfo, setUpgradeLimitInfo] = useState<ConversationLimitInfo | undefined>();
  const [demoMode, setDemoMode] = useState(false);
  const [demoChats, setDemoChats] = useState<DemoChat[]>(DEMO_CHATS);
  const [viewMode, setViewMode] = useState<"my" | "team">("my");
  const [conversationSearch, setConversationSearch] = useState("");
  const [showConversationSearch, setShowConversationSearch] = useState(false);
  
  // AI Suggestion state
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiSuggestionLoading, setAiSuggestionLoading] = useState(false);
  const [showAiSuggestion, setShowAiSuggestion] = useState(false);
  const [aiTone, setAiTone] = useState<"neutral" | "friendly" | "professional" | "sales">("neutral");
  const [aiLanguage, setAiLanguage] = useState<"auto" | "en" | "he" | "es" | "ar">("auto");
  const [leadUpdateHint, setLeadUpdateHint] = useState(false);
  
  // Contact menu state (Edit, Timeline, Delete)
  const [showEditChat, setShowEditChat] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editChatForm, setEditChatForm] = useState({ name: "", whatsappPhone: "" });
  
  const selectedChatId = match ? params?.id : null;
  const { viewers, setTyping } = usePresence(selectedChatId);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const canSendMessages = subscription?.limits?.canSendMessages ?? false;
  const isAtLimit = subscription?.limits?.isAtLimit ?? false;
  const hasTeamInbox = subscription?.limits?.teamInbox ?? false;
  const hasAssignment = subscription?.limits?.assignmentEnabled ?? false;

  const { data: twilioStatus, isLoading: isTwilioLoading } = useQuery<{ connected: boolean; whatsappNumber: string | null }>({
    queryKey: ["/api/twilio/status"],
    enabled: !!user,
  });

  const { data: metaStatus, isLoading: isMetaLoading } = useQuery<{ connected: boolean; phoneNumber: string | null }>({
    queryKey: ["/api/meta/status"],
    enabled: !!user,
  });

  const isProviderStatusLoading = isTwilioLoading || isMetaLoading;
  const isTwilioConnected = twilioStatus?.connected ?? false;
  const isMetaConnected = metaStatus?.connected ?? false;
  const isAnyProviderConnected = isTwilioConnected || isMetaConnected;

  const { data: chats = [], isLoading } = useQuery<Chat[]>({
    queryKey: ['/api/chats'],
    enabled: !!user && viewMode === "my",
  });

  const { data: teamChats = [] } = useQuery<Chat[]>({
    queryKey: ['/api/chats/team'],
    enabled: !!user && viewMode === "team" && hasTeamInbox,
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
    enabled: !!user && hasAssignment,
  });

  // Check plan levels for AI access
  const plan = subscription?.limits?.plan || "free";
  const isPro = plan === "pro" || plan === "enterprise";
  const isStarter = plan === "starter";
  const hasAIAssist = isStarter || isPro;
  // Get add-on status from subscription data (checked via Stripe)
  const hasAIBrainAddon = (subscription?.limits as any)?.hasAIBrainAddon ?? false;
  const hasFullAIBrain = hasAIBrainAddon && hasAIAssist;
  
  const { data: aiSettings } = useQuery({
    queryKey: ["/api/ai/settings"],
    enabled: !!user && (hasAIAssist || hasFullAIBrain),
  });
  
  const aiEnabled = (hasAIAssist || hasFullAIBrain) && (hasFullAIBrain ? (aiSettings && (aiSettings as any).aiMode !== "off") : true);
  
  // Timeline interface and query
  interface TimelineEvent {
    id: string;
    eventType: string;
    eventData: Record<string, unknown>;
    actorType?: string;
    actorId?: string;
    createdAt: string;
  }
  
  const { data: timeline = [] } = useQuery<TimelineEvent[]>({
    queryKey: ["/api/chats", selectedChatId, "timeline"],
    enabled: !!selectedChatId && showTimeline,
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

  const assignChatMutation = useMutation({
    mutationFn: async ({ chatId, assignedTo, status }: { chatId: string; assignedTo?: string | null; status?: string }) => {
      const response = await fetch(`/api/chats/${chatId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ assignedTo, status }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to assign chat');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats/team'] });
      toast({ title: "Updated", description: "Chat assignment updated." });
    },
    onError: (error: Error) => {
      if (error.message.includes("Pro")) {
        setUpgradeReason("add_automation");
        setUpgradeModalOpen(true);
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const handleDeleteChat = () => {
    if (!selectedChat) return;
    if (confirm(`Are you sure you want to delete the conversation with ${selectedChat.name}? This cannot be undone.`)) {
      if (demoMode) {
        setDemoChats(prev => prev.filter(chat => chat.id !== selectedChat.id));
        setLocation('/app/chats');
        toast({ title: "Chat deleted", description: "The demo conversation has been removed." });
        return;
      }
      deleteChatMutation.mutate(selectedChat.id);
    }
  };

  const activeChats = viewMode === "team" ? teamChats : chats;
  const selectedChat = useMemo(() => {
    const chatsToSearch = demoMode ? demoChats : activeChats;
    return chatsToSearch.find(c => String(c.id) === String(selectedChatId));
  }, [demoMode, demoChats, activeChats, selectedChatId]);

  // Client-side cooldown for AI suggestions (3 seconds)
  const [aiCooldown, setAiCooldown] = useState(false);
  
  // Get AI suggestion for current conversation
  const fetchAiSuggestion = useCallback(async () => {
    if (!selectedChat || !aiEnabled || demoMode || aiCooldown) return;
    
    setAiSuggestionLoading(true);
    setShowAiSuggestion(true);
    setAiCooldown(true);
    setAiSuggestion(null); // Clear previous suggestion immediately
    
    // Reset cooldown after 3 seconds
    setTimeout(() => setAiCooldown(false), 3000);
    
    try {
      const conversationHistory = selectedChat.messages.slice(-10).map((msg: any) => ({
        role: msg.direction === 'incoming' ? 'user' : 'assistant',
        content: msg.text || ''
      }));
      
      const response = await fetch('/api/ai/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          chatId: selectedChat.id,
          conversationHistory,
          tone: aiTone,
          ...(aiLanguage !== 'auto' ? { language: aiLanguage } : {})
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setAiSuggestion(data.suggestion || null);
        
        // Silently extract lead data in background
        extractLeadData(selectedChat.id, conversationHistory);
      } else {
        setAiSuggestion(null);
        const errorData = await response.json();
        if (errorData.status === "paused" || errorData.status === "limited") {
          toast({
            title: "AI Limited",
            description: errorData.error || "AI assistance is temporarily limited.",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error("AI suggestion error:", error);
      setAiSuggestion(null);
    } finally {
      setAiSuggestionLoading(false);
    }
  }, [selectedChat, aiEnabled, demoMode, toast, aiCooldown, aiTone, aiLanguage]);
  
  // Silent lead extraction with frequency limiting
  const lastExtractionRef = useRef<Record<string, number>>({});
  
  const extractLeadData = useCallback(async (chatId: string, conversationHistory: any[]) => {
    // Optimization: Only extract every 3 messages per chat to save costs
    const lastCount = lastExtractionRef.current[chatId] || 0;
    if (conversationHistory.length > 0 && conversationHistory.length - lastCount < 3) {
      return;
    }
    lastExtractionRef.current[chatId] = conversationHistory.length;

    try {
      const response = await fetch('/api/ai/extract-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chatId, conversationHistory })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Only show hint if we actually extracted meaningful data
        if (data.name || data.email || data.phone || data.budget) {
          setLeadUpdateHint(true);
          setTimeout(() => setLeadUpdateHint(false), 3000);
        }
      }
    } catch (error) {
      // Silently fail - lead extraction is secondary
      console.error("Lead extraction error:", error);
    }
  }, []);

  // Use AI suggestion
  const useAiSuggestion = useCallback(() => {
    if (aiSuggestion) {
      setNewMessage(aiSuggestion);
      setShowAiSuggestion(false);
      setAiSuggestion(null);
    }
  }, [aiSuggestion]);

  const sortedChats = useMemo(() => {
    const chatsToSort = demoMode ? demoChats : activeChats;
    return [...chatsToSort].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      return a.id.localeCompare(b.id);
    });
  }, [activeChats, demoChats, demoMode]);

  const filteredChats = sortedChats.filter(chat => 
    chat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chat.lastMessage.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleUpdateChat = (updates: Partial<Chat>) => {
    if (!selectedChat) return;
    
    if (demoMode) {
      setDemoChats(prev => prev.map(chat => 
        chat.id === selectedChat.id ? { ...chat, ...updates } : chat
      ));
      return;
    }
    
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
  const [mobileCalendarOpen, setMobileCalendarOpen] = useState(false);
  const [desktopCalendarOpen, setDesktopCalendarOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setNewMessage(prev => prev + emojiData.emoji);
    setEmojiPickerOpen(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 16 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 16MB",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setFilePreview(e.target?.result as string);
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null);
      }
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendMedia = async () => {
    if (!selectedFile || !selectedChat) return;
    
    if (demoMode) {
      const newMsg = {
        id: `demo-msg-${Date.now()}`,
        text: `[${selectedFile.type.startsWith('image/') ? 'Image' : 'File'}: ${selectedFile.name}]`,
        sender: "me",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mediaUrl: filePreview || undefined,
        mediaType: selectedFile.type.startsWith('image/') ? 'image' : 'document',
      };
      setDemoChats(prev => prev.map(chat => 
        chat.id === selectedChat.id 
          ? { 
              ...chat, 
              messages: [...chat.messages, newMsg],
              lastMessage: `[${selectedFile.type.startsWith('image/') ? 'Image' : 'File'}]`,
              time: "Just now"
            } 
          : chat
      ));
      clearSelectedFile();
      toast({
        title: "Media sent",
        description: "Your file has been sent (demo mode)",
      });
      return;
    }

    if (!selectedChat.whatsappPhone) {
      toast({
        title: "Cannot send",
        description: "No WhatsApp phone number linked to this chat",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('chatId', selectedChat.id);
      formData.append('phone', selectedChat.whatsappPhone);

      const response = await fetch('/api/chats/send-media', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send media');
      }

      clearSelectedFile();
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      toast({
        title: "Media sent",
        description: "Your file has been sent via WhatsApp",
      });
    } catch (error: any) {
      toast({
        title: "Failed to send",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploadingFile(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  };

  useEffect(() => {
    setLocalNotes(selectedChat?.notes || "");
    setConversationSearch("");
    setShowConversationSearch(false);
  }, [selectedChat?.id, selectedChat?.notes]);

  useEffect(() => {
    const timer = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timer);
  }, [selectedChat?.messages?.length, selectedChat?.id]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;
    
    if (demoMode) {
      const newMsg = {
        id: `demo-msg-${Date.now()}`,
        text: newMessage,
        sender: "me",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setDemoChats(prev => prev.map(chat => 
        chat.id === selectedChat.id 
          ? { 
              ...chat, 
              messages: [...chat.messages, newMsg],
              lastMessage: newMessage,
              time: "Just now"
            } 
          : chat
      ));
      setNewMessage("");
      toast({
        title: "Demo Mode",
        description: "Message simulated. Connect a WhatsApp provider to send real messages.",
      });
      return;
    }
    
    if (!canSendMessages) {
      setUpgradeReason("free_reply");
      setUpgradeModalOpen(true);
      return;
    }
    
    if (isAtLimit) {
      setUpgradeReason("conversation_limit");
      if (subscription?.limits) {
        setUpgradeLimitInfo({ 
          limit: subscription.limits.conversationsLimit, 
          used: subscription.limits.conversationsUsed, 
          planName: subscription.limits.planName,
          resetDate: subscription.subscription?.currentPeriodEnd || null,
        });
      }
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
          if (data.limit && data.used && data.planName) {
            setUpgradeLimitInfo({ 
              limit: data.limit, 
              used: data.used, 
              planName: data.planName,
              resetDate: subscription?.subscription?.currentPeriodEnd || null,
            });
          }
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

  if (isLoading || isProviderStatusLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="text-gray-400">Loading chats...</div>
      </div>
    );
  }

  if (!isAnyProviderConnected && !demoMode) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="max-w-md text-center p-8">
          <div className="mx-auto h-16 w-16 rounded-full bg-orange-100 flex items-center justify-center mb-6">
            <AlertTriangle className="h-8 w-8 text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">WhatsApp Not Connected</h2>
          <p className="text-gray-500 mb-6">
            Connect your WhatsApp account to send and receive messages.
          </p>
          <Link href="/app/settings">
            <Button className="w-full bg-brand-green hover:bg-brand-green/90" data-testid="button-go-to-settings">
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
      {/* Demo Mode Banner */}
      {demoMode && (
        <div className="fixed top-0 left-0 right-0 bg-slate-600 text-white px-4 py-2 flex items-center justify-between z-50">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            <span className="text-sm font-medium">Demo Mode - Explore with sample data</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/app/settings">
              <Button size="sm" variant="secondary" className="h-7 text-xs bg-white text-slate-600 hover:bg-slate-50">
                <Settings className="h-3 w-3 mr-1" />
                Connect WhatsApp
              </Button>
            </Link>
            <button 
              onClick={() => {
                setDemoMode(false);
                setDemoChats(DEMO_CHATS);
                setLocation('/app/chats');
              }}
              className="p-1 hover:bg-slate-700 rounded"
              data-testid="button-exit-demo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      
      {/* Chat List */}
      <div className={cn(
        "w-full md:w-[280px] lg:w-[300px] flex flex-col border-r border-gray-200 bg-white",
        selectedChatId ? "hidden md:flex" : "flex",
        demoMode && "pt-10"
      )}>
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex justify-between items-center mb-3">
             <h2 className="font-display font-bold text-xl text-gray-900">
               {viewMode === "team" ? "Team Inbox" : "Chats"}
             </h2>
             <div className="flex gap-2">
               <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <button className="p-2 hover:bg-gray-200 rounded-full text-gray-600" data-testid="button-chat-menu">
                     <MoreVertical className="h-5 w-5" />
                   </button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent align="end">
                   <DropdownMenuItem 
                     onClick={async () => {
                       try {
                         const res = await fetch('/api/chats/export', { credentials: 'include' });
                         if (!res.ok) throw new Error('Export failed');
                         const blob = await res.blob();
                         const url = URL.createObjectURL(blob);
                         const a = document.createElement('a');
                         a.href = url;
                         a.download = `chats-export-${new Date().toISOString().split('T')[0]}.csv`;
                         a.click();
                         URL.revokeObjectURL(url);
                         toast({ title: "Export complete", description: "Your contacts have been downloaded" });
                       } catch (err) {
                         toast({ title: "Export failed", description: "Could not export contacts", variant: "destructive" });
                       }
                     }}
                     data-testid="menu-export-csv"
                   >
                     <Download className="h-4 w-4 mr-2" />
                     Export to CSV
                   </DropdownMenuItem>
                 </DropdownMenuContent>
               </DropdownMenu>
             </div>
          </div>
          
          {/* Team Inbox Toggle */}
          {hasTeamInbox && (
            <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode("my")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-sm font-medium transition-colors",
                  viewMode === "my" 
                    ? "bg-white text-gray-900 shadow-sm" 
                    : "text-gray-500 hover:text-gray-700"
                )}
                data-testid="button-my-chats"
              >
                <User className="h-4 w-4" />
                My Chats
              </button>
              <button
                onClick={() => setViewMode("team")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-sm font-medium transition-colors",
                  viewMode === "team" 
                    ? "bg-white text-gray-900 shadow-sm" 
                    : "text-gray-500 hover:text-gray-700"
                )}
                data-testid="button-team-inbox"
              >
                <Users className="h-4 w-4" />
                Team Inbox
              </button>
            </div>
          )}
          
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
        <div className={cn(
          "flex-1 flex flex-col md:flex-row h-full min-w-0 bg-[#efeae2] overflow-hidden",
          selectedChatId ? "flex" : "hidden md:flex",
          demoMode && "pt-10"
        )}>
           {/* Chat Conversation Area */}
           <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
              {/* Header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 shrink-0">
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-3">
                     <button onClick={() => setLocation('/app/chats')} className="md:hidden">
                       <span className="text-2xl mr-2">←</span>
                     </button>
                     <ChatAvatar src={selectedChat.avatar} name={selectedChat.name} size="md" />
                     <div>
                       <h3 className="font-semibold text-gray-900">{selectedChat.name}</h3>
                       {viewers.length > 0 ? (
                         <div className="flex items-center gap-1">
                           <span className="relative flex h-2 w-2">
                             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                             <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                           </span>
                           <span className="text-xs text-amber-600">
                             {viewers.some(v => v.isTyping) 
                               ? `${viewers.find(v => v.isTyping)?.userName} is typing...`
                               : `${viewers.map(v => v.userName).join(', ')} viewing`}
                           </span>
                         </div>
                       ) : (
                         <span className="text-xs text-gray-500">last seen today at 10:45 AM</span>
                       )}
                     </div>
                   </div>
                   <div className="flex items-center gap-4 text-gray-500">
                      <Search 
                        className={cn(
                          "h-5 w-5 cursor-pointer hover:text-gray-700",
                          showConversationSearch && "text-brand-green"
                        )}
                        onClick={() => {
                          setShowConversationSearch(!showConversationSearch);
                          if (showConversationSearch) setConversationSearch("");
                        }}
                        data-testid="button-conversation-search"
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 hover:bg-gray-100 rounded" data-testid="button-contact-menu">
                            <MoreVertical className="h-5 w-5 cursor-pointer hover:text-gray-700" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => {
                              if (selectedChat) {
                                setEditChatForm({ 
                                  name: selectedChat.name || "", 
                                  whatsappPhone: (selectedChat as Chat).whatsappPhone || "" 
                                });
                                setShowEditChat(true);
                              }
                            }} 
                            data-testid="menu-edit-contact"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Contact
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setShowTimeline(true)} data-testid="menu-view-timeline">
                            <History className="h-4 w-4 mr-2" />
                            View Timeline
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setShowDeleteConfirm(true)} 
                            className="text-red-600" 
                            data-testid="menu-delete-contact"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Contact
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                   </div>
                 </div>
                 
                 {/* In-conversation search bar */}
                 {showConversationSearch && (
                   <div className="mt-2 relative">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                     <input
                       type="text"
                       placeholder="Search in this conversation..."
                       className="w-full pl-10 pr-10 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green"
                       value={conversationSearch}
                       onChange={(e) => setConversationSearch(e.target.value)}
                       autoFocus
                       data-testid="input-conversation-search"
                     />
                     {conversationSearch && (
                       <button
                         onClick={() => setConversationSearch("")}
                         className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                       >
                         <X className="h-4 w-4" />
                       </button>
                     )}
                   </div>
                 )}
                 
                 {/* Assignment Controls (Pro only) */}
                 {hasAssignment && !demoMode && (
                   <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-200">
                     <div className="flex items-center gap-2">
                       <span className="text-xs text-gray-500">Status:</span>
                       <Select 
                         value={(selectedChat as Chat).status || "open"} 
                         onValueChange={(status) => assignChatMutation.mutate({ chatId: selectedChat.id, status })}
                       >
                         <SelectTrigger className="h-7 text-xs w-[100px]" data-testid="select-chat-status">
                           <SelectValue />
                         </SelectTrigger>
                         <SelectContent>
                           {CHAT_STATUSES.map(s => (
                             <SelectItem key={s.value} value={s.value}>
                               <span className={cn("px-1.5 py-0.5 rounded text-xs", s.color)}>{s.label}</span>
                             </SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                     </div>
                     <div className="flex items-center gap-2">
                       <span className="text-xs text-gray-500">Assigned:</span>
                       <Select 
                         value={(selectedChat as Chat).assignedTo || "unassigned"} 
                         onValueChange={(assignedTo) => assignChatMutation.mutate({ 
                           chatId: selectedChat.id, 
                           assignedTo: assignedTo === "unassigned" ? null : assignedTo 
                         })}
                       >
                         <SelectTrigger className="h-7 text-xs w-[130px]" data-testid="select-chat-assignee">
                           <SelectValue placeholder="Unassigned" />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="unassigned">
                             <span className="flex items-center gap-1.5 text-gray-500">
                               <User className="h-3 w-3" /> Unassigned
                             </span>
                           </SelectItem>
                           {teamMembers.filter(m => m.status === "active").map(member => (
                             <SelectItem key={member.id} value={member.memberId || member.id}>
                               <span className="flex items-center gap-1.5">
                                 <UserCheck className="h-3 w-3 text-emerald-600" />
                                 {member.name || member.email.split("@")[0]}
                               </span>
                             </SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                     </div>
                   </div>
                 )}
              </div>

              {/* Messages Area */}
              <div 
                className="flex-1 overflow-y-auto p-2 sm:p-3 md:p-4 relative min-h-0" 
                style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', backgroundSize: '400px' }}
              >
                <div className="absolute inset-0 bg-[#efeae2]/90 pointer-events-none" />
                
                <div className="relative z-10 space-y-1 sm:space-y-1.5 md:space-y-2">
                  {(selectedChat.messages || []).length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <p>No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    ((selectedChat.messages || []) as any[])
                      .filter((msg) => {
                        const msgText = msg.text || msg.content || '';
                        return !conversationSearch || 
                          msgText.toLowerCase().includes(conversationSearch.toLowerCase());
                      })
                      .map((msg, index: number) => {
                        const msgText = msg.text || msg.content || '';
                        const isFromMe = msg.sender === 'me' || msg.role === 'assistant';
                        
                        const highlightText = (text: string): React.ReactNode => {
                          if (!conversationSearch || !text) return text;
                          const parts = text.split(new RegExp(`(${conversationSearch})`, 'gi'));
                          return (
                            <>
                              {parts.map((part, i) => 
                                part.toLowerCase() === conversationSearch.toLowerCase() 
                                  ? <mark key={i} className="bg-yellow-300 text-gray-900 px-0.5 rounded">{part}</mark>
                                  : <span key={i}>{part}</span>
                              )}
                            </>
                          );
                        };
                        
                        return (
                          <div 
                            key={msg.id || index} 
                            className={cn(
                              "flex", 
                              isFromMe ? "justify-end" : "justify-start"
                            )}
                          >
                            <div className={cn(
                              "max-w-[90%] md:max-w-[75%] rounded-lg shadow-sm relative overflow-hidden",
                              msg.mediaUrl && msg.mediaType === 'image' ? "p-1" : "px-2.5 py-1.5",
                              isFromMe 
                                ? "bg-[#d9fdd3] text-gray-900 rounded-tr-none" 
                                : "bg-white text-gray-900 rounded-tl-none"
                            )}>
                              {msg.mediaUrl && msg.mediaType === 'image' ? (
                                <img 
                                  src={msg.mediaUrl} 
                                  alt="Shared image" 
                                  className="max-w-full rounded cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => window.open(msg.mediaUrl, '_blank')}
                                />
                              ) : msg.mediaType === 'document' ? (
                                <div className="flex items-center gap-2 text-[13px]">
                                  <FileText className="h-5 w-5 text-gray-500" />
                                  <span className="leading-snug">{highlightText(msgText)}</span>
                                </div>
                              ) : (
                                <p className="leading-snug text-[13px]">{highlightText(msgText)}</p>
                              )}
                              <span className="text-[9px] text-gray-500 block text-right mt-0.5 opacity-70">
                                {msg.time || ''}
                              </span>
                            </div>
                          </div>
                        );
                      })
                  )}
                  {conversationSearch && (selectedChat.messages || []).filter((msg: any) => {
                    const msgText = msg.text || msg.content || '';
                    return msgText.toLowerCase().includes(conversationSearch.toLowerCase());
                  }).length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      <p>No messages found for "{conversationSearch}"</p>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* File Preview */}
              {selectedFile && (
                <div className="bg-gray-100 px-4 py-2 border-t border-gray-200 flex items-center gap-3">
                  {filePreview ? (
                    <img src={filePreview} alt="Preview" className="h-16 w-16 object-cover rounded-lg" />
                  ) : (
                    <div className="h-16 w-16 bg-gray-200 rounded-lg flex items-center justify-center">
                      <FileText className="h-8 w-8 text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button 
                    onClick={clearSelectedFile}
                    className="p-1.5 hover:bg-gray-200 rounded-full"
                    data-testid="button-clear-file"
                  >
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                  <button 
                    onClick={handleSendMedia}
                    disabled={isUploadingFile}
                    className="h-10 px-4 bg-brand-green hover:bg-emerald-700 rounded-lg flex items-center justify-center text-white text-sm font-medium transition-colors disabled:opacity-50"
                    data-testid="button-send-file"
                  >
                    {isUploadingFile ? "Sending..." : "Send"}
                  </button>
                </div>
              )}

              {/* AI Suggestion Panel */}
              {aiEnabled && showAiSuggestion && (
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-4 py-3 border-t border-purple-100">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-purple-700">AI Suggestion</span>
                          {leadUpdateHint && (
                            <span className="text-xs text-emerald-600 animate-pulse">Lead details updated</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Language selector */}
                          <select
                            value={aiLanguage}
                            onChange={(e) => setAiLanguage(e.target.value as typeof aiLanguage)}
                            className="text-xs px-2 py-1 rounded border border-purple-200 bg-white text-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-300"
                            data-testid="select-ai-language"
                          >
                            <option value="auto">Auto</option>
                            <option value="en">English</option>
                            <option value="he">עברית</option>
                            <option value="es">Español</option>
                            <option value="ar">العربية</option>
                          </select>
                          {/* Tone selector */}
                          <select
                            value={aiTone}
                            onChange={(e) => setAiTone(e.target.value as typeof aiTone)}
                            className="text-xs px-2 py-1 rounded border border-purple-200 bg-white text-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-300"
                            data-testid="select-ai-tone"
                          >
                            <option value="neutral">Neutral</option>
                            <option value="friendly">Friendly</option>
                            <option value="professional">Professional</option>
                            <option value="sales">Sales-focused</option>
                          </select>
                          <button
                            onClick={() => setShowAiSuggestion(false)}
                            className="text-gray-400 hover:text-gray-600"
                            data-testid="button-dismiss-ai"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      {aiSuggestionLoading ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-purple-600 font-medium">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Thinking...</span>
                          </div>
                          <div className="space-y-2">
                            <div className="h-2 bg-purple-100 rounded animate-pulse w-3/4" />
                            <div className="h-2 bg-purple-100 rounded animate-pulse w-1/2" />
                          </div>
                        </div>
                      ) : aiSuggestion ? (
                        <div>
                          <p className="text-sm text-gray-700 mb-2">{aiSuggestion}</p>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex gap-2">
                              <button
                                onClick={useAiSuggestion}
                                className="text-xs px-3 py-1 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors"
                                data-testid="button-use-ai-suggestion"
                              >
                                Use this reply
                              </button>
                              <button
                                onClick={fetchAiSuggestion}
                                disabled={aiCooldown}
                                className="text-xs px-3 py-1 bg-white text-purple-600 border border-purple-200 rounded-full hover:bg-purple-50 transition-colors flex items-center gap-1 disabled:opacity-50"
                                data-testid="button-regenerate-ai"
                              >
                                <RefreshCw className={cn("w-3 h-3", aiCooldown && "animate-spin")} />
                                {aiCooldown ? "Wait..." : "Regenerate"}
                              </button>
                            </div>
                            <a 
                              href="/pricing" 
                              className="text-[10px] text-purple-500 hover:text-purple-700 hover:underline"
                            >
                              {hasFullAIBrain ? "Full AI Brain Active" : "Powered by AI Assist – Upgrade to Full AI Brain ($29/mo)"}
                            </a>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No suggestion available. Try again later.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Input Area */}
              <div className="bg-gray-50 px-2 sm:px-4 py-2 sm:py-3 border-t border-gray-200 flex items-center gap-2 sm:gap-3 shrink-0">
                 <div className="hidden sm:flex gap-4 text-gray-500">
                    {/* AI Suggestion Button */}
                    {aiEnabled && !showAiSuggestion && (
                      <button
                        onClick={fetchAiSuggestion}
                        disabled={aiCooldown}
                        className={cn(
                          "text-purple-500 hover:text-purple-600 disabled:opacity-50",
                          aiCooldown && "cursor-not-allowed"
                        )}
                        title={aiCooldown ? "Please wait..." : "Get AI suggestion"}
                        data-testid="button-ai-suggest"
                      >
                        <Brain className={cn("h-6 w-6", aiCooldown && "animate-pulse")} />
                      </button>
                    )}
                    <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                      <PopoverTrigger asChild>
                        <button className="hover:text-gray-700" data-testid="button-emoji">
                          <Smile className="h-6 w-6 cursor-pointer" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 border-0" align="start" side="top">
                        <EmojiPicker onEmojiClick={handleEmojiClick} />
                      </PopoverContent>
                    </Popover>
                    <button 
                      onClick={() => fileInputRef.current?.click()} 
                      className="hover:text-gray-700"
                      data-testid="button-attach-file"
                    >
                      <Paperclip className="h-6 w-6 cursor-pointer" />
                    </button>
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      className="hidden" 
                      accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                      onChange={handleFileSelect}
                    />
                 </div>
                 <input 
                   type="text" 
                   placeholder="Type a message" 
                   className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 sm:px-4 py-2 text-sm focus:outline-none focus:border-brand-green"
                   value={newMessage}
                   onChange={(e) => {
                     setNewMessage(e.target.value);
                     setTyping(true);
                     if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                     typingTimeoutRef.current = setTimeout(() => setTyping(false), 2000);
                   }}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                       setTyping(false);
                       handleSendMessage();
                     }
                   }}
                   onBlur={() => setTyping(false)}
                   data-testid="input-message"
                 />
                 <button 
                   onClick={handleSendMessage}
                   className="h-10 w-10 bg-brand-green hover:bg-emerald-700 rounded-full flex items-center justify-center text-white transition-colors shadow-sm shrink-0"
                   data-testid="button-send-message"
                 >
                   <Send className="h-5 w-5 ml-0.5" />
                 </button>
              </div>
           </div>

           {/* Mobile Lead Details Panel - Compact version for mobile */}
           <div 
             className="flex md:hidden bg-white border-t border-gray-200 overflow-y-auto max-h-[180px] shrink-0 flex-col"
             data-testid="panel-lead-details-mobile"
           >
              <div className="p-3 space-y-3 bg-brand-green/5">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <UserCheck className="h-4 w-4 text-brand-green" />
                     <h3 className="font-display font-bold text-gray-900 text-sm">Lead Details</h3>
                   </div>
                   <span className={cn("text-xs px-2 py-0.5 rounded-full", TAG_COLORS[selectedChat.tag as keyof typeof TAG_COLORS] || "bg-gray-100 text-gray-600")}>
                     {selectedChat.tag || 'New'}
                   </span>
                 </div>
                 
                 <div className="flex gap-2">
                   <Select value={selectedChat.pipelineStage} onValueChange={updatePipeline}>
                      <SelectTrigger className="flex-1 h-8 text-xs bg-gray-50 border-gray-200">
                        <SelectValue placeholder="Pipeline" />
                      </SelectTrigger>
                      <SelectContent>
                        {PIPELINE_STAGES.map(stage => (
                          <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                        ))}
                      </SelectContent>
                   </Select>
                   <Select value={selectedChat.tag || "New"} onValueChange={updateTag}>
                      <SelectTrigger className="flex-1 h-8 text-xs bg-gray-50 border-gray-200">
                        <SelectValue placeholder="Tag" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(TAG_COLORS).map(tag => (
                          <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                        ))}
                      </SelectContent>
                   </Select>
                 </div>
                 
                 <div className="flex gap-1.5 overflow-x-auto pb-1">
                   {(['Tomorrow', '3 days', '1 week'] as const).map((time) => (
                     <button
                       key={time}
                       onClick={() => updateFollowUp(selectedChat.followUp === time ? null : time)}
                       className={cn(
                         "text-[10px] px-2 py-1 rounded border whitespace-nowrap",
                         selectedChat.followUp === time
                           ? "bg-brand-green/10 text-brand-green border-brand-green"
                           : "bg-white text-gray-600 border-gray-200"
                       )}
                     >
                       {time}
                     </button>
                   ))}
                   <Popover open={mobileCalendarOpen} onOpenChange={setMobileCalendarOpen}>
                     <PopoverTrigger asChild>
                       <button
                         className={cn(
                           "text-[10px] px-2 py-1 rounded border whitespace-nowrap flex items-center gap-1",
                           selectedChat.followUp && !['Tomorrow', '3 days', '1 week'].includes(selectedChat.followUp)
                             ? "bg-brand-green/10 text-brand-green border-brand-green"
                             : "bg-white text-gray-600 border-gray-200"
                         )}
                       >
                         <CalendarIcon className="h-3 w-3" />
                         Custom
                       </button>
                     </PopoverTrigger>
                     <PopoverContent className="w-auto p-0" align="start">
                       <Calendar
                         mode="single"
                         selected={selectedChat.followUpDate ? new Date(selectedChat.followUpDate) : undefined}
                         onSelect={(date) => {
                           if (date) {
                             const formatted = format(date, 'MMM d');
                             handleUpdateChat({ 
                               followUp: formatted,
                               followUpDate: date.toISOString()
                             });
                             setMobileCalendarOpen(false);
                           }
                         }}
                         disabled={(date) => date < new Date()}
                         initialFocus
                       />
                     </PopoverContent>
                   </Popover>
                   {selectedChat.followUp && (
                     <button 
                       onClick={() => updateFollowUp(null)}
                       className="text-[10px] px-2 py-1 text-red-500 border border-red-200 rounded"
                     >
                       Clear
                     </button>
                   )}
                 </div>
                 
                 <textarea 
                   className="w-full h-16 bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-gray-700 focus:outline-none resize-none"
                   placeholder="Add notes..."
                   value={localNotes}
                   onChange={(e) => setLocalNotes(e.target.value)}
                   onBlur={() => handleUpdateChat({ notes: localNotes })}
                 />
              </div>
           </div>

           {/* Desktop CRM Sidebar Panel */}
           <div 
             className="hidden md:flex w-[320px] bg-white border-l border-gray-200 overflow-y-auto shrink-0 flex-col shadow-xl md:shadow-none z-10"
             data-testid="panel-lead-details"
           >
              <div className="p-5 border-b border-gray-100 bg-brand-green/5">
                 <div className="flex items-center gap-2 mb-4">
                   <UserCheck className="h-5 w-5 text-brand-green" />
                   <h3 className="font-display font-bold text-gray-900">Lead Details</h3>
                 </div>
                 
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
                   <div className="grid grid-cols-4 gap-2">
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
                      <Popover open={desktopCalendarOpen} onOpenChange={setDesktopCalendarOpen}>
                        <PopoverTrigger asChild>
                          <button
                            className={cn(
                              "text-xs py-2 rounded-lg border text-center transition-colors flex flex-col items-center justify-center gap-1",
                              selectedChat.followUp && !['Tomorrow', '3 days', '1 week'].includes(selectedChat.followUp)
                                ? "bg-brand-green/10 text-brand-green border-brand-green font-medium"
                                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                            )}
                            data-testid="button-followup-custom"
                          >
                            <CalendarIcon className="h-3 w-3" />
                            Custom
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={selectedChat.followUpDate ? new Date(selectedChat.followUpDate) : undefined}
                            onSelect={(date) => {
                              if (date) {
                                const formatted = format(date, 'MMM d');
                                handleUpdateChat({ 
                                  followUp: formatted,
                                  followUpDate: date.toISOString()
                                });
                                setDesktopCalendarOpen(false);
                              }
                            }}
                            disabled={(date) => date < new Date()}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                   </div>
                   {selectedChat.followUp && (
                     <div className="mt-2 flex items-center justify-between text-xs">
                       <span className="text-gray-500">
                         Reminder: <span className="font-medium text-gray-700">{selectedChat.followUp}</span>
                         {selectedChat.followUpDate && (
                           <span className="ml-1 text-gray-400">
                             ({format(new Date(selectedChat.followUpDate), 'MMM d, yyyy')})
                           </span>
                         )}
                       </span>
                       <button 
                         onClick={() => updateFollowUp(null)}
                         className="text-red-500 hover:text-red-700"
                         data-testid="button-clear-followup"
                       >
                         Clear
                       </button>
                     </div>
                   )}
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
                  disabled={!demoMode && deleteChatMutation.isPending}
                  data-testid="button-delete-chat"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {!demoMode && deleteChatMutation.isPending ? "Deleting..." : "Delete Chat"}
                </Button>
              </div>
           </div>
        </div>
      ) : (
        <div className={cn(
          "hidden md:flex flex-1 bg-[#efeae2] items-center justify-center flex-col text-center p-8 border-b-8 border-brand-green relative overflow-hidden",
          demoMode && "pt-18"
        )}>
           <div className="max-w-md bg-white p-8 rounded-2xl shadow-sm z-10">
             <div className="h-16 w-16 bg-brand-green/10 rounded-full flex items-center justify-center mx-auto mb-6">
               <Smartphone className="h-8 w-8 text-brand-green" />
             </div>
             <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">
               {demoMode ? "Demo Mode Active" : "WhatsApp Web CRM"}
             </h2>
             <p className="text-gray-500 mb-6">
               {demoMode 
                 ? "Select a demo chat to explore the CRM features. Try changing tags, pipeline stages, and sending messages!"
                 : "Select a chat to view details, manage pipeline stages, and set follow-up reminders."
               }
             </p>
             <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
               <div className="h-2 w-2 rounded-full bg-gray-300" />
               <span>{demoMode ? "Sample data - no real messages" : "End-to-end encrypted"}</span>
             </div>
           </div>
           
           <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', backgroundSize: '400px' }} />
        </div>
      )}
      
      <UpgradeModal
        open={upgradeModalOpen}
        onOpenChange={(open) => {
          setUpgradeModalOpen(open);
          if (!open) setUpgradeLimitInfo(undefined);
        }}
        reason={upgradeReason}
        currentPlan={subscription?.limits?.plan}
        limitInfo={upgradeLimitInfo}
      />
      
      {/* Edit Chat Dialog */}
      <Dialog open={showEditChat} onOpenChange={setShowEditChat}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editChatForm.name}
                onChange={(e) => setEditChatForm({ ...editChatForm, name: e.target.value })}
                data-testid="input-edit-name"
              />
            </div>
            <div>
              <Label htmlFor="edit-phone">WhatsApp Phone</Label>
              <Input
                id="edit-phone"
                value={editChatForm.whatsappPhone}
                onChange={(e) => setEditChatForm({ ...editChatForm, whatsappPhone: e.target.value })}
                data-testid="input-edit-phone"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEditChat(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (selectedChat) {
                    updateChatMutation.mutate({
                      chatId: selectedChat.id,
                      updates: { 
                        name: editChatForm.name,
                        whatsappPhone: editChatForm.whatsappPhone
                      }
                    });
                    setShowEditChat(false);
                    toast({ title: "Contact updated", description: "Contact details have been saved." });
                  }
                }}
                disabled={updateChatMutation.isPending}
                data-testid="button-save-contact"
              >
                {updateChatMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Timeline Dialog */}
      <Dialog open={showTimeline} onOpenChange={setShowTimeline}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Activity Timeline
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {timeline.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No activity recorded yet</p>
            ) : (
              <div className="space-y-3">
                {timeline.map((event) => {
                  const data = event.eventData as any;
                  let formattedDate = data?.time || "";
                  try {
                    const date = new Date(event.createdAt);
                    if (!isNaN(date.getTime())) {
                      formattedDate = format(date, "MMM d, yyyy 'at' h:mm a");
                    }
                  } catch {
                    // Keep the raw time if date parsing fails
                  }
                  
                  // Format description based on event type
                  let description = "";
                  if (data?.message) {
                    description = data.message;
                  } else if (event.eventType === "message_sent") {
                    description = "You sent a message";
                  } else if (event.eventType === "message_received") {
                    description = "Message received";
                  } else {
                    description = "Activity recorded";
                  }
                  
                  return (
                    <div key={event.id} className="flex gap-3 p-3 bg-slate-50 rounded-lg" data-testid={`timeline-event-${event.id}`}>
                      <div className="w-2 h-2 mt-2 rounded-full bg-primary flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{event.eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
                        <p className="text-sm text-muted-foreground">{description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formattedDate}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Contact</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{selectedChat?.name}</strong>? 
            This will remove all conversations and messages. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (selectedChat) {
                  deleteChatMutation.mutate(selectedChat.id);
                  setShowDeleteConfirm(false);
                }
              }} 
              disabled={deleteChatMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteChatMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
