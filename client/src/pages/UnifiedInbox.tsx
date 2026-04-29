import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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
  LayoutTemplate,
  ImageOff,
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

type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'sms' | 'webchat' | 'telegram' | 'tiktok' | 'gohighlevel' | string;
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
  /** Matches server: used to resolve default channel when override is invalid */
  lastIncomingChannel?: Channel;
  ghlId?: string;
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
  mediaFilename?: string;
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

interface MessageTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  bodyText: string;
  headerType?: string | null;
  headerContent?: string | null;
  footerText?: string | null;
  variables: string[];
}

const CHANNEL_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  whatsapp: { icon: MessageCircle, color: '#25D366', label: 'WhatsApp' },
  instagram: { icon: Instagram, color: '#E4405F', label: 'Instagram' },
  facebook: { icon: Facebook, color: '#1877F2', label: 'Messenger' },
  sms: { icon: Smartphone, color: '#6B7280', label: 'SMS' },
  webchat: { icon: Globe, color: '#3B82F6', label: 'Web Chat' },
  telegram: { icon: Send, color: '#0088CC', label: 'Telegram' },
  tiktok: { icon: Video, color: '#000000', label: 'TikTok' },
  gohighlevel: { icon: Zap, color: '#F97316', label: 'GoHighLevel' },
};

