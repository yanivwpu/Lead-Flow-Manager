import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/lib/subscription-context";
import { AIComposer } from "@/components/AIComposer";
import {
  Search,
  Send,
  User,
  Phone,
  MessageCircle,
  Instagram,
  Facebook,
  Smartphone,
  Globe,
  Video,
  MoreVertical,
  Loader2,
  ChevronDown,
  AlertCircle,
  AlertTriangle,
  UserCheck,
  FileText,
  Trash2,
  History,
  Edit,
  X,
  Zap,
  PanelRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ChatAvatar } from "@/components/ChatAvatar";
import { TAG_COLORS } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";
import { InboxLeadDetailsPanel } from "@/components/InboxLeadDetailsPanel";
import { useAICapabilities } from "@/lib/useAICapabilities";
import { analyzeConversation } from "@/lib/conversationIntelligence";
import type { ContactContext } from "@/components/AIComposer";

type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'sms' | 'webchat' | 'telegram' | 'tiktok';
type FilterTab = 'all' | 'unread' | 'mine';

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  primaryChannel: Channel;
  primaryChannelOverride?: Channel;
  tag: string;
  pipelineStage: string;
  notes?: string;
  followUp?: string | null;
  followUpDate?: string | null;
  assignedTo?: string | null;
  source?: string;
  lastIncomingAt?: string;
  createdAt: string;
  whatsappId?: string;
  instagramId?: string;
  facebookId?: string;
  telegramId?: string;
}

interface Conversation {
  id: string;
  channel: Channel;
  status: string;
  unreadCount: number;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageDirection?: string;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  contentType: string;
  mediaUrl?: string;
  mediaType?: string;
  status: string;
  createdAt: string;
  sentViaFallback?: boolean;
  fallbackChannel?: Channel;
}

interface InboxItem {
  contact: Contact;
  conversation: Conversation | null;
  channel: Channel;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
}

interface TeamMember {
  id: string;
  memberId: string | null;
  email: string;
  name: string | null;
  role: string;
  status: string;
}

interface TimelineEvent {
  id: string;
  eventType: string;
  eventData: Record<string, unknown>;
  actorType?: string;
  actorId?: string;
  createdAt: string;
}

interface WindowStatus {
  hasRestriction: boolean;
  isActive: boolean;
  windowExpiresAt?: string;
  hoursRemaining?: number;
  isExpiringSoon?: boolean;
  channel: string;
  message?: string;
}

interface WhatsAppAvailability {
  available: boolean;
  provider: "meta" | "twilio";
  reason?: string;
  message?: string;
}

const CHANNEL_CONFIG: Record<Channel, { icon: any; color: string; label: string }> = {
  whatsapp: { icon: MessageCircle, color: '#25D366', label: 'WhatsApp' },
  instagram: { icon: Instagram, color: '#E4405F', label: 'Instagram' },
  facebook: { icon: Facebook, color: '#1877F2', label: 'Messenger' },
  sms: { icon: Smartphone, color: '#6B7280', label: 'SMS' },
  webchat: { icon: Globe, color: '#3B82F6', label: 'Web Chat' },
  telegram: { icon: Send, color: '#0088CC', label: 'Telegram' },
  tiktok: { icon: Video, color: '#000000', label: 'TikTok' },
};

const CONVERSATION_STATUSES = [
  { value: 'open', label: 'Open', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'pending', label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  { value: 'resolved', label: 'Resolved', color: 'bg-blue-100 text-blue-700' },
  { value: 'closed', label: 'Closed', color: 'bg-gray-100 text-gray-700' },
];

const DEMO_CHANNELS: Channel[] = ['whatsapp', 'instagram', 'facebook', 'telegram', 'sms', 'webchat'];

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram DM',
  facebook: 'Facebook',
  webchat: 'Website Widget',
  import: 'CSV Import',
  api: 'API',
  tiktok: 'TikTok',
  sms: 'SMS',
  telegram: 'Telegram',
};

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram DM' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'webchat', label: 'Website Widget' },
  { value: 'import', label: 'CSV Import' },
  { value: 'api', label: 'API' },
];

function getFollowUpStatus(followUpDate: string | null | undefined): 'overdue' | 'today' | 'upcoming' | null {
  if (!followUpDate) return null;
  const due = new Date(followUpDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueDay < today) return 'overdue';
  if (dueDay.getTime() === today.getTime()) return 'today';
  return 'upcoming';
}