const CONVERSATION_STATUSES = [
  { value: 'open', label: 'Open', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'pending', label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  { value: 'resolved', label: 'Resolved', color: 'bg-blue-100 text-blue-700' },
  { value: 'closed', label: 'Closed', color: 'bg-gray-100 text-gray-700' },
];

const DEMO_CHANNELS: Channel[] = ['whatsapp', 'instagram', 'facebook', 'telegram', 'sms', 'webchat'];

function contactHasWebchatReachability(
  c: Contact,
  conversations?: Array<{ channel: Channel | string }>
): boolean {
  if (c.lastIncomingChannel === 'webchat' || c.primaryChannel === 'webchat' || c.source === 'webchat') {
    return true;
  }
  return conversations?.some((x) => x.channel === 'webchat') ?? false;
}

/**
 * Channels this contact can use for outbound — identifiers only (WhatsApp requires whatsappId; SMS requires phone).
 * Web Chat is included only when the contact has a webchat session/signals.
 */
function getReachableChannelsForContact(
  c: Contact | undefined,
  conversations?: Array<{ channel: Channel | string }>
): Channel[] {
  if (!c) return [];
  const keys = new Set<string>();
  if (c.whatsappId) keys.add('whatsapp');
  if (c.instagramId) keys.add('instagram');
  if (c.facebookId) keys.add('facebook');
  if (c.phone) keys.add('sms');
  if (c.telegramId) keys.add('telegram');
  if (c.ghlId) keys.add('gohighlevel');
  if (contactHasWebchatReachability(c, conversations)) keys.add('webchat');
  const order: Channel[] = ['whatsapp', 'instagram', 'facebook', 'sms', 'webchat', 'telegram', 'gohighlevel'];
  return order.filter((k) => keys.has(k));
}

/** Same clamp as header activeChannel; empty reachable → cannot send (null). */
function clampOutboundChannel(shown: Channel | undefined, reachable: Channel[]): Channel | null {
  if (reachable.length === 0) return null;
  if (shown !== undefined && reachable.includes(shown)) return shown;
  return reachable[0];
}

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
  const messagesInnerRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const prevContactIdRef = useRef<string | null>(null);
  const [showNewMsgBanner, setShowNewMsgBanner] = useState(false);
  // true when user is at/near the bottom — auto-scroll should happen
  const shouldPinRef = useRef(true);
  // Set to true on every send so that all post-render scrolls are forced,
  // regardless of where the user was scrolled before they sent.
  const justSentRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    const c = messagesContainerRef.current;
    if (c) c.scrollTop = c.scrollHeight;
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<{
    localPreview: string;
    mediaUrl: string;
    mediaType: string;
    mediaFilename: string;
    mimeType: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedInboxTemplate, setSelectedInboxTemplate] = useState<MessageTemplate | null>(null);
  const [showVarDialog, setShowVarDialog] = useState(false);
  const [varValues, setVarValues] = useState<Record<string, string>>({});

  const selectedContactId = match ? params?.contactId : null;

  const isDemoUser = user?.email === "demo@whachat.com";

  const { data: inboxData, isLoading: inboxLoading } = useQuery<InboxItem[]>({
    queryKey: ["/api/inbox"],
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
  });

  const contactData = useMemo(() => {
    if (isDemoUser && selectedDemoChat) {
      const chatIndex = demoChats.findIndex((c: any) => String(c.id) === String(selectedDemoChat.id));
      const baseCh = (selectedDemoChat.channel || DEMO_CHANNELS[chatIndex >= 0 ? chatIndex % DEMO_CHANNELS.length : 0]) as Channel;
      const overrideCh = demoChannelOverrides[selectedDemoChat.id] as Channel | undefined;
      const activeCh = overrideCh || baseCh;
      const waDigits = selectedDemoChat.whatsappPhone
        ? String(selectedDemoChat.whatsappPhone).replace(/\D/g, '')
        : '';
      return {
        contact: {
          id: selectedDemoChat.id,
          name: selectedDemoChat.name,
          avatar: selectedDemoChat.avatar,
          phone: activeCh === 'sms' || activeCh === 'whatsapp' ? (selectedDemoChat.whatsappPhone || '') : '',
          email: '',
          primaryChannel: baseCh,
          primaryChannelOverride: overrideCh,
          lastIncomingChannel: activeCh,
          whatsappId: activeCh === 'whatsapp' && waDigits ? waDigits : activeCh === 'whatsapp' ? '15555550100' : undefined,
          instagramId: activeCh === 'instagram' ? 'demo_instagram' : undefined,
          facebookId: activeCh === 'facebook' ? 'demo_psid' : undefined,
          telegramId: activeCh === 'telegram' ? 'demo_telegram' : undefined,
          source: activeCh === 'webchat' ? 'webchat' : undefined,
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

  const contactReachableChannels = useMemo(
    () =>
      getReachableChannelsForContact(
        contactData?.contact as Contact | undefined,
        contactData?.conversations
      ),
    [contactData?.contact, contactData?.conversations]
  );

  // Mirror backend getPrimaryChannel, then clamp to channels this contact can actually use.
  const effectiveChannel = useMemo(() => {
    const c = contactData?.contact as Contact | undefined;
    if (!c) return undefined;
    const reachable = contactReachableChannels;
    if (reachable.length === 0) return undefined;

    const channelIdMap: Record<string, string | undefined> = {
      whatsapp: c.whatsappId,
      instagram: c.instagramId,
      facebook: c.facebookId,
      telegram: c.telegramId,
    };

    const override = c.primaryChannelOverride as Channel | undefined;
    if (override) {
      const hasId = !(override in channelIdMap) || !!channelIdMap[override];
      if (hasId && reachable.includes(override)) return override;
    }

    const last = c.lastIncomingChannel as Channel | undefined;
    if (last && reachable.includes(last)) return last;

    if (reachable.includes(c.primaryChannel as Channel)) return c.primaryChannel as Channel;

    return reachable[0];
  }, [contactData?.contact, contactReachableChannels]);

  const primaryConversation = contactData?.conversations?.find(
    (c) => c.channel === effectiveChannel
  ) || contactData?.conversations?.[0];

  /** Immediate UI selection for outbound sends while PATCH /channel refetches; cleared when server state matches. */
  const [sendChannelUi, setSendChannelUi] = useState<Channel | null>(null);
  useEffect(() => { setSendChannelUi(null); }, [selectedContactId]);
  useEffect(() => {
    if (sendChannelUi && effectiveChannel === sendChannelUi) {
      setSendChannelUi(null);
    }
  }, [effectiveChannel, sendChannelUi]);

  // Drop stale picker state when contact data changes (e.g. only FB + webchat allowed).
  useEffect(() => {
    if (!sendChannelUi) return;
    if (!contactReachableChannels.includes(sendChannelUi)) {
      setSendChannelUi(null);
    }
  }, [contactReachableChannels, sendChannelUi]);

  const activeChannel: Channel | undefined = useMemo(() => {
    const c = contactData?.contact as Contact | undefined;
    const reachable = contactReachableChannels;
    if (reachable.length === 0) return undefined;

    const preferred = sendChannelUi ?? effectiveChannel ?? c?.primaryChannel ?? reachable[0];
    if (reachable.includes(preferred as Channel)) return preferred as Channel;
    if (effectiveChannel && reachable.includes(effectiveChannel)) return effectiveChannel;
    return reachable[0];
  }, [
    contactData?.contact,
    contactReachableChannels,
    sendChannelUi,
    effectiveChannel,
  ]);

  /** Single source for POST /send `channel`: mirrors header label each render; mutation reads at request time. */
  const displayedOutboundChannelRef = useRef<Channel | undefined>(undefined);
  const contactReachableChannelsRef = useRef<Channel[]>([]);
  displayedOutboundChannelRef.current = activeChannel;
  contactReachableChannelsRef.current = contactReachableChannels;

  const isWhatsAppContact = activeChannel === 'whatsapp';

  const windowConversationId = useMemo(() => {
    if (!activeChannel) return undefined;
    const ch = activeChannel as string;
    if (!['whatsapp', 'facebook', 'instagram'].includes(ch)) return undefined;
    const conv = contactData?.conversations?.find((c) => c.channel === activeChannel);
    return conv?.id ?? primaryConversation?.id;
  }, [activeChannel, contactData?.conversations, primaryConversation?.id]);

  const [metaWindowTimerTick, setMetaWindowTimerTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setMetaWindowTimerTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { data: realMessages = [], isLoading: messagesLoading, isFetching: messagesFetching } = useQuery<Message[]>({
    queryKey: ["/api/conversations", primaryConversation?.id, "messages"],
    enabled: !!primaryConversation?.id && (!isDemoUser || !selectedDemoChat),
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
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
    queryKey: ["/api/conversations", windowConversationId, "window-status"],
    enabled: !!windowConversationId && !isDemoUser,
    refetchInterval: 60000,
  });

  const metaWindowHeaderHint = useMemo(() => {
    if (!activeChannel) return null;
    const ch = activeChannel as string;
    if (!['whatsapp', 'facebook', 'instagram'].includes(ch)) return null;
    if (!windowStatus?.hasRestriction || !windowStatus.windowExpiresAt) return null;
    void metaWindowTimerTick;
    const expMs = new Date(windowStatus.windowExpiresAt).getTime();
    const bufferMs = activeChannel === 'whatsapp' ? 60 * 60 * 1000 : 0;
    const deadlineMs = expMs - bufferMs;
    const msLeft = deadlineMs - Date.now();
    if (msLeft <= 0) {
      return { text: 'Window expired', amber: false };
    }
    const amber = msLeft < 2 * 60 * 60 * 1000;
    const fullHours = Math.floor(msLeft / (60 * 60 * 1000));
    const text = fullHours >= 1 ? `${fullHours}h left` : '1h left';
    return { text, amber };
  }, [activeChannel, windowStatus, metaWindowTimerTick]);

  const { data: whatsappAvailability } = useQuery<WhatsAppAvailability>({
    queryKey: ["/api/channels/whatsapp/availability"],
    enabled: isWhatsAppContact && !!selectedContactId,
    refetchInterval: 30000,
  });

  const { data: inboxTemplates = [] } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/templates"],
    enabled: isWhatsAppContact && !isDemoUser,
    retry: false,
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  const { data: timeline = [] } = useQuery<TimelineEvent[]>({
    queryKey: ["/api/contacts", selectedContactId, "timeline"],
    enabled: !!selectedContactId && showTimeline,
  });

  type ChannelHealthEntry = {
    channel: string;
    isConnected: boolean;
    isEnabled: boolean;
    pageName: string | null;
    healthy: boolean | null;   // null = could not determine; true = all checks passed; false = at least one failed
    issues: string[];          // human-readable list of specific problems found
    checks: {
      tokenValid: boolean | null;
      tokenScopes: string[] | null;
      missingScopes: string[] | null;
      pageAccessible: boolean | null;
      subscriptionOk: boolean | null;
      subscriptionFields: string[] | null;
    };
  };
  const { data: channelHealth = [] } = useQuery<ChannelHealthEntry[]>({
    queryKey: ["/api/channel-health"],
    refetchInterval: 5 * 60 * 1000, // re-check every 5 minutes
    staleTime: 4 * 60 * 1000,
  });

  // Channels that are connected but failed at least one health check
  const unhealthyChannels = channelHealth.filter(c => c.isConnected && c.healthy === false);
  const [dismissedHealthAlert, setDismissedHealthAlert] = useState<string | null>(null);
  // Only dismiss per session; if different channel breaks, show again
  const alertKey = unhealthyChannels.map(c => c.channel).sort().join(',');
  const showHealthAlert = unhealthyChannels.length > 0 && dismissedHealthAlert !== alertKey;


  // Smart scroll: runs synchronously after DOM commit (useLayoutEffect) so
  // scrollHeight already reflects the new message text. Images/media are handled
  // separately via onLoad + ResizeObserver below.
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || messages.length === 0) return;

    // Conversation switch: pin to bottom immediately.
    if (selectedContactId !== prevContactIdRef.current) {
      prevContactIdRef.current = selectedContactId;
      prevMsgCountRef.current = messages.length;
      shouldPinRef.current = true;
      setShowNewMsgBanner(false);
      container.scrollTop = container.scrollHeight;
      return;
    }

    const isNew = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    if (!isNew) return;

    if (justSentRef.current || shouldPinRef.current) {
      setShowNewMsgBanner(false);
      container.scrollTop = container.scrollHeight;
    } else {
      // User is reading history — show banner instead of yanking them down.
      setShowNewMsgBanner(true);
    }
  }, [messages, selectedContactId]);

  // Track pin state and hide banner when user scrolls near bottom.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      const nearBottom = dist < 150;
      shouldPinRef.current = nearBottom;
      if (nearBottom) setShowNewMsgBanner(false);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [selectedContactId]);

  // ResizeObserver: catches async height changes (images/media decoding, window
  // resize). Re-scrolls whenever content grows and the user was pinned to bottom.
  useEffect(() => {
    const inner = messagesInnerRef.current;
    if (!inner) return;
    const ro = new ResizeObserver(() => {
      if (shouldPinRef.current || justSentRef.current) {
        scrollToBottom();
      }
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [selectedContactId, scrollToBottom]);

  // Mark conversation as read when opened
  useEffect(() => {
    if (!primaryConversation?.id || isDemoUser) return;
    fetch(`/api/conversations/${primaryConversation.id}/read`, {
      method: "POST",
      credentials: "include",
    }).then(() => {
      queryClient.setQueryData<InboxItem[]>(["/api/inbox"], (old) => {
        if (!old) return old;
        return old.map((item) =>
          item.contact.id === selectedContactId
            ? { ...item, unreadCount: 0, conversation: item.conversation ? { ...item.conversation, unreadCount: 0 } : item.conversation }
            : item
        );
      });
    }).catch(() => {});
  }, [primaryConversation?.id, isDemoUser]);

  // --- Mutations ---

  const sendMessageMutation = useMutation({
    mutationFn: async (data: {
      contactId: string;
      content: string;
      mediaUrl?: string;
      mediaType?: string;
      mediaFilename?: string;
      contentType?: string;
    }) => {
      const channel = clampOutboundChannel(
        displayedOutboundChannelRef.current,
        contactReachableChannelsRef.current
      );
      if (channel === null) {
        throw new Error('No available messaging channel for this contact.');
      }
      const res = await fetch(`/api/contacts/${data.contactId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content: data.content,
          contentType: data.contentType || (data.mediaType || 'text'),
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType ? `${data.mediaType}` : undefined,
          mediaFilename: data.mediaFilename,
          channel,
        }),
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

      await queryClient.cancelQueries({ queryKey: messagesKey });
      await queryClient.cancelQueries({ queryKey: inboxKey });

      const previousMessages = queryClient.getQueryData<Message[]>(messagesKey);
      const previousInbox = queryClient.getQueryData<InboxItem[]>(inboxKey);

      if (conversationId) {
        const optimisticMessage: Message = {
          id: `optimistic-${Date.now()}`,
          direction: 'outbound',
          content: data.content,
          contentType: data.contentType || (data.mediaType || 'text'),
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          mediaFilename: data.mediaFilename,
          status: 'sending',
          createdAt: now,
        };
        queryClient.setQueryData<Message[]>(messagesKey, (old) => [
          ...(old ?? []),
          optimisticMessage,
        ]);
      }

      const mediaLabel = ({ image: 'Photo', video: 'Video', audio: 'Audio', document: 'Document' } as Record<string, string>)[data.mediaType || ''] ?? 'Media';
      const previewText = data.content || (data.mediaUrl ? mediaLabel : '');
      queryClient.setQueryData<InboxItem[]>(inboxKey, (old) => {
        if (!old) return old;
        const list = old.map((item) =>
          item.contact.id === data.contactId
            ? { ...item, lastMessage: previewText, lastMessageAt: now, unreadCount: 0 }
            : item
        );
        const idx = list.findIndex((item) => item.contact.id === data.contactId);
        if (idx > 0) {
          const [moved] = list.splice(idx, 1);
          list.unshift(moved);
        }
        return list;
      });

      setMessageInput("");
      setPendingFile(null);

      // Flag that a send just happened — forces scroll even if user somehow
      // wasn't pinned. Also ensures the ResizeObserver keeps scrolling while
      // media is still loading.
      justSentRef.current = true;
      shouldPinRef.current = true;

      // Two-tick scroll: setTimeout(0) lets React flush the optimistic render,
      // then requestAnimationFrame waits for the browser layout pass so that
      // scrollHeight already includes the new bubble's full (text) height.
      setTimeout(() => {
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      }, 0);

      // Safety valve: clear the flag after 4 s so it never gets stuck.
      // Image onLoad will clear it earlier when the image finishes loading.
      setTimeout(() => { justSentRef.current = false; }, 4000);

      return { previousMessages, previousInbox, conversationId, content: data.content };
    },
    onError: (error: Error, data, context) => {
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
    if (!messageInput.trim() && !pendingFile) return;
    if (!selectedContactId) return;
    if (contactReachableChannels.length === 0) {
      toast({
        title: 'Cannot send',
        description: 'No available messaging channel for this contact.',
        variant: 'destructive',
      });
      return;
    }
    sendMessageMutation.mutate({
      contactId: selectedContactId,
      content: messageInput,
      ...(pendingFile ? {
        mediaUrl: pendingFile.mediaUrl,
        mediaType: pendingFile.mediaType,
        mediaFilename: pendingFile.mediaFilename,
        contentType: pendingFile.mediaType,
      } : {}),
    });
  };

  const handleAutoSend = useCallback((message: string) => {
    if (!message.trim() || !selectedContactId) return;
    if (contactReachableChannels.length === 0) {
      toast({
        title: 'Cannot send',
        description: 'No available messaging channel for this contact.',
        variant: 'destructive',
      });
      return;
    }
    sendMessageMutation.mutate({ contactId: selectedContactId, content: message });
  }, [selectedContactId, sendMessageMutation, contactReachableChannels.length, toast]);

  const ACCEPTED_TYPES: Record<string, string> = {
    "image/jpeg": "image", "image/jpg": "image", "image/png": "image", "image/webp": "image",
    "application/pdf": "document",
    "audio/mpeg": "audio", "audio/mp3": "audio", "audio/m4a": "audio",
    "audio/x-m4a": "audio", "audio/ogg": "audio",
    "video/mp4": "video",
  };

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (e.target) e.target.value = "";

    const mediaType = ACCEPTED_TYPES[file.type];
    if (!mediaType) {
      toast({ title: "Unsupported file type", description: "Allowed: JPEG, PNG, WebP, PDF, MP3, M4A, OGG, MP4", variant: "destructive" });
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 16 MB", variant: "destructive" });
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setPendingFile({
        localPreview,
        mediaUrl: json.mediaUrl,
        mediaType: json.mediaType,
        mediaFilename: json.mediaFilename,
        mimeType: json.mimeType,
      });
    } catch (err: any) {
      URL.revokeObjectURL(localPreview);
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [toast]);

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

  // --- Template from inbox ---

  const sendTemplateFromInboxMutation = useMutation({
    mutationFn: async (data: { templateId: string; contactId: string; variables: Record<string, string> }) => {
      const res = await fetch("/api/templates/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send template");
      return json;
    },
    onSuccess: (data) => {
      toast({ title: "Template sent", description: data.message });
      setShowVarDialog(false);
      setShowTemplatePicker(false);
      setSelectedInboxTemplate(null);
      setVarValues({});
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", primaryConversation?.id, "messages"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send template", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenTemplatePicker = () => {
    setTemplateSearch("");
    setSelectedInboxTemplate(null);
    setVarValues({});
    setShowTemplatePicker(true);
  };

  const handleSelectTemplate = (template: MessageTemplate) => {
    setSelectedInboxTemplate(template);
    const initVars: Record<string, string> = {};
    (template.variables || []).forEach((v: string) => { initVars[v] = ""; });
    setVarValues(initVars);
    setShowTemplatePicker(false);
    setShowVarDialog(true);
  };

  const handleSendTemplateFromInbox = () => {
    if (!selectedInboxTemplate || !selectedContactId) return;
    sendTemplateFromInboxMutation.mutate({
      templateId: selectedInboxTemplate.id,
      contactId: selectedContactId,
      variables: varValues,
    });
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

  const getChannelIcon = (channel: Channel | undefined, size = "w-3 h-3") => {
    if (!channel) {
      return (
        <span title="No messaging channel">
          <AlertCircle className={cn(size, 'text-amber-500')} aria-hidden />
        </span>
      );
    }
    const config = CHANNEL_CONFIG[channel] || { icon: User, color: '#6B7280' };
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

          {/* Channel health bar — always shows all 5 channels; gray = not configured */}
          {(() => {
            const ORDERED = ['whatsapp', 'facebook', 'instagram', 'telegram', 'tiktok'];
            const LABELS: Record<string, string> = {
              whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram',
              telegram: 'Telegram', tiktok: 'TikTok',
            };
            // Build a map from health data; channels missing from data = not configured
            const healthMap = new Map(channelHealth.map(ch => [ch.channel, ch]));
            const rows = ORDERED.map(key => healthMap.get(key) ?? {
              channel: key, isConnected: false, isEnabled: false,
              pageName: null, healthy: null, issues: [], checks: {},
            });

            const getTooltip = (ch: typeof rows[0]) => {
              const label = LABELS[ch.channel] ?? ch.channel;
              if (!ch.isConnected) return `${label}: not configured — set up in Settings`;
              if (ch.healthy === true) {
                if (ch.channel === 'whatsapp') return `${label}: account verified and ready`;
                if (ch.channel === 'telegram') return `${label}: bot token valid, webhook active`;
                if (ch.channel === 'tiktok')   return `${label}: lead intake is active`;
                return `${label}: token valid, page accessible, webhook subscribed`;
              }
              if (ch.healthy === false) return `${label} issue: ${ch.issues[0] ?? 'check Settings'}`;
              return `${label}: status unknown`;
            };

            return (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t flex-wrap" data-testid="channel-health-bar">
                {rows.map(ch => {
                  const dotColor = !ch.isConnected
                    ? "bg-gray-300"
                    : ch.healthy === true ? "bg-emerald-500"
                    : ch.healthy === false ? "bg-red-500"
                    : "bg-gray-400";
                  const textColor = !ch.isConnected ? "text-gray-400" : "text-gray-500";
                  return (
                    <div
                      key={ch.channel}
                      title={getTooltip(ch)}
                      className={cn("flex items-center gap-1 text-[10px]", textColor)}
                      data-testid={`channel-health-${ch.channel}`}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", dotColor)} />
                      <span>{LABELS[ch.channel] ?? ch.channel}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* ── Channel health alert banner ── */}
        {showHealthAlert && (
          <div className="mx-3 mb-2 rounded-lg border border-red-200 bg-red-50 p-2.5" data-testid="channel-health-alert">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-700 leading-tight">
                  {unhealthyChannels.length === 1
                    ? `${unhealthyChannels[0].channel.charAt(0).toUpperCase() + unhealthyChannels[0].channel.slice(1)} channel issue`
                    : `${unhealthyChannels.length} channel issues detected`}
                </p>
                {unhealthyChannels.map(ch => (
                  <p key={ch.channel} className="text-[11px] text-red-600 mt-0.5 leading-tight">
                    {ch.channel.charAt(0).toUpperCase() + ch.channel.slice(1)}: {ch.issues[0] ?? 'unknown issue'}
                  </p>
                ))}
                <a
                  href="/app/settings"
                  className="text-[11px] text-red-700 font-medium underline underline-offset-2 mt-1 inline-block"
                  data-testid="channel-health-alert-settings-link"
                >
                  Fix in Settings →
                </a>
              </div>
              <button
                onClick={() => setDismissedHealthAlert(alertKey)}
                className="text-red-400 hover:text-red-600 flex-shrink-0"
                title="Dismiss"
                data-testid="channel-health-alert-dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

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
              <div className="flex items-center gap-1.5 flex-shrink-0">
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

                <div className="flex items-baseline gap-0.5 flex-shrink-0">
                  {metaWindowHeaderHint ? (
                    <span
                      className={cn(
                        'hidden sm:inline text-[9px] leading-none font-normal text-gray-400/90 whitespace-nowrap pr-0.5',
                        metaWindowHeaderHint.amber && 'text-amber-600/80'
                      )}
                      title="Time left for free-form messaging on this channel"
                      data-testid="meta-window-timer"
                    >
                      {metaWindowHeaderHint.text}
                    </span>
                  ) : null}

                  {/* Channel switcher */}
                  <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1 h-7 px-2 text-xs border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-700 bg-white shadow-none" data-testid="button-switch-channel" disabled={contactReachableChannels.length === 0} title={contactReachableChannels.length === 0 ? 'No messaging channel available for this contact' : undefined}>
                      {getChannelIcon(activeChannel)}
                      <span className="hidden sm:inline">
                        {activeChannel ? CHANNEL_CONFIG[activeChannel]?.label : 'No channel'}
                      </span>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {Object.entries(CHANNEL_CONFIG)
                      .filter(([k]) => k !== 'tiktok')
                      .filter(([k]) => contactReachableChannels.includes(k as Channel))
                      .map(([key, cfg]) => {
                      const Icon = cfg.icon;
                      const isActive = activeChannel === key;
                      return (
                        <DropdownMenuItem
                          key={key}
                          onClick={() => {
                            setSendChannelUi(key as Channel);
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
                </div>

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


            {windowStatus?.hasRestriction && !windowStatus.isActive && (
              <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center gap-2 text-xs text-red-700 flex-shrink-0">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1">24-hour reply window closed — you can't send new messages until they message you first. You can still receive their messages.</span>
                {isWhatsAppContact && (
                  <button
                    onClick={handleOpenTemplatePicker}
                    className="flex items-center gap-1 px-2 py-0.5 bg-red-100 hover:bg-red-200 text-red-700 rounded font-medium transition-colors whitespace-nowrap"
                    data-testid="button-use-template-banner"
                  >
                    <LayoutTemplate className="w-3 h-3" />
                    Use Template
                  </button>
                )}
              </div>
            )}
            {windowStatus?.hasRestriction && windowStatus.isActive && windowStatus.isExpiringSoon && (
              <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-700 flex-shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Reply window closes in {windowStatus.hoursRemaining}h — reply soon. You can always receive their messages.
              </div>
            )}

            {/* Messages area */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto relative"
              style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', backgroundSize: '400px' }}
            >
              <div className="absolute inset-0 bg-[#efeae2]/90 pointer-events-none" />
              <div ref={messagesInnerRef} className="relative z-10 p-3 pb-5 flex flex-col gap-1.5 min-h-full justify-end">
                {messagesLoading && messages.length === 0 ? (
                  <div className="flex flex-col gap-3 pb-4">
                    {[80, 55, 120, 45, 90].map((w, i) => (
                      <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                        <div className={`h-8 bg-white/70 rounded-lg animate-pulse`} style={{ width: `${w}%`, maxWidth: '65%' }} />
                      </div>
                    ))}
                  </div>
                ) : !messagesLoading && messages.length === 0 ? (
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
                          {(() => {
                            const hasMedia = !!(msg.mediaUrl || msg.mediaFilename);
                            const isOptimistic = msg.id.startsWith('optimistic-');
                            const proxyUrl = `/api/media/proxy?messageId=${encodeURIComponent(msg.id)}`;
                            // Outbound images use the authenticated proxy so URLs survive host/storage migration.
                            const imageSrc = isOptimistic && msg.mediaUrl ? msg.mediaUrl : proxyUrl;
                            const mediaDisplayUrl = isOut && msg.mediaUrl ? msg.mediaUrl : proxyUrl;
                            const ct = msg.contentType;
                            const isImage = ct === 'image' || msg.mediaType?.startsWith('image');
                            const isVideo = ct === 'video' || msg.mediaType?.startsWith('video');
                            const isAudio = ct === 'audio' || msg.mediaType?.startsWith('audio');
                            const isDoc = ct === 'document' || msg.mediaType === 'document';
                            if (hasMedia && isImage) return (
                              <div>
                                <img
                                  src={imageSrc}
                                  alt="Image"
                                  className="max-w-full rounded cursor-pointer max-h-64 object-cover"
                                  onClick={() => window.open(imageSrc, '_blank')}
                                  onLoad={() => {
                                    // ResizeObserver handles the re-scroll for most cases.
                                    // This is a direct backup for the first frame after decode.
                                    if (shouldPinRef.current || justSentRef.current) {
                                      scrollToBottom();
                                    }
                                    justSentRef.current = false;
                                  }}
                                  onError={(e) => {
                                    justSentRef.current = false;
                                    if (!isOptimistic) {
                                      (e.currentTarget.parentElement!).innerHTML =
                                        '<span class="text-xs text-gray-400 italic">Media no longer available</span>';
                                    }
                                  }}
                                />
                                {msg.content && <p className="leading-snug mt-1 text-sm">{msg.content}</p>}
                              </div>
                            );
                            if (hasMedia && isVideo) return (
                              <video
                                src={mediaDisplayUrl}
                                controls
                                className="max-w-full rounded max-h-64"
                                onLoadedMetadata={() => {
                                  if (shouldPinRef.current || justSentRef.current) {
                                    scrollToBottom();
                                  }
                                  justSentRef.current = false;
                                }}
                              />
                            );
                            if (hasMedia && isAudio) return (
                              <audio src={mediaDisplayUrl} controls className="max-w-full" />
                            );
                            if (hasMedia && isDoc) return (
                              <a href={mediaDisplayUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 underline">
                                <FileText className="w-4 h-4 flex-shrink-0" />
                                <span>{msg.mediaFilename || msg.content || 'Document'}</span>
                              </a>
                            );
                            return <p className="leading-snug">{msg.content}</p>;
                          })()}
                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            {msg.sentViaFallback && (
                              <span className="text-[10px] text-amber-600">via {msg.fallbackChannel}</span>
                            )}
                            <span className="text-[10px] text-gray-400">{format(new Date(msg.createdAt), 'h:mm a')}</span>
                            {isOut && (
                              isSending
                                ? <Loader2 className="w-2.5 h-2.5 text-gray-400 animate-spin" />
                                : msg.status === 'failed'
                                  ? <span className="text-[10px] text-red-500 font-medium">Not sent</span>
                                  : <span className="text-[10px] text-gray-400">
                                      {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                                    </span>
                            )}
                          </div>
                          {isOut && msg.status === 'failed' && (
                            <div className="text-[10px] text-red-400 text-right mt-0.5">
                              Delivery failed — check channel settings
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} className="h-1 shrink-0" />
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

            {/* File preview strip */}
            {(pendingFile || isUploading) && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 flex items-center gap-3">
                {isUploading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    Uploading…
                  </div>
                ) : pendingFile ? (
                  <>
                    {pendingFile.mediaType === 'image' && (
                      <img src={pendingFile.localPreview} alt="Preview" className="h-16 w-16 object-cover rounded border border-gray-200" />
                    )}
                    {pendingFile.mediaType === 'video' && (
                      <video src={pendingFile.localPreview} className="h-16 w-16 object-cover rounded border border-gray-200" />
                    )}
                    {pendingFile.mediaType === 'audio' && (
                      <audio src={pendingFile.localPreview} controls className="max-w-[200px] h-8" />
                    )}
                    {pendingFile.mediaType === 'document' && (
                      <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded px-2 py-1.5">
                        <FileText className="w-5 h-5 text-gray-500 flex-shrink-0" />
                        <span className="text-xs text-gray-700 max-w-[140px] truncate">{pendingFile.mediaFilename}</span>
                      </div>
                    )}
                    <button
                      data-testid="button-remove-attachment"
                      onClick={() => { setPendingFile(null); URL.revokeObjectURL(pendingFile.localPreview); }}
                      className="ml-auto p-1 rounded-full hover:bg-gray-200 text-gray-500"
                      title="Remove attachment"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : null}
              </div>
            )}

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
              onTemplate={isWhatsAppContact ? handleOpenTemplatePicker : undefined}
              fileInputRef={fileInputRef}
              handleFileSelect={handleFileSelect}
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

      {/* Template Picker Dialog */}
      <Dialog open={showTemplatePicker} onOpenChange={setShowTemplatePicker}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-emerald-600" />
              Send WhatsApp Template
            </DialogTitle>
          </DialogHeader>
          {isDemoUser ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <LayoutTemplate className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800 mb-1">Connect WhatsApp to send templates</p>
                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                  Template messaging lets you reach contacts outside the 24-hour window. Connect your WhatsApp account in Settings to use this feature.
                </p>
              </div>
              <a
                href="/app/settings"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                data-testid="link-connect-whatsapp"
              >
                Go to Settings
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Input
                placeholder="Search templates…"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                data-testid="input-template-search"
              />
              {inboxTemplates.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  No templates found. Go to the Templates page to sync your WhatsApp templates.
                </p>
              ) : (
                <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                  {inboxTemplates
                    .filter((t) =>
                      t.status === "approved" &&
                      (t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                        t.bodyText?.toLowerCase().includes(templateSearch.toLowerCase()))
                    )
                    .map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleSelectTemplate(t)}
                        className="text-left p-3 border border-gray-200 rounded-lg hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                        data-testid={`template-item-${t.id}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900">{t.name}</span>
                          <span className="text-[10px] text-gray-400 uppercase">{t.language}</span>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2">{t.bodyText}</p>
                      </button>
                    ))}
                  {inboxTemplates.filter((t) =>
                    t.status === "approved" &&
                    (t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                      t.bodyText?.toLowerCase().includes(templateSearch.toLowerCase()))
                  ).length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">No approved templates match your search.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Variable Fill Dialog */}
      <Dialog open={showVarDialog} onOpenChange={(open) => {
        setShowVarDialog(open);
        if (!open) setShowTemplatePicker(false);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-emerald-600" />
              {selectedInboxTemplate?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedInboxTemplate && (
            <div className="flex flex-col gap-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap border border-gray-200">
                {selectedInboxTemplate.bodyText}
              </div>
              {(selectedInboxTemplate.variables || []).length > 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-gray-500 font-medium">Fill in the variables:</p>
                  {(selectedInboxTemplate.variables || [])
                    .slice()
                    .sort((a, b) => {
                      const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
                      const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
                      return na - nb;
                    })
                    .map((v) => (
                      <div key={v} className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-600">{v}</label>
                        <Input
                          placeholder={`Value for ${v}`}
                          value={varValues[v] || ""}
                          onChange={(e) => setVarValues((prev) => ({ ...prev, [v]: e.target.value }))}
                          data-testid={`input-template-var-${v.replace(/[{}]/g, "")}`}
                        />
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">This template has no variables. Ready to send.</p>
              )}
              <div className="flex justify-end gap-2 mt-1">
                <Button
                  variant="outline"
                  onClick={() => { setShowVarDialog(false); setShowTemplatePicker(true); }}
                  data-testid="button-template-back"
                >
                  Back
                </Button>
                <Button
                  onClick={handleSendTemplateFromInbox}
                  disabled={sendTemplateFromInboxMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="button-template-send"
                >
                  {sendTemplateFromInboxMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Sending…</>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Template
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