export function UnifiedInbox() {
  const [match, params] = useRoute("/app/inbox/:contactId");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    let ws: WebSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval>;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/ws/presence`);

      ws.onopen = () => {
        console.log("[WS Inbox] Connected — authenticating userId:", user.id);
        ws!.send(JSON.stringify({ type: "auth", userId: user.id, userName: user.name || "Agent" }));
        heartbeat = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "heartbeat" }));
            console.log("[WS Inbox] Heartbeat sent — connection alive");
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "auth_success") {
            console.log("[WS Inbox] Auth confirmed — ready to receive new_message events");
          } else if (msg.type === "new_message") {
            console.log("[WS Inbox] new_message received — conversationId:", msg.conversationId, "contactId:", msg.contactId);
            console.log("[WS Inbox] Force-refetching /api/inbox and messages — triggered by WS push");
            queryClient.refetchQueries({ queryKey: ["/api/inbox"], type: "active" });
            if (msg.conversationId) {
              queryClient.refetchQueries({
                queryKey: ["/api/conversations", msg.conversationId, "messages"],
                type: "active",
              });
            }
          }
        } catch {}
      };

      ws.onclose = (evt) => {
        clearInterval(heartbeat);
        if (!destroyed) {
          console.log("[WS Inbox] Connection closed (code:", evt.code, ") — reconnecting in 3s");
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        console.error("[WS Inbox] WebSocket error — closing for reconnect");
        ws?.close();
      };
    };

    connect();

    return () => {
      destroyed = true;
      clearInterval(heartbeat);
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [user, queryClient]);

  const { data: subscription } = useSubscription();

  // AI access flags (legacy — kept for backward compat with other components)
  const plan = (subscription?.limits as any)?.plan || "free";
  const hasAIAssist = plan === "starter" || plan === "pro" || plan === "enterprise";
  const hasAIBrainAddon = (subscription?.limits as any)?.hasAIBrainAddon ?? false;
  const hasFullAIBrain = hasAIBrainAddon && hasAIAssist;
  const { data: aiSettings } = useQuery({
    queryKey: ["/api/ai/settings"],
    enabled: !!user && hasAIAssist,
  });
  const aiEnabled = hasAIAssist && (hasFullAIBrain ? ((aiSettings as any)?.aiMode !== "off") : true);

  // Unified AI capabilities from plan + usage data
  const capabilities = useAICapabilities();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const allChannels: Channel[] = ['whatsapp', 'instagram', 'facebook', 'sms', 'webchat', 'telegram', 'tiktok'];
  const [selectedChannels, setSelectedChannels] = useState<Set<Channel>>(new Set(allChannels));
  const [demoChannelOverrides, setDemoChannelOverrides] = useState<Record<string, Channel>>({});
  const [messageInput, setMessageInput] = useState("");
  const isMobile = useIsMobile();
  const [showEditContact, setShowEditContact] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDetailsSheet, setShowDetailsSheet] = useState(false);
  const [editContactForm, setEditContactForm] = useState({ name: "", phone: "", email: "" });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const prevContactIdRef = useRef<string | null>(null);
  const [showNewMsgBanner, setShowNewMsgBanner] = useState(false);

  const selectedContactId = match ? params?.contactId : null;

  const isDemoUser = user?.email === "demo@whachat.com";

  const { data: inboxData, isLoading: inboxLoading } = useQuery<InboxItem[]>({
    queryKey: ["/api/inbox"],
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const { data: demoChats = [] } = useQuery<any[]>({
    queryKey: ["/api/chats"],
    enabled: isDemoUser,
  });

  const selectedDemoChat = useMemo(() => {
    if (!isDemoUser || !selectedContactId) return null;
    return demoChats.find((c: any) => String(c.id) === String(selectedContactId)) || null;
  }, [isDemoUser, selectedContactId, demoChats]);

  const inbox: InboxItem[] = useMemo(() => {
    if (isDemoUser && demoChats.length > 0) {
      return demoChats.map((chat: any, index: number) => {
        const ch = (chat.channel || DEMO_CHANNELS[index % DEMO_CHANNELS.length]) as Channel;
        return {
          contact: {
            id: chat.id,
            name: chat.name,
            avatar: chat.avatar,
            primaryChannel: ch,
            tag: chat.tag,
            pipelineStage: chat.pipelineStage,
            notes: chat.notes || '',
            followUp: chat.followUp || null,
            followUpDate: chat.followUpDate || null,
            assignedTo: chat.assignedTo || null,
            createdAt: chat.createdAt || new Date().toISOString(),
          },
          conversation: {
            id: chat.id,
            channel: ch,
            status: chat.status || 'open',
            unreadCount: chat.unread || 0,
          },
          channel: ch,
          lastMessage: chat.lastMessage,
          lastMessageAt: chat.createdAt || new Date().toISOString(),
          unreadCount: chat.unread || 0,
        };
      });
    }
    return inboxData || [];
  }, [isDemoUser, inboxData, demoChats]);

  const { data: realContactData } = useQuery<{ contact: Contact; conversations: Conversation[] }>({
    queryKey: ["/api/contacts", selectedContactId],
    enabled: !!selectedContactId && (!isDemoUser || !selectedDemoChat),
  });

  const contactData = useMemo(() => {
    if (isDemoUser && selectedDemoChat) {
      const chatIndex = demoChats.findIndex((c: any) => String(c.id) === String(selectedDemoChat.id));
      const baseCh = (selectedDemoChat.channel || DEMO_CHANNELS[chatIndex >= 0 ? chatIndex % DEMO_CHANNELS.length : 0]) as Channel;
      const overrideCh = demoChannelOverrides[selectedDemoChat.id] as Channel | undefined;
      const activeCh = overrideCh || baseCh;
      return {
        contact: {
          id: selectedDemoChat.id,
          name: selectedDemoChat.name,
          avatar: selectedDemoChat.avatar,
          phone: selectedDemoChat.whatsappPhone || '',
          email: '',
          primaryChannel: baseCh,
          primaryChannelOverride: overrideCh,
          tag: selectedDemoChat.tag,
          pipelineStage: selectedDemoChat.pipelineStage,
          notes: selectedDemoChat.notes || '',
          followUp: selectedDemoChat.followUp || null,
          followUpDate: selectedDemoChat.followUpDate || null,
          assignedTo: selectedDemoChat.assignedTo || null,
          createdAt: selectedDemoChat.createdAt || new Date().toISOString(),
        },
        conversations: [{
          id: selectedDemoChat.id,
          channel: activeCh,
          status: selectedDemoChat.status || 'open',
          unreadCount: selectedDemoChat.unread || 0,
        }]
      };
    }
    return realContactData;
  }, [isDemoUser, selectedDemoChat, realContactData, demoChats, demoChannelOverrides]);

  const primaryConversation = contactData?.conversations?.find(
    (c) => c.channel === (contactData?.contact?.primaryChannelOverride || contactData?.contact?.primaryChannel)
  ) || contactData?.conversations?.[0];

  const { data: realMessages = [] } = useQuery<Message[]>({
    queryKey: ["/api/conversations", primaryConversation?.id, "messages"],
    enabled: !!primaryConversation?.id && (!isDemoUser || !selectedDemoChat),
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
  });

  const messages: Message[] = useMemo(() => {
    if (isDemoUser && selectedDemoChat) {
      return selectedDemoChat.messages.map((m: any, i: number) => ({
        id: m.id || `demo-msg-${i}`,
        direction: (m.role === 'assistant' || m.sender === 'me' || m.sender === 'agent' ? 'outbound' : 'inbound') as 'outbound' | 'inbound',
        content: m.text || m.content,
        contentType: 'text',
        status: 'sent',
        createdAt: new Date().toISOString(),
      }));
    }
    return realMessages;
  }, [isDemoUser, selectedDemoChat, realMessages]);

  const { data: windowStatus } = useQuery<WindowStatus>({
    queryKey: ["/api/conversations", primaryConversation?.id, "window-status"],
    enabled: !!primaryConversation?.id && !isDemoUser,
    refetchInterval: 60000,
  });

  const isWhatsAppContact = contactData?.contact?.primaryChannel === 'whatsapp' ||
    contactData?.contact?.primaryChannelOverride === 'whatsapp';

  const { data: whatsappAvailability } = useQuery<WhatsAppAvailability>({
    queryKey: ["/api/channels/whatsapp/availability"],
    enabled: isWhatsAppContact && !!selectedContactId,
    refetchInterval: 30000,
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  const { data: timeline = [] } = useQuery<TimelineEvent[]>({
    queryKey: ["/api/contacts", selectedContactId, "timeline"],
    enabled: !!selectedContactId && showTimeline,
  });


  // Smart scroll: auto-scroll when near bottom, show banner when not
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // On conversation switch: reset trackers, skip banner logic
    if (selectedContactId !== prevContactIdRef.current) {
      prevContactIdRef.current = selectedContactId;
      prevMsgCountRef.current = messages.length;
      setShowNewMsgBanner(false);
      return;
    }

    const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = dist < 120;
    const isNew = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    if (isNearBottom) {
      setShowNewMsgBanner(false);
      if (isNew) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (isNew) {
      setShowNewMsgBanner(true);
    }
  }, [messages, selectedContactId]);

  // Hide banner when user manually scrolls near bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (dist < 120) setShowNewMsgBanner(false);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [selectedContactId]);

  // Scroll to bottom immediately when switching conversations
  useEffect(() => {
    if (selectedContactId) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 50);
    }
  }, [selectedContactId]);

  // --- Mutations ---

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { contactId: string; content: string }) => {
      const res = await fetch(`/api/contacts/${data.contactId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: data.content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send message");
      return json;
    },
    onMutate: async (data) => {
      const now = new Date().toISOString();
      const conversationId = primaryConversation?.id;
      const messagesKey = ["/api/conversations", conversationId, "messages"];
      const inboxKey = ["/api/inbox"];

      // Cancel in-flight refetches so they don't overwrite our optimistic state
      await queryClient.cancelQueries({ queryKey: messagesKey });
      await queryClient.cancelQueries({ queryKey: inboxKey });

      // Snapshot for rollback on error
      const previousMessages = queryClient.getQueryData<Message[]>(messagesKey);
      const previousInbox = queryClient.getQueryData<InboxItem[]>(inboxKey);

      // Optimistically append message to the conversation thread
      if (conversationId) {
        const optimisticMessage: Message = {
          id: `optimistic-${Date.now()}`,
          direction: 'outbound',
          content: data.content,
          contentType: 'text',
          status: 'sending',
          createdAt: now,
        };
        queryClient.setQueryData<Message[]>(messagesKey, (old) => [
          ...(old ?? []),
          optimisticMessage,
        ]);
      }

      // Optimistically update inbox: refresh preview, timestamp, and move thread to top
      queryClient.setQueryData<InboxItem[]>(inboxKey, (old) => {
        if (!old) return old;
        const list = old.map((item) =>
          item.contact.id === data.contactId
            ? { ...item, lastMessage: data.content, lastMessageAt: now, unreadCount: 0 }
            : item
        );
        const idx = list.findIndex((item) => item.contact.id === data.contactId);
        if (idx > 0) {
          const [moved] = list.splice(idx, 1);
          list.unshift(moved);
        }
        return list;
      });

      // Clear input immediately — message is "in flight"
      setMessageInput("");

      return { previousMessages, previousInbox, conversationId };
    },
    onError: (error: Error, data, context) => {
      // Roll back optimistic updates and restore the unsent text
      if (context?.conversationId && context.previousMessages !== undefined) {
        queryClient.setQueryData(
          ["/api/conversations", context.conversationId, "messages"],
          context.previousMessages
        );
      }
      if (context?.previousInbox !== undefined) {
        queryClient.setQueryData(["/api/inbox"], context.previousInbox);
      }
      setMessageInput(data.content);
      toast({ title: "Message not sent", description: error.message, variant: "destructive" });
    },
    onSettled: (_data, _error, _vars, context) => {
      // Sync with server regardless of success/failure — polling remains as safety net
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      if (context?.conversationId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/conversations", context.conversationId, "messages"],
        });
      }
    },
  });


  const updateContactMutation = useMutation({
    mutationFn: async (data: Record<string, unknown> & { contactId: string }) => {
      const { contactId, ...body } = data;
      // Demo contacts live in the chats table, not contacts table
      const url = isDemoUser
        ? `/api/chats/${contactId}`
        : `/api/contacts/${contactId}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update contact");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      setShowEditContact(false);
    },
  });

  const updateConversationMutation = useMutation({
    mutationFn: async (data: { conversationId: string; status: string }) => {
      // Demo conversations are chat records — update via chats endpoint
      const url = isDemoUser
        ? `/api/chats/${data.conversationId}`
        : `/api/conversations/${data.conversationId}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: data.status }),
      });
      if (!res.ok) throw new Error("Failed to update conversation");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
    },
  });

  const switchChannelMutation = useMutation({
    mutationFn: async (data: { contactId: string; channel: Channel }) => {
      const res = await fetch(`/api/contacts/${data.contactId}/channel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ channel: data.channel }),
      });
      if (!res.ok) throw new Error("Failed to switch channel");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", variables.contactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete contact");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      setShowDeleteConfirm(false);
      setLocation("/app/inbox");
    },
  });

  // --- CRM helpers ---

  const updateContact = useCallback((fields: Record<string, unknown>) => {
    if (!selectedContactId) return;
    updateContactMutation.mutate({ contactId: selectedContactId, ...fields });
  }, [selectedContactId, updateContactMutation]);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedContactId) return;
    sendMessageMutation.mutate({ contactId: selectedContactId, content: messageInput });
  };

  const handleAutoSend = useCallback((message: string) => {
    if (!message.trim() || !selectedContactId) return;
    sendMessageMutation.mutate({ contactId: selectedContactId, content: message });
  }, [selectedContactId, sendMessageMutation]);

  const handleEditContact = () => {
    if (contactData?.contact) {
      setEditContactForm({
        name: contactData.contact.name || "",
        phone: contactData.contact.phone || "",
        email: contactData.contact.email || "",
      });
      setShowEditContact(true);
    }
  };

  const handleSaveEditContact = () => {
    if (!selectedContactId) return;
    updateContactMutation.mutate({ contactId: selectedContactId, ...editContactForm });
  };

  // --- Filtering ---

  const filteredInbox = useMemo(() => {
    let result = inbox.filter(item =>
      item.contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.contact.phone?.includes(searchQuery) ||
      item.contact.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filterTab === 'unread') result = result.filter(item => item.unreadCount > 0);
    if (filterTab === 'mine') result = result.filter(item => item.contact.assignedTo === user?.id);
    if (selectedChannels.size < allChannels.length) {
      result = result.filter(item => selectedChannels.has(item.channel as Channel));
    }
    return result;
  }, [inbox, searchQuery, filterTab, user?.id, selectedChannels]);

  // --- Helpers ---

  const getChannelIcon = (channel: Channel, size = "w-3 h-3") => {
    const config = CHANNEL_CONFIG[channel];
    const Icon = config.icon;
    return <Icon className={size} style={{ color: config.color }} />;
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return format(date, "h:mm a");
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return format(date, "EEEE");
    return format(date, "MMM d");
  };

  const contact = contactData?.contact;

  // Build contact context for AI reply quality improvement (must be after contact + messages are declared)
  const contactContext: ContactContext | undefined = useMemo(() => {
    if (!contact) return undefined;
    const msgList = messages.map(m => ({ direction: m.direction, content: m.content || '' }));
    const intel = msgList.length > 0 ? analyzeConversation(msgList) : null;
    return {
      name:          contact.name,
      tag:           contact.tag || undefined,
      pipelineStage: contact.pipelineStage || undefined,
      notes:         contact.notes || undefined,
      budget:        intel?.budget ?? undefined,
      timeline:      intel?.timeline ?? undefined,
      financing:     intel?.financing ?? undefined,
      intent:        intel?.intent,
      leadScore:     intel?.leadScore?.label,
    };
  }, [contact, messages]);

  const activeChannel = contact?.primaryChannelOverride as Channel || contact?.primaryChannel as Channel;
  const convStatus = primaryConversation?.status || 'open';
  const statusConfig = CONVERSATION_STATUSES.find(s => s.value === convStatus) || CONVERSATION_STATUSES[0];

  if (inboxLoading && !isDemoUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white overflow-hidden w-full max-w-full" data-testid="unified-inbox">

      {/* ── LEFT COLUMN: Conversation List ── */}
      <div className={cn(
        "w-full md:w-72 lg:w-80 border-r flex flex-col flex-shrink-0",
        selectedContactId ? "hidden md:flex" : "flex"
      )}>
        {/* Header */}
        <div className="p-3 border-b">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-base font-semibold flex-1">Inbox</h2>
            {/* Channel Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="h-7 px-2.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1"
                  data-testid="button-channel-filter"
                >
                  {selectedChannels.size === allChannels.length ? (
                    <><Globe className="w-3 h-3" /> All</>
                  ) : (
                    <><Globe className="w-3 h-3" /> {selectedChannels.size} ch</>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" align="end">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-2 mb-1">Filter by channel</p>
                {allChannels.map(ch => {
                  const cfg = CHANNEL_CONFIG[ch];
                  const Icon = cfg.icon;
                  return (
                    <label key={ch} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedChannels.has(ch)}
                        onChange={(e) => {
                          const next = new Set(selectedChannels);
                          if (e.target.checked) next.add(ch); else next.delete(ch);
                          setSelectedChannels(next);
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 accent-emerald-600"
                        data-testid={`checkbox-channel-${ch}`}
                      />
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: cfg.color }} />
                      <span className="text-sm text-gray-700">{cfg.label}</span>
                    </label>
                  );
                })}
                <div className="border-t mt-1 pt-1 flex gap-1 px-2">
                  <button onClick={() => setSelectedChannels(new Set(allChannels))} className="flex-1 text-[11px] text-gray-500 hover:text-gray-700 py-1">All</button>
                  <button onClick={() => setSelectedChannels(new Set())} className="flex-1 text-[11px] text-gray-500 hover:text-gray-700 py-1">None</button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search contacts..." className="pl-8 h-8 text-sm" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} data-testid="input-search-inbox" />
          </div>
          {/* Filter tabs */}
          <div className="flex gap-1" data-testid="filter-tabs">
            {(['all', 'unread', 'mine'] as FilterTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                className={cn(
                  "flex-1 text-xs py-1 rounded-md font-medium transition-colors",
                  filterTab === tab
                    ? "bg-emerald-100 text-emerald-700"
                    : "text-gray-500 hover:bg-gray-100"
                )}
                data-testid={`filter-tab-${tab}`}
              >
                {tab === 'all' ? 'All' : tab === 'unread' ? 'Unread' : 'Mine'}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredInbox.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <User className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No conversations</p>
            </div>
          ) : (
            filteredInbox.map(item => {
              const fuStatus = getFollowUpStatus(item.contact.followUpDate);
              const needsReply = item.conversation?.lastMessageDirection === 'inbound' && item.unreadCount > 0;
              const isOverdue = fuStatus === 'overdue';
              return (
              <div
                key={item.contact.id}
                onClick={() => setLocation(`/app/inbox/${item.contact.id}`)}
                className={cn(
                  "p-3 border-b cursor-pointer hover:bg-slate-50 transition-colors",
                  selectedContactId === item.contact.id && "bg-emerald-50",
                  isOverdue && "border-l-2 border-l-red-400"
                )}
                data-testid={`inbox-item-${item.contact.id}`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="relative flex-shrink-0">
                    <ChatAvatar src={item.contact.avatar} name={item.contact.name} size="md" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm">
                      {getChannelIcon(item.channel)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className={cn("font-medium text-sm truncate flex-1", needsReply && "font-semibold")}>{item.contact.name}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatTime(item.lastMessageAt)}</span>
                      {item.unreadCount > 0 && (
                        <Badge className="ml-0.5 text-[10px] px-1.5 py-0 h-4 flex-shrink-0 bg-emerald-600">{item.unreadCount}</Badge>
                      )}
                    </div>
                    <p className={cn("text-xs truncate mb-1", needsReply ? "text-gray-700 font-medium" : "text-muted-foreground")}>
                      {item.lastMessage || "No messages yet"}
                    </p>
                    <div className="flex items-center gap-1">
                      {needsReply ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold border bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-0.5" data-testid={`badge-needs-reply-${item.contact.id}`}>
                          <Zap className="w-2.5 h-2.5" />Needs Reply
                        </span>
                      ) : fuStatus === 'overdue' ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold border bg-red-50 text-red-600 border-red-200" data-testid={`badge-overdue-${item.contact.id}`}>
                          ⏰ Overdue
                        </span>
                      ) : fuStatus === 'today' ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border bg-amber-50 text-amber-600 border-amber-200" data-testid={`badge-today-${item.contact.id}`}>
                          ⏰ Today
                        </span>
                      ) : fuStatus === 'upcoming' ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border bg-slate-50 text-slate-500 border-slate-200" data-testid={`badge-upcoming-${item.contact.id}`}>
                          ⏰ {item.contact.followUp}
                        </span>
                      ) : item.contact.tag ? (
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium border", TAG_COLORS[item.contact.tag] || 'bg-blue-100 text-blue-700 border-blue-200')}>
                          {item.contact.tag}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── CENTER COLUMN: Conversation View ── */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 overflow-hidden border-r",
        selectedContactId ? "flex" : "hidden md:flex"
      )}>
        {selectedContactId && contact ? (
          <>
            {/* Conversation Header */}
            <div className="p-3 border-b flex items-center gap-2 flex-shrink-0">
              <button onClick={() => setLocation('/app/inbox')} className="md:hidden p-1 text-gray-500" data-testid="button-back-inbox">
                <ChevronDown className="w-5 h-5 rotate-90" />
              </button>
              <ChatAvatar src={contact.avatar} name={contact.name} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-semibold text-sm truncate">{contact.name}</h3>
                  {getChannelIcon(activeChannel)}
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", statusConfig.color)}>
                    {statusConfig.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {contact.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{contact.phone}</span>}
                  {contact.assignedTo && (() => {
                    const assignee = teamMembers.find((m: TeamMember) => (m.memberId || m.id) === contact.assignedTo);
                    const name = assignee?.name || assignee?.email?.split('@')[0];
                    return name ? (
                      <span className="flex items-center gap-1 text-emerald-600 hidden sm:flex">
                        <UserCheck className="w-3 h-3" />{name}
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Mobile: open CRM details sheet */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden h-7 w-7 p-0"
                  onClick={() => setShowDetailsSheet(true)}
                  data-testid="button-mobile-crm-details"
                  title="CRM Details"
                >
                  <PanelRight className="w-4 h-4" />
                </Button>

                {/* Channel switcher */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1 h-7 px-2 text-xs border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-700 bg-white shadow-none" data-testid="button-switch-channel">
                      {getChannelIcon(activeChannel)}
                      <span className="hidden sm:inline">{CHANNEL_CONFIG[activeChannel]?.label}</span>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {Object.entries(CHANNEL_CONFIG).filter(([k]) => k !== 'tiktok').map(([key, cfg]) => {
                      const Icon = cfg.icon;
                      const isActive = activeChannel === key;
                      return (
                        <DropdownMenuItem
                          key={key}
                          onClick={() => {
                            if (isDemoUser && selectedContactId) {
                              setDemoChannelOverrides(prev => ({ ...prev, [selectedContactId]: key as Channel }));
                            } else if (selectedContactId) {
                              switchChannelMutation.mutate({ contactId: selectedContactId, channel: key as Channel });
                            }
                          }}
                          className={cn("gap-2", isActive && "font-medium")}
                        >
                          <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                          {cfg.label}
                          {isActive && <span className="ml-auto text-xs text-emerald-600">✓</span>}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Actions menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid="button-contact-actions">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleEditContact} data-testid="menu-edit-contact">
                      <Edit className="w-4 h-4 mr-2" /> Edit Contact
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowTimeline(true)} data-testid="menu-view-timeline">
                      <History className="w-4 h-4 mr-2" /> Activity Timeline
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)} className="text-red-600" data-testid="menu-delete-contact">
                      <Trash2 className="w-4 h-4 mr-2" /> Delete Contact
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* WhatsApp/Meta warnings */}
            {whatsappAvailability && !whatsappAvailability.available && (
              <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-700 flex-shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {whatsappAvailability.message || "WhatsApp not configured"}
              </div>
            )}
            {windowStatus?.hasRestriction && !windowStatus.isActive && (
              <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center gap-2 text-xs text-red-700 flex-shrink-0">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                24-hour messaging window closed. Use a template to re-open.
              </div>
            )}
            {windowStatus?.hasRestriction && windowStatus.isActive && windowStatus.isExpiringSoon && (
              <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-700 flex-shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Messaging window closes in {windowStatus.hoursRemaining}h
              </div>
            )}

            {/* Messages area */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto relative"
              style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', backgroundSize: '400px' }}
            >
              <div className="absolute inset-0 bg-[#efeae2]/90 pointer-events-none" />
              <div className="relative z-10 p-3 flex flex-col gap-1.5 min-h-full justify-end">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8 self-center">
                    <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No messages yet</p>
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    const isOut = msg.direction === 'outbound';
                    const isSending = msg.status === 'sending';
                    return (
                      <div key={msg.id || i} className={cn("flex animate-msg-in", isOut ? "justify-end" : "justify-start")}>
                        <div className={cn(
                          "max-w-[75%] rounded-lg px-3 py-1.5 text-sm shadow-sm relative",
                          isOut ? "bg-[#d9fdd3] text-gray-900 rounded-tr-none" : "bg-white text-gray-900 rounded-tl-none",
                          isSending && "opacity-75"
                        )}>
                          {msg.mediaUrl && msg.mediaType?.startsWith('image') ? (
                            <img src={msg.mediaUrl} alt="Media" className="max-w-full rounded cursor-pointer" onClick={() => window.open(msg.mediaUrl, '_blank')} />
                          ) : msg.mediaType === 'document' ? (
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-gray-500" />
                              <span>{msg.content}</span>
                            </div>
                          ) : (
                            <p className="leading-snug">{msg.content}</p>
                          )}
                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            {msg.sentViaFallback && (
                              <span className="text-[10px] text-amber-600">via {msg.fallbackChannel}</span>
                            )}
                            <span className="text-[10px] text-gray-400">{format(new Date(msg.createdAt), 'h:mm a')}</span>
                            {isOut && (
                              isSending
                                ? <Loader2 className="w-2.5 h-2.5 text-gray-400 animate-spin" />
                                : <span className="text-[10px] text-gray-400">
                                    {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                                  </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* New messages banner — shown when user is scrolled up */}
              {showNewMsgBanner && (
                <button
                  data-testid="banner-new-messages"
                  onClick={() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                    setShowNewMsgBanner(false);
                  }}
                  className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 bg-white text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full shadow-md border border-gray-200 hover:bg-gray-50 transition-all"
                >
                  New messages <ChevronDown className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Composer */}
            <AIComposer
              value={messageInput}
              onChange={setMessageInput}
              onSend={handleSendMessage}
              onAutoSend={handleAutoSend}
              aiEnabled={aiEnabled}
              hasFullAIBrain={hasFullAIBrain}
              capabilities={capabilities}
              contactContext={contactContext}
              conversationId={primaryConversation?.id ?? selectedContactId}
              messages={messages.map((m) => ({
                role: m.direction === 'inbound' ? 'user' : 'assistant',
                content: m.content || '',
              }))}
            />
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#efeae2]/30">
            <div className="bg-white rounded-2xl p-8 shadow-sm max-w-sm">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Select a conversation</h2>
              <p className="text-gray-500 text-sm">Choose a contact from the list to view messages and manage their CRM details.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT COLUMN: CRM Panel (desktop) ── */}
      {!isMobile && selectedContactId && contact && (
        <InboxLeadDetailsPanel
          contact={contact}
          primaryConversation={primaryConversation}
          teamMembers={teamMembers}
          messages={messages.map(m => ({ direction: m.direction, content: m.content || '' }))}
          capabilities={capabilities}
          currentUserId={user?.id}
          onInsertMessage={text => setMessageInput(text)}
          onUpdateContact={updateContact}
          onUpdateConversationStatus={status => {
            if (primaryConversation) {
              updateConversationMutation.mutate({ conversationId: primaryConversation.id, status });
            }
          }}
          onEditContact={handleEditContact}
          onDeleteContact={() => setShowDeleteConfirm(true)}
        />
      )}

      {/* ── MOBILE CRM Sheet ── */}
      {isMobile && (
        <Sheet open={showDetailsSheet} onOpenChange={setShowDetailsSheet}>
          <SheetContent side="right" className="w-full sm:w-96 p-0 flex flex-col" data-testid="mobile-crm-sheet">
            <SheetHeader className="px-4 pt-4 pb-2 border-b flex-shrink-0">
              <SheetTitle className="text-sm font-semibold">
                {contact ? `${contact.name} — Details` : "Details"}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {selectedContactId && contact ? (
                <InboxLeadDetailsPanel
                  contact={contact}
                  primaryConversation={primaryConversation}
                  teamMembers={teamMembers}
                  messages={messages.map(m => ({ direction: m.direction, content: m.content || '' }))}
                  capabilities={capabilities}
                  currentUserId={user?.id}
                  panelClassName="flex flex-col w-full bg-white"
                  onInsertMessage={text => { setMessageInput(text); setShowDetailsSheet(false); }}
                  onUpdateContact={updateContact}
                  onUpdateConversationStatus={status => {
                    if (primaryConversation) {
                      updateConversationMutation.mutate({ conversationId: primaryConversation.id, status });
                    }
                  }}
                  onEditContact={() => { setShowDetailsSheet(false); handleEditContact(); }}
                  onDeleteContact={() => { setShowDetailsSheet(false); setShowDeleteConfirm(true); }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-2">
                  <PanelRight className="w-6 h-6 opacity-40" />
                  <p>No contact selected</p>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* ── DIALOGS ── */}

      {/* Edit Contact */}
      <Dialog open={showEditContact} onOpenChange={setShowEditContact}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Name</Label>
              <Input value={editContactForm.name} onChange={e => setEditContactForm({ ...editContactForm, name: e.target.value })} data-testid="input-edit-name" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={editContactForm.phone} onChange={e => setEditContactForm({ ...editContactForm, phone: e.target.value })} placeholder="+1234567890" data-testid="input-edit-phone" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={editContactForm.email} onChange={e => setEditContactForm({ ...editContactForm, email: e.target.value })} placeholder="email@example.com" data-testid="input-edit-email" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEditContact(false)}>Cancel</Button>
              <Button onClick={handleSaveEditContact} disabled={updateContactMutation.isPending} data-testid="button-save-edit-contact">
                {updateContactMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Activity Timeline */}
      <Dialog open={showTimeline} onOpenChange={setShowTimeline}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Activity Timeline</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-2 max-h-80 overflow-y-auto pr-1">
            {timeline.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">No activity yet</p>
            ) : (
              timeline.map(event => {
                const data = event.eventData as any;
                let description = "";
                if (event.eventType === "message") description = `${event.actorType === 'contact' ? 'Received' : 'Sent'}: "${data?.preview || data?.content || ''}"`;
                else if (event.eventType === "tag_change") description = `Tag changed to "${data?.to || data?.tag}"`;
                else if (event.eventType === "stage_change") description = `Pipeline: ${data?.from} → ${data?.to}`;
                else if (event.eventType === "channel_switch") description = `Channel: ${data?.from} → ${data?.to}`;
                else if (event.eventType === "note") description = `Note: "${data?.content || ''}"`;
                else if (event.eventType === "assignment") description = `Assigned to ${data?.assignee || data?.to || "team member"}`;
                else if (event.eventType === "contact_created") description = "Contact created";
                else description = Object.entries(data || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || "Activity recorded";

                return (
                  <div key={event.id} className="flex gap-3 p-2.5 bg-slate-50 rounded-lg" data-testid={`timeline-event-${event.id}`}>
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-medium">{event.eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(event.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-red-600">Delete Contact</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{contact?.name}</strong>? This will remove all conversations and messages. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} data-testid="button-cancel-delete">Cancel</Button>
            <Button variant="destructive" onClick={() => { if (selectedContactId) deleteContactMutation.mutate(selectedContactId); }} disabled={deleteContactMutation.isPending} data-testid="button-confirm-delete">
              {deleteContactMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete Contact
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
