import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, type ComponentProps } from "react";
import { apiRequest } from "@/lib/queryClient";
import { WHATSAPP_FREE_FORM_BUFFER_MS } from "@shared/conversationReplyWindow";
import {
  friendlyHeaderDocumentLabelForLibraryPreview,
  getInboxTemplateSendBlockReason,
  carouselDefaultMediaUrlsForLivePreview,
  type TemplateCarouselDefaultMediaMap,
} from "@shared/metaTemplateSend";
import { waUploadFileSizeCheck, waUploadTooLargeMessage } from "@shared/whatsappMediaLimits";
import { Link, useRoute, useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  resolveInboxSelectionState,
  shouldFetchInboxMessages,
} from "@/lib/inboxSelectionState";
import { inboxRowKey, isEmailConversationChannel } from "@shared/inboxRowModel";
import {
  PROSPECT_OUTREACH_COMPOSE_STORAGE_KEY,
  parseProspectOutreachComposePayload,
  prospectOutreachPayloadDiag,
  shouldStripProspectComposeQuery,
  type ProspectOutreachComposePayload,
} from "@shared/prospectContactEnrichment";
import { useSubscription } from "@/lib/subscription-context";
import { AIComposer, type AIComposerHandle, type ContactContext } from "@/components/AIComposer";
import { WhatsAppTemplateRichPreview } from "@/components/WhatsAppTemplateRichPreview";
import {
  CalendlyAppointmentChip,
  findExpandedCalendlyMessageIndex,
  parseCalendlyEventMessage,
} from "@/components/inbox/CalendlyAppointmentChip";
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
  Calendar,
  CalendarCheck,
  ShoppingCart,
  Mail,
} from "lucide-react";
import { EmailMessageBody } from "@/components/inbox/EmailMessageBody";
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
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ChatAvatar } from "@/components/ChatAvatar";
import { TAG_COLORS } from "@/lib/data";
import { isCrmDisplayTag, nextActiveAppointmentByContact } from "@shared/activeAppointment";
import { getConversationStatusRow } from "@/lib/conversationStatusUi";
import { useToast } from "@/hooks/use-toast";
import { InboxLeadDetailsPanel } from "@/components/InboxLeadDetailsPanel";
import { useAICapabilities } from "@/lib/useAICapabilities";
import type { ActivationStatusPayload } from "@/lib/activationStatus";
import { settingsChannelsHref } from "@/lib/settingsChannelsNavigation";
import { analyzeConversation } from "@/lib/conversationIntelligence";
import { WHATSAPP_SETUP_INCOMPLETE_BANNER } from "@shared/whatsappSetupMessages";
import {
  buildBuyerPreferenceAiContext,
} from "@shared/buyerPreferenceDisplay";
import { shouldInjectBuyerRealEstateContext } from "@shared/aiDomainEligibility";
import { extractBuyerMatchCriteria } from "@shared/inventory/inventoryMatchScoring";
import { usePersistedBuyerPreferences } from "@/lib/buyerPreferencesQuery";
import { isConversationHandoffActive } from "@shared/handoffActivity";
import {
  type CopilotComposerInsert,
  normalizeCopilotComposerInsert,
} from "@/lib/copilotComposerInsert";
import {
  buildComposerDraftScopeKey,
  clearComposerDraft,
  loadComposerDraft,
  logComposerDraftTrace,
  saveComposerDraft,
  shouldApplyComposerDraft,
  type ComposerDraftMeta,
} from "@/lib/composerDraftScope";
import { scheduleInventoryMatchesRefetch } from "@/lib/inventoryMatchesQuery";
import {
  isGenericOutboundSendFallbackMessage,
  isMetaReplyWindowExpiredError,
  errorLooksLikeReplyWindowOrTemplateBlock,
  userFacingReplyWindowBlockedMessageInbox,
} from "@/lib/metaReplyWindowError";
import {
  isMediaChannelValidationError,
  mediaChannelValidationBubbleText,
} from "@/lib/mediaChannelValidationError";
import { outboundDocumentBlockHint } from "@/lib/outboundAttachmentChannelGate";
import {
  applyInboxConversationMarkRead,
  inboxConversationRowChromeClassName,
  INBOX_ROW_BODY,
  INBOX_ROW_CHANNEL_ICON_WRAP,
  INBOX_ROW_CHIP,
  INBOX_ROW_INNER,
  INBOX_ROW_LINE1,
  INBOX_ROW_LINE2,
  INBOX_ROW_LINE3,
  INBOX_ROW_NAME,
  INBOX_ROW_NAME_UNREAD,
  INBOX_ROW_PREVIEW,
  INBOX_ROW_PREVIEW_UNREAD,
  INBOX_ROW_TIME,
  INBOX_ROW_UNREAD_BADGE,
  mergeInboxUnreadPreservingLocalRead,
  remainingContactUnreadAfterMarkingConversation,
} from "@/lib/inboxConversationRow";
import {
  INBOX_CHANNEL_HEALTH_LABELS,
  buildInboxChannelHealthRows,
} from "@shared/inboxChannelHealthBar";
import { formatOutboundSendErrorDescription } from "@/lib/webchatSendError";
import { webchatSendErrorDescription } from "@shared/webchatSendErrors";

type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'sms' | 'webchat' | 'telegram' | 'tiktok' | 'gohighlevel' | string;

type InboxLeadDetailsPanelContact = ComponentProps<typeof InboxLeadDetailsPanel>["contact"];
type InboxLeadDetailsPanelConversation = ComponentProps<typeof InboxLeadDetailsPanel>["primaryConversation"];

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
  /** CRM / RGE persisted score (0–100); Copilot uses as primary when present. */
  leadScore?: number | null;
  whatsappId?: string;
  instagramId?: string;
  facebookId?: string;
  telegramId?: string;
  /** Matches server: used to resolve default channel when override is invalid */
  lastIncomingChannel?: Channel;
  ghlId?: string;
  customFields?: Record<string, unknown>;
  buyerPreferenceProfile?: unknown;
}

interface Conversation {
  id: string;
  channel: Channel;
  status: string;
  unreadCount: number;
  channelAccountId?: string | null;
  externalThreadId?: string | null;
  subject?: string | null;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageDirection?: string;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  contentType: string;
  /** WhatsApp template sends — mirrors `messages.template_variables` JSON */
  templateVariables?: Record<string, unknown> | null;
  mediaUrl?: string;
  mediaType?: string;
  mediaFilename?: string;
  platformMediaId?: string;
  status: string;
  createdAt: string;
  sentViaFallback?: boolean;
  fallbackChannel?: Channel;
  /** Set client-side when send fails with Meta reply-window policy or channel media rules */
  deliveryFailureKind?: "meta_reply_window" | "media_validation";
  /** User-facing line for `media_validation` (shown in bubble only, no toast). */
  deliveryFailureInline?: string;
  errorMessage?: string | null;
  errorCode?: string | null;
}

/** Prefer direct <img src> for permanent URLs (R2, app uploads); never use expiring provider CDNs. */
function isClientRenderableMediaUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("blob:") || url.startsWith("/")) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const h = new URL(url).hostname;
    if (/fbcdn\.net|facebook\.com|fbsbx\.com|lookaside\.fbsbx\.com|twilio\.com|graph\.facebook\.com/i.test(h)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function inferTemplateMediaKindFromUrl(url: string): "image" | "video" | "document" {
  const pathOnly = (url.split("?")[0] ?? "").toLowerCase();
  if (/\.(mp4|webm)$/i.test(pathOnly)) return "video";
  if (/\.pdf$/i.test(pathOnly)) return "document";
  return "image";
}

interface InboxItem {
  contact: Contact;
  conversation: Conversation | null;
  channel: Channel;
  lastMessage: string;
  lastMessageAt: string | null;
  /** Unread for the conversation represented by this row (not contact aggregate). */
  unreadCount: number;
  /** Sum across all conversations for this contact (Unread filter). */
  contactUnreadTotal?: number;
  /** Email thread rows: newest local message id for quick-delete of latest Gmail message. */
  lastEmailMessageId?: string | null;
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
  conversationId?: string | null;
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
  provider: "meta" | "twilio" | "none";
  fullyReady?: boolean;
  setupIncomplete?: boolean;
  reason?: string;
  message?: string;
  bannerText?: string;
  readiness?: {
    wabaSaved: boolean;
    phoneSaved: boolean;
    phoneStatusReady: boolean;
    webhookSubscribed: boolean;
    inboxReady: boolean;
  };
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
  templateType?: string | null;
  carouselCards?: unknown[] | null;
  buttons?: unknown[] | null;
  twilioSid?: string | null;
  carouselDefaultMedia?: TemplateCarouselDefaultMediaMap | null;
}

const CHANNEL_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  whatsapp: { icon: MessageCircle, color: '#25D366', label: 'WhatsApp' },
  instagram: { icon: Instagram, color: '#E4405F', label: 'Instagram' },
  facebook: { icon: Facebook, color: '#1877F2', label: 'Messenger' },
  sms: { icon: Smartphone, color: '#6B7280', label: 'SMS' },
  webchat: { icon: Globe, color: '#3B82F6', label: 'Web Chat' },
  telegram: { icon: Send, color: '#0088CC', label: 'Telegram' },
  tiktok: { icon: Video, color: '#000000', label: 'TikTok' },
  email: { icon: Mail, color: '#EA4335', label: 'Email' },
  gohighlevel: { icon: Zap, color: '#F97316', label: 'CRM' },
  calendly: { icon: Calendar, color: '#006BFF', label: 'Calendly' },
  shopify: { icon: ShoppingCart, color: '#96BF48', label: 'Shopify' },
  woocommerce: { icon: ShoppingCart, color: '#96588A', label: 'WooCommerce' },
};

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
  if (c.email && String(c.email).includes('@')) keys.add('email');
  if (contactHasWebchatReachability(c, conversations)) keys.add('webchat');
  const order: Channel[] = ['whatsapp', 'instagram', 'facebook', 'sms', 'webchat', 'telegram', 'email', 'gohighlevel'];
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
  calendly: 'Calendly',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
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

/** Shown when inbox quick-send blocks non–body-only templates (UI copy only; guard logic is in `@shared/metaTemplateSend`). */
const INBOX_QUICK_SEND_ADVANCED_COPY =
  "This approved WhatsApp template uses media, buttons, or carousel content. Quick-send supports text templates for now.";

/** Preview modal for blocked templates — aligns with Templates library messaging (UI only). */
const INBOX_ADVANCED_PREVIEW_MODAL_NOTE =
  "This template includes media, buttons, or carousel content. Quick-send support is coming soon.";

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
  const [match, params] = useRoute("/app/inbox/:contactId?");
  const [pathname, setLocation] = useLocation();
  const searchString = useSearch();
  const { user } = useAuth();
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const { toast } = useToast();
  /** Set after `replyWindowNow` exists; WS handler bumps clock when inbound pushes so UI doesn’t wait for the 1m tick. */
  const bumpReplyWindowClockRef = useRef<() => void>(() => {});
  /** Ignore first snapshot per conversation; then invalidate window-status when a new inbound tail appears (polling path). */
  const lastInboundTailRef = useRef<{ convId: string; msgId: string } | null>(null);

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
        ws!.send(JSON.stringify({ type: "auth", userId: user.id, userName: user.name || "Agent" }));
        heartbeat = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "heartbeat" }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "auth_success") {
            /* no-op */
          } else if (msg.type === "new_message") {
            queryClient.refetchQueries({ queryKey: ["/api/inbox"], type: "active" });
            if (typeof msg.contactId === "string" && msg.contactId) {
              queryClient.invalidateQueries({
                queryKey: ["/api/contacts", msg.contactId],
              });
              void queryClient.refetchQueries({
                queryKey: ["/api/contacts", msg.contactId],
                type: "active",
              });
            }
            if (msg.replyWindowReopened) {
              queryClient.invalidateQueries({ queryKey: ["/api/templates/retargetable-chats"] });
              toast({
                title: "Reply window reopened",
                description: "This conversation is back in your Inbox with a fresh messaging window.",
              });
            }
            if (msg.conversationId) {
              queryClient.refetchQueries({
                queryKey: ["/api/conversations", msg.conversationId, "messages"],
                type: "active",
              });
              queryClient.invalidateQueries({
                queryKey: ["/api/conversations", msg.conversationId, "window-status"],
              });
              bumpReplyWindowClockRef.current();
            }
          } else if (msg.type === "calendly_booking_confirmed") {
            queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
            queryClient.refetchQueries({ queryKey: ["/api/inbox"], type: "active" });
            if (msg.conversationId) {
              queryClient.invalidateQueries({
                queryKey: ["/api/conversations", msg.conversationId, "messages"],
              });
            }
            toast({
              title: "Booking confirmed",
              description:
                typeof msg.title === "string" && msg.title
                  ? msg.title
                  : "A lead completed scheduling via Calendly.",
            });
          } else if (msg.type === "buyer_preferences_updated" && typeof msg.contactId === "string") {
            const contactId = msg.contactId;
            if (typeof msg.buyerMatchingTraceId === "string") {
              void import("@/lib/buyerMatchingTraceStore").then(({ setBuyerMatchingTraceId }) => {
                setBuyerMatchingTraceId(contactId, msg.buyerMatchingTraceId);
              });
            }
            queryClient.invalidateQueries({
              queryKey: [`/api/contacts/${contactId}/buyer-preferences`],
            });
            void queryClient.refetchQueries({
              queryKey: [`/api/contacts/${contactId}/buyer-preferences`],
              type: "active",
            });
            scheduleInventoryMatchesRefetch(queryClient, contactId, {
              debounceMs: 400,
              clearCachedMatches: true,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] });
          }
        } catch {}
      };

      ws.onclose = (evt) => {
        clearInterval(heartbeat);
        if (!destroyed) {
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
  }, [user, queryClient, toast]);

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

  const businessAiMode = useMemo((): "off" | "suggest" | "auto" => {
    const raw = (aiSettings as any)?.aiMode as string | undefined;
    if (raw === "full_auto" || raw === "auto") return "auto";
    if (raw === "suggest_only" || raw === "suggest") return "suggest";
    return "off";
  }, [(aiSettings as any)?.aiMode]);

  const handoffKeywords = useMemo((): string[] => {
    const raw = (aiSettings as any)?.handoffKeywords;
    return Array.isArray(raw) ? raw.map((x: any) => String(x || "").trim()).filter(Boolean) : [];
  }, [(aiSettings as any)?.handoffKeywords]);

  // Unified AI capabilities from plan + usage data
  const capabilities = useAICapabilities();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const allChannels: Channel[] = ['whatsapp', 'instagram', 'facebook', 'sms', 'webchat', 'telegram', 'email', 'tiktok', 'calendly', 'shopify', 'woocommerce'];
  const [selectedChannels, setSelectedChannels] = useState<Set<Channel>>(new Set(allChannels));
  const [messageInput, setMessageInput] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  /** PI / manual: compose a brand-new email thread (not reply to an existing Gmail thread). */
  const [forceNewEmailCompose, setForceNewEmailCompose] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const composeNew = params.get("compose") === "new";
    const channel = params.get("channel");
    return composeNew && (!channel || channel === "email");
  });
  const forceNewEmailComposeRef = useRef(false);
  forceNewEmailComposeRef.current = forceNewEmailCompose;
  const pendingOutreachPrefillRef = useRef<ProspectOutreachComposePayload | null>(null);
  /** True after subject+body from PI handoff have been written into compose state. */
  const outreachHandoffAdoptedRef = useRef(false);
  const prevContactForComposeRef = useRef<string | null>(null);
  const messageInputRef = useRef(messageInput);
  messageInputRef.current = messageInput;
  const prevComposerScopeRef = useRef<string | null>(null);
  const isMobile = useIsMobile();
  const [showEditContact, setShowEditContact] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [emailTrashTarget, setEmailTrashTarget] = useState<{
    messageId: string;
    /** list = latest message on thread row; bubble = exact open message */
    source: "list" | "bubble";
  } | null>(null);
  const [showDetailsSheet, setShowDetailsSheet] = useState(false);
  const [editContactForm, setEditContactForm] = useState({ name: "", phone: "", email: "" });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<AIComposerHandle>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesInnerRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const prevLastMessageSigRef = useRef<string>("");
  const prevContactIdRef = useRef<string | null>(null);
  const [showNewMsgBanner, setShowNewMsgBanner] = useState(false);
  // true when user is at/near the bottom — auto-scroll should happen
  const shouldPinRef = useRef(true);
  // Set to true on every send so that all post-render scrolls are forced,
  // regardless of where the user was scrolled before they sent.
  const justSentRef = useRef(false);
  /** Conversations cleared in this session — blocks stale inbox refetch from restoring that row badge. */
  const recentlyClearedConversationIdsRef = useRef<Set<string>>(new Set());
  const recentlyClearedClearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const scrollToBottom = useCallback(() => {
    const run = () => {
      const c = messagesContainerRef.current;
      const end = messagesEndRef.current;
      if (end) {
        end.scrollIntoView({ block: "end", behavior: "instant" });
      }
      if (c) {
        c.scrollTop = Math.max(0, c.scrollHeight - c.clientHeight);
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
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
  /** Inline hint under composer (replaces toast for picker / type validation). */
  const [filePickerHint, setFilePickerHint] = useState<string | null>(null);

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedInboxTemplate, setSelectedInboxTemplate] = useState<MessageTemplate | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [inboxTemplatePreviewOpen, setInboxTemplatePreviewOpen] = useState(false);
  const [inboxPreviewTemplate, setInboxPreviewTemplate] = useState<MessageTemplate | null>(null);

  const selectedContactId =
    match && params?.contactId != null && String(params.contactId).length > 0
      ? String(params.contactId)
      : null;

  /**
   * Email thread identity from `?conversation=`.
   * MUST depend on `searchString` (wouter useSearch) — pathname alone does not change when
   * switching sibling threads for the same contactId, which previously left selection stuck.
   */
  const selectedConversationId = useMemo(() => {
    const id = new URLSearchParams(searchString || "").get("conversation");
    return id && id.trim() ? id.trim() : null;
  }, [searchString]);

  const buildInboxHref = useCallback((contactId: string, conversationId?: string | null) => {
    if (conversationId) {
      return `/app/inbox/${contactId}?conversation=${encodeURIComponent(conversationId)}`;
    }
    return `/app/inbox/${contactId}`;
  }, []);

  useEffect(() => {
    setFilePickerHint(null);
    setPendingFile((prev) => {
      if (prev?.localPreview) URL.revokeObjectURL(prev.localPreview);
      return null;
    });
  }, [selectedContactId, selectedConversationId]);

  const insertComposerDraftFromCopilot = useCallback(
    (draft: CopilotComposerInsert): boolean => {
      if (!selectedContactId) {
        console.warn("[Copilot] Cannot insert draft: no conversation selected");
        return false;
      }
      const normalized = normalizeCopilotComposerInsert(draft);
      const inserted =
        composerRef.current?.insertExternalDraft(normalized.text, {
          preserveAiMode: normalized.preserveAiMode,
          primaryPhotoUrl: normalized.primaryPhotoUrl,
        }) ?? false;
      if (!inserted) {
        console.warn("[Copilot] Failed to insert composer draft");
      }
      return inserted;
    },
    [selectedContactId],
  );

  const attachComposerPendingMedia = useCallback(
    (media: { url: string; mediaType: "image" | "video"; filename?: string } | null) => {
      if (!media) {
        setPendingFile(null);
        return;
      }
      setPendingFile({
        localPreview: media.url,
        mediaUrl: media.url,
        mediaType: media.mediaType,
        mediaFilename: media.filename || "listing-photo.jpg",
        mimeType: media.mediaType === "image" ? "image/jpeg" : "",
      });
    },
    [],
  );

  const {
    data: inboxData,
    isPending: inboxPending,
    isFetching: inboxIsFetching,
    isRefetching: inboxIsRefetching,
    fetchStatus: inboxFetchStatus,
    status: inboxQueryStatus,
    error: inboxQueryError,
    isEnabled: inboxQueryEnabled,
  } = useQuery<InboxItem[]>({
    queryKey: ["/api/inbox"],
    staleTime: 10_000,
    refetchInterval: () =>
      typeof document !== "undefined" && document.hidden ? false : 15_000,
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/inbox", {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (!res.ok) {
        throw new Error(`${res.status}: ${await res.text()}`);
      }
      const incoming = (await res.json()) as InboxItem[];
      const previous = queryClient.getQueryData<InboxItem[]>(["/api/inbox"]);
      return mergeInboxUnreadPreservingLocalRead(
        previous,
        incoming,
        recentlyClearedConversationIdsRef.current,
      );
    },
  });

  const inbox: InboxItem[] = useMemo(() => inboxData || [], [inboxData]);

  const { data: inboxAppointments = [] } = useQuery<Array<{
    id: string;
    contactId: string;
    appointmentDate: string;
    title?: string;
    appointmentType?: string;
    status?: string;
  }>>({
    queryKey: ["/api/appointments"],
    staleTime: 30_000,
  });

  const nextAppointmentByContact = useMemo(
    () => nextActiveAppointmentByContact(inboxAppointments),
    [inboxAppointments]
  );

  const { data: contactData } = useQuery<{ contact: Contact; conversations: Conversation[] }>({
    queryKey: ["/api/contacts", selectedContactId],
    enabled: !!selectedContactId,
    // keepPreviousData is OK for network caching, but UI must gate on contact.id === selectedContactId
    // via resolveInboxSelectionState — never render previous contact's conversations/messages.
    placeholderData: keepPreviousData,
  });

  const inboxSelectedItem = useMemo(() => {
    if (!selectedContactId) return undefined;
    if (selectedConversationId) {
      return inbox.find(
        (item) =>
          item.contact.id === selectedContactId &&
          item.conversation?.id === selectedConversationId,
      );
    }
    // Prefer non-email (messaging) row when no conversation query is present.
    return (
      inbox.find(
        (item) =>
          item.contact.id === selectedContactId &&
          !isEmailConversationChannel(item.channel),
      ) || inbox.find((item) => item.contact.id === selectedContactId)
    );
  }, [inbox, selectedContactId, selectedConversationId]);

  /**
   * Sticky sibling thread while actively reading. Cleared on contact change or
   * when the user re-clicks the row (open newest primary).
   */
  const stickyConversationIdRef = useRef<string | null>(null);
  const stickyContactIdRef = useRef<string | null>(null);
  if (selectedContactId !== stickyContactIdRef.current) {
    stickyContactIdRef.current = selectedContactId ?? null;
    stickyConversationIdRef.current = null;
  }
  const [stickyEpoch, setStickyEpoch] = useState(0);
  const clearStickyAndOpenNewest = useCallback(() => {
    stickyConversationIdRef.current = null;
    setStickyEpoch((n) => n + 1);
  }, []);

  // First pass: match contact only (channel preference computed after reachable channels).
  const contactMatchesSelection = contactData?.contact?.id === selectedContactId;
  const matchedContact = contactMatchesSelection ? contactData!.contact : undefined;
  const matchedConversations = contactMatchesSelection ? (contactData?.conversations ?? []) : [];

  /** Header/CRM: matched detail or inbox list row — never a mismatched previous contact. */
  const displayContact: Contact | undefined =
    matchedContact ?? (inboxSelectedItem?.contact as Contact | undefined);

  const { profile: persistedBuyerProfile } = usePersistedBuyerPreferences(selectedContactId);

  const contactReachableChannels = useMemo(
    () => getReachableChannelsForContact(displayContact, matchedConversations),
    [displayContact, matchedConversations]
  );

  useEffect(() => {
    const prev = prevContactForComposeRef.current;
    if (prev && prev !== selectedContactId) {
      setForceNewEmailCompose(false);
      pendingOutreachPrefillRef.current = null;
      outreachHandoffAdoptedRef.current = false;
      console.info(
        JSON.stringify({
          tag: "[ProspectOutreachHandoff]",
          event: "draft_reset",
          reason: "contact_changed",
          contactId: selectedContactId,
          composeMode: "new",
        }),
      );
    }
    prevContactForComposeRef.current = selectedContactId;
  }, [selectedContactId]);

  /** Deep link from Templates / Prospect Intelligence outreach. */
  useEffect(() => {
    if (!selectedContactId) return;
    const params = new URLSearchParams(window.location.search);
    const rawChannel = params.get("channel");
    const focusComposer =
      params.get("focusComposer") === "1" || params.get("focusComposer") === "true";
    const composeNew = params.get("compose") === "new";

    if (!rawChannel && !focusComposer && !composeNew) return;

    const validSocial =
      rawChannel === "whatsapp" || rawChannel === "facebook" || rawChannel === "instagram"
        ? rawChannel
        : null;
    const wantEmail = rawChannel === "email" || (composeNew && (!rawChannel || rawChannel === "email"));

    const stripQuery = () => {
      const conv = composeNew ? null : params.get("conversation");
      setLocation(buildInboxHref(selectedContactId, conv), { replace: true });
    };

    const focusComposerInput = () => {
      requestAnimationFrame(() => {
        document.querySelector<HTMLTextAreaElement>('[data-testid="input-message"]')?.focus();
      });
    };

    const logHandoff = (event: string, data: Record<string, unknown>) => {
      console.info(
        JSON.stringify({
          tag: "[ProspectOutreachHandoff]",
          event,
          contactId: selectedContactId,
          composeMode: composeNew ? "new" : "reply",
          ...data,
        }),
      );
      // #region agent log
      if (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
        fetch("http://127.0.0.1:7693/ingest/2f005315-cdf4-402a-a15b-868ee3486ee2", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "32aec0" },
          body: JSON.stringify({
            sessionId: "32aec0",
            runId: "pi-outreach-handoff",
            hypothesisId: "H-handoff",
            location: "UnifiedInbox.tsx:outreachHandoff",
            message: event,
            data: { contactIdPrefix: selectedContactId.slice(0, 8), ...data },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      }
      // #endregion
    };

    const loadOutreachPayload = (): ProspectOutreachComposePayload | null => {
      if (pendingOutreachPrefillRef.current?.contactId === selectedContactId) {
        return pendingOutreachPrefillRef.current;
      }
      try {
        const raw = sessionStorage.getItem(PROSPECT_OUTREACH_COMPOSE_STORAGE_KEY);
        const parsed = parseProspectOutreachComposePayload(raw, selectedContactId);
        if (!parsed) {
          logHandoff("payload_loaded", {
            found: false,
            emailReachable: contactReachableChannels.includes("email"),
            ...prospectOutreachPayloadDiag(null),
          });
          return null;
        }
        pendingOutreachPrefillRef.current = parsed;
        logHandoff("payload_loaded", {
          found: true,
          emailReachable: contactReachableChannels.includes("email"),
          ...prospectOutreachPayloadDiag(parsed),
        });
        return parsed;
      } catch {
        return null;
      }
    };

    const adoptOutreachPayload = (payload: ProspectOutreachComposePayload) => {
      if (outreachHandoffAdoptedRef.current) return true;
      setForceNewEmailCompose(true);
      setSendChannelUi("email");
      if (payload.subject) setEmailSubject(payload.subject);
      if (payload.body?.trim()) {
        setMessageInput(payload.body);
      }
      // Keep payload briefly so the composer-scope effect can persist the draft scope key.
      pendingOutreachPrefillRef.current = payload;
      outreachHandoffAdoptedRef.current = true;
      try {
        sessionStorage.removeItem(PROSPECT_OUTREACH_COMPOSE_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      logHandoff("draft_hydrated", {
        ...prospectOutreachPayloadDiag(payload),
        manualMode: true,
      });
      logHandoff("payload_consumed", {
        ...prospectOutreachPayloadDiag(payload),
      });
      logHandoff("manual_mode_initialized", { forceNewEmailCompose: true });
      return true;
    };

    // Wait for contact channel data before deciding — empty list means still loading.
    if (contactReachableChannels.length === 0) return;

    if (composeNew && wantEmail) {
      const emailReachable = contactReachableChannels.includes("email");
      const payload = loadOutreachPayload();

      if (!emailReachable) {
        // Keep compose=new in the URL until email is on the contact (manual enrich race).
        logHandoff("waiting_for_email", {
          emailReachable: false,
          ...prospectOutreachPayloadDiag(payload),
        });
        return;
      }

      if (payload && !outreachHandoffAdoptedRef.current) {
        adoptOutreachPayload(payload);
      } else {
        setForceNewEmailCompose(true);
        setSendChannelUi("email");
      }

      if (
        shouldStripProspectComposeQuery({
          composeNew: true,
          emailReachable: true,
          handoffAdopted: outreachHandoffAdoptedRef.current || !payload,
        })
      ) {
        stripQuery();
      }
      if (focusComposer) focusComposerInput();
      return;
    }

    if (!validSocial && !focusComposer) {
      stripQuery();
      return;
    }

    if (validSocial) {
      if (contactReachableChannels.includes(validSocial as Channel)) {
        setSendChannelUi(validSocial as Channel);
        stripQuery();
        if (focusComposer) focusComposerInput();
      } else {
        stripQuery();
      }
      return;
    }

    if (focusComposer) {
      stripQuery();
      focusComposerInput();
    }
  }, [
    selectedContactId,
    contactReachableChannels,
    setLocation,
    buildInboxHref,
  ]);

  // Mirror backend getPrimaryChannel, then clamp to channels this contact can actually use.
  // Use displayContact (matched detail or inbox list) — never previous-contact placeholder data.
  const effectiveChannel = useMemo(() => {
    const c = displayContact;
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
  }, [displayContact, contactReachableChannels]);

  const selectionBase = useMemo(
    () =>
      resolveInboxSelectionState({
        selectedContactId,
        contactQueryData: contactData,
        preferredChannel: effectiveChannel ?? null,
        messagesQueryData: null,
        inboxListContact: inboxSelectedItem?.contact ?? null,
        inboxRowConversation: (inboxSelectedItem?.conversation as Conversation | null) ?? null,
        selectedConversationId,
        stickyConversationId: selectedConversationId
          ? null
          : stickyConversationIdRef.current,
      }),
    // stickyEpoch forces re-resolve after clearStickyAndOpenNewest / lock
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sticky via ref + epoch
    [
      selectedContactId,
      selectedConversationId,
      contactData,
      effectiveChannel,
      inboxSelectedItem?.contact,
      inboxSelectedItem?.conversation,
      stickyEpoch,
    ],
  );

  const primaryConversation = (selectionBase.primaryConversation as Conversation | null) ?? undefined;
  const activeConversationId = selectionBase.activeConversationId;

  // Lock sticky to the conversation currently being viewed (once resolved).
  // Explicit URL conversation always wins and refreshes sticky for passive inbox refreshes.
  useEffect(() => {
    if (!selectedContactId || !activeConversationId) return;
    if (selectedConversationId) {
      stickyConversationIdRef.current = selectedConversationId;
      return;
    }
    if (!stickyConversationIdRef.current) {
      stickyConversationIdRef.current = activeConversationId;
    }
  }, [selectedContactId, activeConversationId, selectedConversationId]);

  const composerScopeKey = useMemo(() => {
    if (!selectedContactId) return null;
    return buildComposerDraftScopeKey(
      selectedContactId,
      primaryConversation?.channelAccountId ?? null,
      primaryConversation?.channel ?? effectiveChannel ?? null,
    );
  }, [
    selectedContactId,
    primaryConversation?.channelAccountId,
    primaryConversation?.channel,
    effectiveChannel,
  ]);

  const handleComposerChange = useCallback(
    (val: string, meta?: ComposerDraftMeta) => {
      if (
        meta?.contactId &&
        !shouldApplyComposerDraft({
          activeContactId: selectedContactId,
          activeConversationId: primaryConversation?.id ?? null,
          draftContactId: meta.contactId,
          draftConversationId: meta.conversationId,
        })
      ) {
        logComposerDraftTrace({
          event: "ignore_stale",
          activeContactId: selectedContactId,
          draftContactId: meta.contactId,
          source: meta.source,
          conversationId: meta.conversationId ?? null,
        });
        return;
      }
      setMessageInput(val);
      if (composerScopeKey) {
        if (val.trim()) {
          saveComposerDraft(composerScopeKey, val, meta?.source ?? "manual");
        } else {
          clearComposerDraft(composerScopeKey, meta?.source ?? "manual");
        }
      }
    },
    [selectedContactId, primaryConversation?.id, composerScopeKey],
  );

  useEffect(() => {
    const prevScope = prevComposerScopeRef.current;
    if (prevScope && prevScope !== composerScopeKey) {
      saveComposerDraft(prevScope, messageInputRef.current, "manual");
    }
    prevComposerScopeRef.current = composerScopeKey;

    if (!composerScopeKey || !selectedContactId) {
      setMessageInput("");
      logComposerDraftTrace({
        event: "clear",
        activeContactId: selectedContactId,
        draftContactId: null,
        source: "manual",
      });
      return;
    }

    const pending = pendingOutreachPrefillRef.current;
    if (pending && pending.contactId === selectedContactId && pending.body?.trim()) {
      saveComposerDraft(composerScopeKey, pending.body, "manual");
      setMessageInput(pending.body);
      if (pending.subject) setEmailSubject(pending.subject);
      pendingOutreachPrefillRef.current = null;
      outreachHandoffAdoptedRef.current = true;
      logComposerDraftTrace({
        event: "load",
        activeContactId: selectedContactId,
        draftContactId: selectedContactId,
        source: "manual",
        conversationId: null,
      });
      console.info(
        JSON.stringify({
          tag: "[ProspectOutreachHandoff]",
          event: "draft_hydrated",
          writer: "composerScopeEffect",
          contactId: selectedContactId,
          ...prospectOutreachPayloadDiag(pending),
          composeMode: "new",
        }),
      );
      return;
    }

    // After PI handoff already hydrated React state, never overwrite with empty local draft.
    if (outreachHandoffAdoptedRef.current && messageInputRef.current.trim()) {
      saveComposerDraft(composerScopeKey, messageInputRef.current, "manual");
      return;
    }

    const loaded = loadComposerDraft(composerScopeKey);
    setMessageInput(loaded);
    logComposerDraftTrace({
      event: "load",
      activeContactId: selectedContactId,
      draftContactId: selectedContactId,
      source: "local_storage",
      conversationId: primaryConversation?.id ?? null,
    });
  }, [composerScopeKey, selectedContactId, primaryConversation?.id]);

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
    const c = displayContact;
    const reachable = contactReachableChannels;
    if (reachable.length === 0) return undefined;

    const preferred = forceNewEmailCompose
      ? "email"
      : (sendChannelUi ?? effectiveChannel ?? c?.primaryChannel ?? reachable[0]);
    if (reachable.includes(preferred as Channel)) return preferred as Channel;
    if (effectiveChannel && reachable.includes(effectiveChannel)) return effectiveChannel;
    return reachable[0];
  }, [
    displayContact,
    contactReachableChannels,
    sendChannelUi,
    effectiveChannel,
    forceNewEmailCompose,
  ]);

  /** Conversation actually being viewed — same as selection primary (sticky-aware). */
  const viewedConversation = primaryConversation;

  /** Single source for POST /send `channel`: mirrors header label each render; mutation reads at request time. */
  const displayedOutboundChannelRef = useRef<Channel | undefined>(undefined);
  const contactReachableChannelsRef = useRef<Channel[]>([]);
  displayedOutboundChannelRef.current = activeChannel;
  contactReachableChannelsRef.current = contactReachableChannels;

  const isWhatsAppContact = activeChannel === 'whatsapp';
  const isEmailChannel = activeChannel === 'email';

  // Prefill subject when opening an email thread
  useEffect(() => {
    if (!isEmailChannel) return;
    if (forceNewEmailCompose) return;
    const subj = primaryConversation?.subject?.trim();
    if (subj) setEmailSubject(subj.startsWith("Re:") ? subj : `Re: ${subj}`);
    else if (!primaryConversation) setEmailSubject((prev) => prev); // keep draft for new compose
  }, [isEmailChannel, primaryConversation?.id, primaryConversation?.subject, forceNewEmailCompose]);

  const windowConversationId = useMemo(() => {
    if (!activeChannel || !contactMatchesSelection) return undefined;
    const ch = activeChannel as string;
    if (!['whatsapp', 'facebook', 'instagram'].includes(ch)) return undefined;
    const conv = matchedConversations.find((c) => c.channel === activeChannel);
    return conv?.id ?? primaryConversation?.id;
  }, [activeChannel, matchedConversations, primaryConversation?.id, contactMatchesSelection]);

  /** Drives reply-window UI every minute without waiting on React Query refetch. */
  const [replyWindowNow, setReplyWindowNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setReplyWindowNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    bumpReplyWindowClockRef.current = () => setReplyWindowNow(Date.now());
  }, []);

  const messagesEnabled = shouldFetchInboxMessages({
    selectedContactId,
    contactMatchesSelection,
    conversationId: activeConversationId,
    allowInboxRowFallback: Boolean(inboxSelectedItem?.conversation?.id),
  });

  const {
    data: messagesQueryData,
    isLoading: messagesLoading,
    isFetching: messagesFetching,
  } = useQuery<Message[]>({
    queryKey: ["/api/conversations", activeConversationId, "messages"],
    enabled: messagesEnabled,
    staleTime: 8_000,
    refetchInterval: () =>
      typeof document !== "undefined" && document.hidden ? false : 10_000,
    refetchIntervalInBackground: true,
    // CRITICAL: do not keepPreviousData — contact-only records must never show
    // the previous contact's messages while conversationId is null/disabled.
  });

  const messages = useMemo(() => {
    if (forceNewEmailCompose) return [];
    if (!messagesEnabled || !activeConversationId) return [];
    return messagesQueryData ?? [];
  }, [forceNewEmailCompose, messagesEnabled, activeConversationId, messagesQueryData]);

  const expandedCalendlyMessageIndex = useMemo(
    () => findExpandedCalendlyMessageIndex(messages),
    [messages],
  );

  const { data: windowStatus } = useQuery<WindowStatus>({
    queryKey: ["/api/conversations", windowConversationId, "window-status"],
    enabled: !!windowConversationId,
    refetchInterval: 60000,
  });

  // Refetch window status when polling delivers a new inbound message (WS may be unavailable).
  useEffect(() => {
    if (!messages.length) return;
    const convId = primaryConversation?.id;
    if (!convId) return;
    const last = messages[messages.length - 1];
    if (last.direction !== "inbound") return;

    const prev = lastInboundTailRef.current;
    if (prev?.convId !== convId) {
      lastInboundTailRef.current = { convId, msgId: last.id };
      return;
    }
    if (prev.msgId === last.id) return;

    lastInboundTailRef.current = { convId, msgId: last.id };

    const ids = new Set<string>([convId]);
    if (windowConversationId && windowConversationId !== convId) ids.add(windowConversationId);
    ids.forEach((id) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/conversations", id, "window-status"],
      });
    });
    bumpReplyWindowClockRef.current();
  }, [
    messages,
    primaryConversation?.id,
    windowConversationId,
    queryClient,
  ]);

  /** WhatsApp: effectiveDeadline = windowExpiresAt − 1h buffer; remainingMs = effectiveDeadline − now. */
  const replyWindowDerived = useMemo(() => {
    if (!activeChannel) return null;
    const ch = activeChannel as string;
    if (!['whatsapp', 'facebook', 'instagram'].includes(ch)) return null;
    if (!windowStatus?.hasRestriction || !windowStatus.windowExpiresAt) return null;

    const windowExpiresAt = windowStatus.windowExpiresAt;
    const windowExpiresAtMs = new Date(windowExpiresAt).getTime();
    const bufferMs = activeChannel === 'whatsapp' ? WHATSAPP_FREE_FORM_BUFFER_MS : 0;
    const effectiveDeadlineMs = windowExpiresAtMs - bufferMs;
    const remainingMs = effectiveDeadlineMs - replyWindowNow;

    return { windowExpiresAt, windowExpiresAtMs, effectiveDeadlineMs, remainingMs };
  }, [activeChannel, windowStatus?.hasRestriction, windowStatus?.windowExpiresAt, replyWindowNow]);

  const metaWindowHeaderHint = useMemo(() => {
    if (!replyWindowDerived) return null;
    const { remainingMs } = replyWindowDerived;
    if (remainingMs <= 0) {
      return { expired: true as const, amber: false };
    }
    const amber = remainingMs < 2 * 60 * 60 * 1000;
    let displaySuffix: string;
    if (remainingMs < 60 * 60 * 1000) {
      const mins = Math.max(1, Math.floor(remainingMs / (60 * 1000)));
      displaySuffix = `${mins}m left`;
    } else {
      const hours = Math.floor(remainingMs / (60 * 60 * 1000));
      displaySuffix = `${hours}h left`;
    }
    return { expired: false as const, displaySuffix, amber };
  }, [replyWindowDerived]);

  // Inline composer notice (subtle): only when < 1h left or expired.
  // Uses the same expiry buffer rule as the header hint; UI-only change.
  const metaComposerWindowNotice = useMemo(() => {
    if (!replyWindowDerived) return null;
    const { remainingMs } = replyWindowDerived;

    if (remainingMs <= 0) {
      return {
        variant: 'expired' as const,
        text: 'Reply window expired. Use a template or switch channel.',
      };
    }

    if (remainingMs < 60 * 60 * 1000) {
      const mins = Math.max(1, Math.floor(remainingMs / (60 * 1000)));
      return { variant: 'soon' as const, text: `Reply window: ${mins}m left` };
    }

    return null;
  }, [replyWindowDerived]);

  const { data: whatsappAvailability } = useQuery<WhatsAppAvailability>({
    queryKey: ["/api/channels/whatsapp/availability"],
    enabled: isWhatsAppContact && !!selectedContactId,
    refetchInterval: 30000,
  });

  const whatsappNotReady =
    isWhatsAppContact &&
    whatsappAvailability &&
    !whatsappAvailability.available;

  const { data: inboxTemplates = [] } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/templates"],
    enabled: isWhatsAppContact,
    retry: false,
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  const { data: timeline = [] } = useQuery<TimelineEvent[]>({
    queryKey: ["/api/contacts", selectedContactId, "timeline"],
    enabled: !!selectedContactId && showTimeline,
  });

  // Lightweight always-on timeline slice used to reflect AI handoff instantly
  // in the Copilot/Snooze UI (no new schema/state; derived from activity events).
  const { data: handoffTimeline = [] } = useQuery<TimelineEvent[]>({
    queryKey: [`/api/contacts/${selectedContactId}/timeline?limit=60`],
    enabled: !!selectedContactId,
    refetchInterval: 5000,
  });

  const activeHandoff = useMemo(() => {
    const convId = primaryConversation?.id;
    if (!convId || !isConversationHandoffActive(handoffTimeline as import("@shared/handoffActivity").HandoffTimelineEvent[], convId)) return null;
    const match = handoffTimeline.find((e) => {
      if (e.eventType !== "ai_handoff") return false;
      if (convId && e.conversationId) return e.conversationId === convId;
      return e.conversationId == null;
    });
    return match || null;
  }, [handoffTimeline, primaryConversation?.id]);

  /** Stable while polls return new array refs — avoids invalidating timeline every messages refetch. */
  const tailInboundMessageId = useMemo(() => {
    if (!messages.length) return "";
    const last = messages[messages.length - 1];
    if (last.direction !== "inbound") return "";
    return last.id;
  }, [messages]);

  // When a new inbound arrives, refetch timeline immediately so Copilot flips to Snoozed right away.
  useEffect(() => {
    if (!selectedContactId) return;
    if (!tailInboundMessageId) return;
    queryClient.invalidateQueries({
      queryKey: [`/api/contacts/${selectedContactId}/timeline?limit=60`],
    });
  }, [tailInboundMessageId, selectedContactId, queryClient]);

  type ChannelHealthEntry = {
    channel: string;
    isConnected: boolean;
    isEnabled: boolean;
    pageName: string | null;
    healthy: boolean | null;   // null = could not determine; true = all checks passed; false = at least one failed
    issues: string[];          // human-readable list of specific problems found
    warnings?: string[];
    healthState?: "healthy" | "degraded" | "unhealthy" | "unknown";
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

  const { data: activationStatus } = useQuery<ActivationStatusPayload>({
    queryKey: ["/api/activation-status"],
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  // Channels that are connected but failed definitive health checks (not transient Meta timeouts)
  const unhealthyChannels = channelHealth.filter((c) => c.isConnected && c.healthy === false);
  const degradedChannels = channelHealth.filter(
    (c) =>
      c.isConnected &&
      c.healthy !== false &&
      (c.healthState === "degraded" || (Array.isArray(c.warnings) && c.warnings.length > 0))
  );
  const [dismissedHealthAlert, setDismissedHealthAlert] = useState<string | null>(null);
  const [dismissedDegradedAlert, setDismissedDegradedAlert] = useState<string | null>(null);
  // Only dismiss per session; if different channel breaks, show again
  const alertKey = unhealthyChannels.map((c) => c.channel).sort().join(",");
  const degradedKey = degradedChannels.map((c) => c.channel).sort().join(",");
  const showHealthAlert = unhealthyChannels.length > 0 && dismissedHealthAlert !== alertKey;
  const showDegradedAlert =
    degradedChannels.length > 0 && unhealthyChannels.length === 0 && dismissedDegradedAlert !== degradedKey;

  const connectedChannelsMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const entry of channelHealth) {
      map[entry.channel] = entry.isConnected;
    }
    return map;
  }, [channelHealth]);


  // Smart scroll: runs synchronously after DOM commit (useLayoutEffect) so
  // scrollHeight already reflects the new message text. Images/media are handled
  // separately via onLoad + ResizeObserver below.
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || messages.length === 0) return;

    const last = messages[messages.length - 1];
    const lastSig = last
      ? `${last.id}:${last.status}:${last.errorMessage ?? ""}:${last.errorCode ?? ""}:${last.deliveryFailureKind ?? ""}`
      : "";

    // Conversation switch: pin to bottom immediately.
    if (selectedContactId !== prevContactIdRef.current) {
      prevContactIdRef.current = selectedContactId;
      prevMsgCountRef.current = messages.length;
      prevLastMessageSigRef.current = lastSig;
      shouldPinRef.current = true;
      setShowNewMsgBanner(false);
      scrollToBottom();
      return;
    }

    const isNew = messages.length > prevMsgCountRef.current;
    const tailChanged = lastSig !== prevLastMessageSigRef.current;
    prevMsgCountRef.current = messages.length;
    prevLastMessageSigRef.current = lastSig;

    if (!isNew && !tailChanged) return;

    if (justSentRef.current || shouldPinRef.current) {
      setShowNewMsgBanner(false);
      scrollToBottom();
    } else {
      // User is reading history — show banner instead of yanking them down.
      setShowNewMsgBanner(true);
    }
  }, [messages, selectedContactId, scrollToBottom]);

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

  // Mark only the viewed conversation/thread as read. Sibling channels stay unread.
  // Row badge uses that conversation's unreadCount (not contact aggregate).
  useEffect(() => {
    if (!viewedConversation?.id || !selectedContactId || !contactMatchesSelection) return;
    const contactId = selectedContactId;
    const conversationId = viewedConversation.id;
    const remainingUnread = remainingContactUnreadAfterMarkingConversation({
      conversations: matchedConversations,
      markedConversationId: conversationId,
    });
    let cancelled = false;

    const rememberClearedConversation = () => {
      recentlyClearedConversationIdsRef.current.add(conversationId);
      const existing = recentlyClearedClearTimersRef.current.get(conversationId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        recentlyClearedConversationIdsRef.current.delete(conversationId);
        recentlyClearedClearTimersRef.current.delete(conversationId);
      }, 60_000);
      recentlyClearedClearTimersRef.current.set(conversationId, timer);
    };

    void (async () => {
      rememberClearedConversation();
      await queryClient.cancelQueries({ queryKey: ["/api/inbox"] });
      queryClient.setQueryData<InboxItem[]>(["/api/inbox"], (old) =>
        applyInboxConversationMarkRead(old, contactId, {
          conversationId,
          remainingUnread,
        }) as InboxItem[] | undefined,
      );
      queryClient.setQueryData<{ contact: Contact; conversations: Conversation[] }>(
        ["/api/contacts", contactId],
        (old) => {
          if (!old || old.contact.id !== contactId) return old;
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.id === conversationId ? { ...c, unreadCount: 0 } : c,
            ),
          };
        },
      );
      try {
        const res = await fetch(`/api/conversations/${conversationId}/read`, {
          method: "POST",
          credentials: "include",
        });
        if (cancelled) return;
        if (res.ok) {
          queryClient.setQueryData<InboxItem[]>(["/api/inbox"], (old) =>
            applyInboxConversationMarkRead(old, contactId, {
              conversationId,
              remainingUnread,
            }) as InboxItem[] | undefined,
          );
        }
      } catch {
        /* non-fatal */
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally keyed by viewed conversation id — not matchedConversations identity —
    // so cache updates after mark-read do not re-POST. Channel switch changes viewed id.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchedConversations read at effect start
  }, [viewedConversation?.id, selectedContactId, contactMatchesSelection, queryClient]);

  // --- Mutations ---

  const sendMessageMutation = useMutation({
    mutationFn: async (data: {
      contactId: string;
      content: string;
      mediaUrl?: string;
      mediaType?: string;
      mediaFilename?: string;
      contentType?: string;
      source?: string;
      emailSubject?: string;
    }) => {
      const channel = clampOutboundChannel(
        displayedOutboundChannelRef.current,
        contactReachableChannelsRef.current
      );
      if (channel === null) {
        throw new Error('No available messaging channel for this contact.');
      }
      const emailThreadId =
        channel === "email" && !forceNewEmailComposeRef.current
          ? primaryConversation?.channel === "email"
            ? primaryConversation.externalThreadId || undefined
            : undefined
          : undefined;
      const body: Record<string, unknown> = {
        content: data.content,
        contentType: data.contentType || (data.mediaType || 'text'),
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType ? `${data.mediaType}` : undefined,
        mediaFilename: data.mediaFilename,
        channel,
        source: data.source,
      };
      if (channel === "email") {
        const subject =
          (
            data.emailSubject ||
            emailSubject ||
            (!forceNewEmailComposeRef.current ? primaryConversation?.subject : "") ||
            ""
          ).trim() || (emailThreadId ? "Re:" : "");
        body.emailRich = {
          subject: subject || undefined,
          textBody: data.content,
          replyMode: emailThreadId ? "reply" : "new",
          providerThreadId: emailThreadId,
          mailboxId:
            !forceNewEmailComposeRef.current && primaryConversation?.channel === "email"
              ? primaryConversation.channelAccountId || undefined
              : undefined,
          prospectOutreach: forceNewEmailComposeRef.current === true,
        };
        if (forceNewEmailComposeRef.current) {
          console.info(
            JSON.stringify({
              tag: "[ProspectOutreachLifecycle]",
              event: "send_attempted",
              contactId: data.contactId,
              composeMode: "new",
              prospectOutreach: true,
            }),
          );
        }
        if (!emailThreadId && !subject) {
          throw new Error("Subject is required for a new email.");
        }
      }
      const res = await fetch(`/api/contacts/${data.contactId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = (typeof json?.error === "string" && json.error.trim()) || "Failed to send message";
        const err = new Error(msg) as Error & { sendPayload?: unknown };
        err.sendPayload = json;
        throw err;
      }
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
        const targetConversationId = conversationId || null;
        const list = old.map((item) => {
          const match = targetConversationId
            ? item.conversation?.id === targetConversationId
            : item.contact.id === data.contactId &&
              !isEmailConversationChannel(item.channel);
          return match
            ? { ...item, lastMessage: previewText, lastMessageAt: now, unreadCount: 0 }
            : item;
        });
        const idx = list.findIndex((item) =>
          targetConversationId
            ? item.conversation?.id === targetConversationId
            : item.contact.id === data.contactId &&
              !isEmailConversationChannel(item.channel),
        );
        if (idx > 0) {
          const [moved] = list.splice(idx, 1);
          list.unshift(moved);
        }
        return list;
      });

      setMessageInput("");
      if (composerScopeKey) clearComposerDraft(composerScopeKey, "manual");
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
      const errMsg = error.message || "";
      const isReplyWindow = isMetaReplyWindowExpiredError(errMsg);
      const isMediaValidation = isMediaChannelValidationError(errMsg);

      if (isReplyWindow && context?.conversationId) {
        const messagesKey = ["/api/conversations", context.conversationId, "messages"] as const;
        queryClient.setQueryData<Message[]>(messagesKey, (old) =>
          (old ?? []).filter((m) => !(m.id.startsWith("optimistic-") && m.status === "sending"))
        );
        if (context.previousInbox !== undefined) {
          queryClient.setQueryData(["/api/inbox"], context.previousInbox);
        }
        if (data.contactId === selectedContactId) {
          handleComposerChange(data.content, { contactId: data.contactId, source: "manual" });
        }
        void queryClient.invalidateQueries({ queryKey: messagesKey });
        setTimeout(() => {
          justSentRef.current = true;
          shouldPinRef.current = true;
          scrollToBottom();
        }, 0);
        return;
      }

      if (isMediaValidation && context?.conversationId) {
        const messagesKey = ["/api/conversations", context.conversationId, "messages"] as const;
        const before = queryClient.getQueryData<Message[]>(messagesKey);
        let patchIdx = -1;
        if (before?.length) {
          for (let i = before.length - 1; i >= 0; i--) {
            if (before[i].id.startsWith("optimistic-") && before[i].status === "sending") {
              patchIdx = i;
              break;
            }
          }
        }
        if (patchIdx >= 0 && before) {
          const next = [...before];
          next[patchIdx] = {
            ...next[patchIdx],
            status: "failed",
            deliveryFailureKind: "media_validation",
            deliveryFailureInline: mediaChannelValidationBubbleText(errMsg),
          };
          queryClient.setQueryData(messagesKey, next);
        } else if (context.previousMessages !== undefined) {
          queryClient.setQueryData(messagesKey, context.previousMessages);
        }
        if (context.previousInbox !== undefined) {
          queryClient.setQueryData(["/api/inbox"], context.previousInbox);
        }
        if (data.contactId === selectedContactId) {
          handleComposerChange(data.content, { contactId: data.contactId, source: "manual" });
        }
        if (data.mediaUrl && data.mediaType) {
          setPendingFile({
            localPreview: data.mediaUrl,
            mediaUrl: data.mediaUrl,
            mediaType: String(data.mediaType),
            mediaFilename: data.mediaFilename || "Attachment",
            mimeType: "",
          });
        }
        setTimeout(() => {
          justSentRef.current = true;
          shouldPinRef.current = true;
          scrollToBottom();
        }, 0);
        return;
      }

      if (context?.conversationId) {
        const messagesKey = ["/api/conversations", context.conversationId, "messages"] as const;
        const before = queryClient.getQueryData<Message[]>(messagesKey);
        let patchIdx = -1;
        if (before?.length) {
          for (let i = before.length - 1; i >= 0; i--) {
            if (before[i].id.startsWith("optimistic-") && before[i].status === "sending") {
              patchIdx = i;
              break;
            }
          }
        }
        if (patchIdx >= 0 && before) {
          const next = [...before];
          next[patchIdx] = {
            ...next[patchIdx],
            status: "failed",
            errorMessage: errMsg,
          };
          queryClient.setQueryData(messagesKey, next);
        } else if (context.previousMessages !== undefined) {
          queryClient.setQueryData(messagesKey, context.previousMessages);
        }
        if (context.previousInbox !== undefined) {
          queryClient.setQueryData(["/api/inbox"], context.previousInbox);
        }
        if (data.contactId === selectedContactId) {
          handleComposerChange(data.content, { contactId: data.contactId, source: "manual" });
        }
        setTimeout(() => {
          justSentRef.current = true;
          shouldPinRef.current = true;
          scrollToBottom();
        }, 0);
      }
      toast({
        title: "Message not sent",
        description: formatOutboundSendErrorDescription(
          errMsg,
          (error as Error & { sendPayload?: { errorCode?: string } }).sendPayload?.errorCode,
        ),
        variant: "destructive",
      });
    },
    onSettled: (_data, error, vars, context) => {
      if (!error) {
        setForceNewEmailCompose(false);
        void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activation-status"] });
      const errMsg = error instanceof Error ? error.message : "";
      const skipMessagesRefresh =
        isMetaReplyWindowExpiredError(errMsg) || isMediaChannelValidationError(errMsg);
      if (context?.conversationId && !skipMessagesRefresh) {
        queryClient.invalidateQueries({
          queryKey: ["/api/conversations", context.conversationId, "messages"],
        });
      }
      if (vars?.contactId && !skipMessagesRefresh) {
        queryClient.invalidateQueries({
          queryKey: [`/api/contacts/${vars.contactId}/timeline?limit=60`],
        });
      }
    },
  });


  const updateContactMutation = useMutation({
    mutationFn: async (data: Record<string, unknown> & { contactId: string }) => {
      const { contactId, ...body } = data;
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update contact");
      return res.json() as Promise<Contact>;
    },
    onMutate: async (data) => {
      const { contactId, ...body } = data;
      const contactKey = ["/api/contacts", contactId] as const;
      await queryClient.cancelQueries({ queryKey: contactKey });
      await queryClient.cancelQueries({ queryKey: ["/api/inbox"] });

      const previousContact = queryClient.getQueryData<{ contact: Contact; conversations: Conversation[] }>(contactKey);
      const previousInbox = queryClient.getQueryData<InboxItem[]>(["/api/inbox"]);

      const patchContact = (contact: Contact): Contact => ({ ...contact, ...body });

      if (previousContact?.contact) {
        queryClient.setQueryData(contactKey, {
          ...previousContact,
          contact: patchContact(previousContact.contact),
        });
      }

      if (previousInbox) {
        queryClient.setQueryData<InboxItem[]>(
          ["/api/inbox"],
          previousInbox.map((item) =>
            item.contact.id === contactId
              ? { ...item, contact: patchContact(item.contact) }
              : item,
          ),
        );
      }

      return { previousContact, previousInbox, contactId };
    },
    onError: (_err, _data, context) => {
      if (context?.previousContact) {
        queryClient.setQueryData(["/api/contacts", context.contactId], context.previousContact);
      }
      if (context?.previousInbox) {
        queryClient.setQueryData(["/api/inbox"], context.previousInbox);
      }
    },
    onSuccess: (updatedContact, variables) => {
      const contactId = variables.contactId;
      queryClient.setQueryData<{ contact: Contact; conversations: Conversation[] }>(
        ["/api/contacts", contactId],
        (old) => (old ? { ...old, contact: { ...old.contact, ...updatedContact } } : old),
      );
      queryClient.setQueryData<InboxItem[]>(["/api/inbox"], (old) =>
        old?.map((item) =>
          item.contact.id === contactId
            ? { ...item, contact: { ...item.contact, ...updatedContact } }
            : item,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      if (
        variables.followUpDate === null ||
        variables.followUp === null ||
        variables.followUp === ""
      ) {
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
        queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}/appointments`] });
      }
      setShowEditContact(false);
    },
  });

  const updateConversationMutation = useMutation({
    mutationFn: async (data: { conversationId: string; status: string }) => {
      const res = await fetch(`/api/conversations/${data.conversationId}`, {
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

  const trashEmailMutation = useMutation({
    mutationFn: async (vars: { messageId: string; source: "list" | "bubble" }) => {
      const res = await apiRequest(
        "POST",
        `/api/messages/${encodeURIComponent(vars.messageId)}/trash-email`,
      );
      return (await res.json()) as {
        ok: boolean;
        messageId: string;
        conversationId: string;
        conversationDeleted: boolean;
        conversation?: {
          id: string;
          lastMessagePreview: string | null;
          lastMessageAt: string | null;
          lastMessageDirection: string | null;
          unreadCount: number;
          subject: string | null;
        };
      };
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/inbox"] });
      const previousInbox = queryClient.getQueryData<InboxItem[]>(["/api/inbox"]);
      return { previousInbox };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousInbox) {
        queryClient.setQueryData(["/api/inbox"], context.previousInbox);
      }
      toast({
        title: "Email could not be deleted. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: (data) => {
      setEmailTrashTarget(null);
      if (data.conversationId) {
        queryClient.setQueryData<Message[] | undefined>(
          [`/api/conversations/${data.conversationId}/messages`],
          (old) => (old ? old.filter((m) => m.id !== data.messageId) : old),
        );
        queryClient.invalidateQueries({
          queryKey: [`/api/conversations/${data.conversationId}/messages`],
        });
      }
      if (data.conversationDeleted) {
        queryClient.setQueryData<InboxItem[]>(["/api/inbox"], (old) =>
          old ? old.filter((item) => item.conversation?.id !== data.conversationId) : old,
        );
        if (selectedConversationId === data.conversationId) {
          setLocation("/app/inbox");
        }
      } else if (data.conversation) {
        queryClient.setQueryData<InboxItem[]>(["/api/inbox"], (old) => {
          if (!old) return old;
          return old.map((item) => {
            if (item.conversation?.id !== data.conversationId) return item;
            const subject = String(data.conversation?.subject || "").trim();
            const preview = (
              subject ||
              data.conversation?.lastMessagePreview ||
              item.lastMessage
            ).slice(0, 100);
            return {
              ...item,
              lastMessage: preview,
              lastMessageAt: data.conversation?.lastMessageAt ?? item.lastMessageAt,
              unreadCount: data.conversation?.unreadCount ?? item.unreadCount,
              lastEmailMessageId: null,
            };
          });
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
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
    if (
      isEmailChannel &&
      (forceNewEmailCompose || !primaryConversation?.externalThreadId) &&
      !emailSubject.trim()
    ) {
      toast({
        title: "Subject required",
        description: "Enter a subject to start a new email.",
        variant: "destructive",
      });
      return;
    }
    if (pendingFile && !messageInput.trim()) {
      toast({
        title: "Add listing details text",
        description:
          "When sending a photo with a listing recommendation, include the property message text so the customer receives price, location, and the View listing link.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    setFilePickerHint(null);
    if (pendingFile) {
      const outboundChannel = clampOutboundChannel(
        displayedOutboundChannelRef.current,
        contactReachableChannelsRef.current
      );
      const docHint = outboundDocumentBlockHint(outboundChannel, pendingFile.mediaType);
      if (docHint) {
        setFilePickerHint(docHint);
        return;
      }
    }
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
      emailSubject: isEmailChannel ? emailSubject : undefined,
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
    if (import.meta.env.DEV) {
      console.info("[AI-AUTO-SEND]", "attempting send", {
        contactId: selectedContactId,
        length: message.trim().length,
      });
    }
    sendMessageMutation.mutate(
      { contactId: selectedContactId, content: message, source: "ai_auto" as any },
      {
        onSuccess: () => {
          if (import.meta.env.DEV) console.info("[AI-AUTO-SEND]", "sent");
        },
        onError: (err: unknown) =>
          console.warn("[AI-AUTO-SEND]", "failed", err instanceof Error ? err.message : err),
      },
    );
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
    setFilePickerHint(null);

    const mediaType = ACCEPTED_TYPES[file.type];
    if (!mediaType) {
      setFilePickerHint(
        "That file type is not supported here. Use JPEG, PNG, WebP, PDF, MP3, M4A, OGG, or MP4.",
      );
      return;
    }
    const cap = waUploadFileSizeCheck(file.type, file.size);
    if (!cap.ok) {
      setFilePickerHint(waUploadTooLargeMessage(cap.kind));
      return;
    }

    const outboundChannel = clampOutboundChannel(
      displayedOutboundChannelRef.current,
      contactReachableChannelsRef.current
    );
    const docHint = outboundDocumentBlockHint(outboundChannel, mediaType);
    if (docHint) {
      setFilePickerHint(docHint);
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
      setFilePickerHint(null);
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
    if (matchedContact) {
      setEditContactForm({
        name: matchedContact.name || "",
        phone: matchedContact.phone || "",
        email: matchedContact.email || "",
      });
      setShowEditContact(true);
    } else if (displayContact) {
      setEditContactForm({
        name: displayContact.name || "",
        phone: displayContact.phone || "",
        email: displayContact.email || "",
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
    mutationFn: async (
      data: { templateId: string; contactId: string; variables: Record<string, string>; templateName?: string }
    ) => {
      const { templateName, ...sendPayload } = data;
      const payload = { ...sendPayload, sendSource: "inbox_picker" as const };
      console.log(
        `[WA_TEMPLATE_SEND_CLIENT] ${JSON.stringify({
          source: "inbox_picker",
          templateId: payload.templateId,
          templateName: templateName ?? null,
          variables: payload.variables,
          components: "(built server-side from template row + variables)",
        })}`
      );
      const res = await apiRequest("POST", "/api/templates/send", payload);
      return res.json();
    },
    onSuccess: async (data) => {
      setShowTemplatePicker(false);
      setSelectedInboxTemplate(null);
      setVarValues({});
      const convId =
        (data as { conversationId?: string })?.conversationId || primaryConversation?.id;
      if (convId) {
        await queryClient.invalidateQueries({ queryKey: ["/api/conversations", convId, "messages"] });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      justSentRef.current = true;
      shouldPinRef.current = true;
      setTimeout(() => scrollToBottom(), 0);
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
    (template.variables || []).forEach((v: string) => {
      initVars[v] = "";
    });
    setVarValues(initVars);
  };

  const handleSendTemplateFromInbox = () => {
    if (!selectedInboxTemplate || !selectedContactId) return;
    const { blocked } = getInboxTemplateSendBlockReason(
      {
        name: selectedInboxTemplate.name,
        bodyText: selectedInboxTemplate.bodyText,
        headerType: selectedInboxTemplate.headerType,
        headerContent: selectedInboxTemplate.headerContent,
        buttons: selectedInboxTemplate.buttons,
        templateType: selectedInboxTemplate.templateType,
        carouselCards: selectedInboxTemplate.carouselCards,
        category: selectedInboxTemplate.category,
      },
      { logWhenBlocked: true, guardLogContext: "inbox_quick_send" }
    );
    if (blocked) return;
    sendTemplateFromInboxMutation.mutate({
      templateId: selectedInboxTemplate.id,
      contactId: selectedContactId,
      variables: varValues,
      templateName: selectedInboxTemplate.name,
    });
  };

  const inboxQuickSendBlocked = useMemo(() => {
    if (!selectedInboxTemplate) return false;
    return getInboxTemplateSendBlockReason({
      name: selectedInboxTemplate.name,
      bodyText: selectedInboxTemplate.bodyText,
      headerType: selectedInboxTemplate.headerType,
      headerContent: selectedInboxTemplate.headerContent,
      buttons: selectedInboxTemplate.buttons,
      templateType: selectedInboxTemplate.templateType,
      carouselCards: selectedInboxTemplate.carouselCards,
      category: selectedInboxTemplate.category,
    }).blocked;
  }, [selectedInboxTemplate]);

  // --- Filtering ---

  const filteredInbox = useMemo(() => {
    const q = searchQuery.toLowerCase();
    let result = inbox.filter(
      (item) =>
        item.contact.name.toLowerCase().includes(q) ||
        item.contact.phone?.includes(searchQuery) ||
        item.contact.email?.toLowerCase().includes(q) ||
        item.lastMessage?.toLowerCase().includes(q) ||
        (item.conversation as Conversation | null)?.subject?.toLowerCase().includes(q),
    );
    // Per-row unread (email threads are separate rows — do not use contact aggregate).
    if (filterTab === "unread") {
      result = result.filter((item) => item.unreadCount > 0);
    }
    if (filterTab === "mine") result = result.filter((item) => item.contact.assignedTo === user?.id);
    if (selectedChannels.size < allChannels.length) {
      result = result.filter((item) => selectedChannels.has(item.channel as Channel));
    }
    return result;
  }, [inbox, searchQuery, filterTab, user?.id, selectedChannels]);

  const showInboxEmptyNoChannels =
    filteredInbox.length === 0 &&
    !!activationStatus &&
    !activationStatus.hasAnyMessagingChannel;

  const prevRawInboxRowCountRef = useRef(0);
  useEffect(() => {
    const prev = prevRawInboxRowCountRef.current;
    if (import.meta.env.DEV && prev > 0 && inbox.length === 0) {
      const selectedChannelsList = Array.from(selectedChannels).sort();
      console.warn("INBOX_ROWS_CLEARED", {
        previousLength: prev,
        newLength: inbox.length,
        filteredLength: filteredInbox.length,
        pathname,
        windowPath: typeof window !== "undefined" ? window.location.pathname : "",
        selectedContactId,
        inboxDataRaw: inboxData,
        filterTab,
        searchQuery,
        selectedChannels: selectedChannelsList,
        channelFilterActive: selectedChannels.size < allChannels.length,
        queryStatus: inboxQueryStatus,
        fetchStatus: inboxFetchStatus,
        isPending: inboxPending,
        isFetching: inboxIsFetching,
        isRefetching: inboxIsRefetching,
        queryError: inboxQueryError ?? null,
        stack: new Error("INBOX_ROWS_CLEARED").stack,
      });
    }
    prevRawInboxRowCountRef.current = inbox.length;
  }, [
    inbox.length,
    filteredInbox.length,
    inboxData,
    pathname,
    selectedContactId,
    filterTab,
    searchQuery,
    selectedChannels,
    inboxQueryStatus,
    inboxFetchStatus,
    inboxPending,
    inboxIsFetching,
    inboxIsRefetching,
    inboxQueryError,
  ]);

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

  /** Matched detail contact or inbox-list fallback — never previous contact via keepPreviousData. */
  const contact = displayContact;

  // Business knowledge (industry gate for Copilot intel; no backend logic change)
  const { data: aiBusinessKnowledge } = useQuery<{ industry?: string }>({
    queryKey: ["/api/ai/business-knowledge"],
    staleTime: 5 * 60 * 1000,
  });

  // Build contact context for AI reply quality improvement (must be after contact + messages are declared).
  // messages is already selection-isolated (empty when no conversation / contact mismatch).
  const contactContext: ContactContext | undefined = useMemo(() => {
    if (!contact || contact.id !== selectedContactId) return undefined;
    const msgList = messages.map(m => ({ direction: m.direction, content: m.content || '' }));
    const intel =
      msgList.length > 0
        ? analyzeConversation(msgList, {
            industry: aiBusinessKnowledge?.industry,
            crmLeadScore: contact.leadScore ?? null,
          })
        : null;
    const lastInbound =
      [...msgList].reverse().find((m) => m.direction === "inbound")?.content || "";
    const joinedInbound = msgList
      .filter((m) => m.direction === "inbound")
      .map((m) => m.content)
      .join("\n");
    const injectBuyerCtx = shouldInjectBuyerRealEstateContext({
      inboundText: lastInbound,
      conversationText: joinedInbound,
      leadType: String(
        (contact.customFields as Record<string, unknown> | undefined)?.leadType || "",
      ),
      industry: aiBusinessKnowledge?.industry,
      buyerProfileHasCriteria: extractBuyerMatchCriteria(persistedBuyerProfile).hasAnyCriteria,
      contactEmail: (contact as { email?: string | null }).email ?? null,
      channel: primaryConversation?.channel,
    });

    const aiPrefFields = injectBuyerCtx
      ? buildBuyerPreferenceAiContext(persistedBuyerProfile)
      : { buyerPreferences: undefined, budget: undefined, timeline: undefined, financing: undefined };

    return {
      name:          contact.name,
      tag:           contact.tag || undefined,
      pipelineStage: contact.pipelineStage || undefined,
      notes:         contact.notes || undefined,
      budget:        aiPrefFields.budget ?? undefined,
      timeline:      aiPrefFields.timeline ?? undefined,
      financing:     aiPrefFields.financing ?? undefined,
      intent:        intel?.intent,
      leadScore:     intel?.leadScore?.label,
      buyerPreferences: injectBuyerCtx ? aiPrefFields.buyerPreferences : undefined,
    };
  }, [
    contact,
    selectedContactId,
    messages,
    aiBusinessKnowledge?.industry,
    persistedBuyerProfile,
    primaryConversation?.channel,
  ]);

  const hasConversation = !!activeConversationId && contactMatchesSelection;
  const convStatus = primaryConversation?.status || 'open';
  const conversationStatusRow = getConversationStatusRow(convStatus);

  // Only block on first load with no rows yet — never swap the whole page out during background refetch.
  if (inboxPending && inboxData === undefined) {
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
        "w-full md:w-72 md:min-w-[18rem] lg:w-80 lg:min-w-[20rem] border-r flex flex-col flex-shrink-0 bg-gray-50",
        selectedContactId ? "hidden md:flex" : "flex"
      )}>
        {/* Header */}
        <div className="p-3 border-b border-gray-200">
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
                        className="w-3.5 h-3.5 rounded border-gray-300 accent-gray-900"
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
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-500 hover:bg-gray-50"
                )}
                data-testid={`filter-tab-${tab}`}
              >
                {tab === 'all' ? 'All' : tab === 'unread' ? 'Unread' : 'Mine'}
              </button>
            ))}
          </div>

          {/* Channel health bar — always shows main messaging channels; gray = not configured */}
          {(() => {
            const rows = buildInboxChannelHealthRows(channelHealth);

            const getTooltip = (ch: (typeof rows)[0]) => {
              const label = INBOX_CHANNEL_HEALTH_LABELS[ch.channel as keyof typeof INBOX_CHANNEL_HEALTH_LABELS] ?? ch.channel;
              if (!ch.isConnected) return `${label}: not configured — set up in Settings`;
              if (ch.healthy === true) {
                if (ch.channel === 'whatsapp') return `${label}: account verified and ready`;
                if (ch.channel === 'telegram') return `${label}: bot token valid, webhook active`;
                if (ch.channel === 'tiktok')   return `${label}: lead intake is active`;
                if (ch.channel === 'email') {
                  return ch.pageName
                    ? `${label}: connected (${ch.pageName})`
                    : `${label}: Gmail mailbox connected`;
                }
                if (ch.healthState === "degraded" || (ch.warnings && ch.warnings.length))
                  return `${label}: connected — ${ch.warnings?.[0] ?? "Meta verification temporarily unavailable."}`;
                return `${label}: token valid, page accessible, webhook subscribed`;
              }
              if (ch.healthy === false) return `${label} issue: ${ch.issues[0] ?? 'check Settings'}`;
              if (ch.healthState === "degraded" || (ch.warnings && ch.warnings.length))
                return `${label}: ${ch.warnings?.[0] ?? "Verification temporarily unavailable"}`;
              return `${label}: status unknown`;
            };

            return (
              <div className="flex items-center gap-x-2 gap-y-1 mt-2 pt-2 border-t flex-wrap" data-testid="channel-health-bar">
                {rows.map(ch => {
                  const isDegraded =
                    ch.isConnected &&
                    ch.healthy !== false &&
                    (ch.healthState === "degraded" || (!!ch.warnings && ch.warnings.length > 0));
                  const dotColor = !ch.isConnected
                    ? "bg-gray-300"
                    : ch.healthy === true ? (isDegraded ? "bg-amber-400" : "bg-emerald-500")
                    : ch.healthy === false ? "bg-red-500"
                    : isDegraded ? "bg-amber-400"
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
                      <span>{INBOX_CHANNEL_HEALTH_LABELS[ch.channel as keyof typeof INBOX_CHANNEL_HEALTH_LABELS] ?? ch.channel}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* ── Channel health alert banner ── */}
        {showDegradedAlert && (
          <div className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50/90 p-2.5" data-testid="channel-health-degraded-alert">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-900 leading-tight">
                  Meta verification temporarily unavailable
                </p>
                {degradedChannels.map((ch) => (
                  <p key={ch.channel} className="text-[11px] text-amber-900/85 mt-0.5 leading-tight">
                    {(ch.channel.charAt(0).toUpperCase() + ch.channel.slice(1))}:{" "}
                    {ch.warnings?.[0] ?? "Live checks timed out; your saved connection may still work."}
                  </p>
                ))}
                <p className="text-[10px] text-amber-800/80 mt-1 leading-tight">
                  Messaging and template sends are not blocked by this banner alone. If problems persist, open Settings.
                </p>
                <a
                  href="/app/settings"
                  className="text-[11px] text-amber-900 font-medium underline underline-offset-2 mt-1 inline-block"
                  data-testid="channel-health-degraded-settings-link"
                >
                  Settings →
                </a>
              </div>
              <button
                onClick={() => setDismissedDegradedAlert(degradedKey)}
                className="text-amber-500 hover:text-amber-700 flex-shrink-0"
                title="Dismiss"
                data-testid="channel-health-degraded-dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

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
            showInboxEmptyNoChannels ? (
              <div className="p-6 text-center" data-testid="inbox-empty-no-channels">
                <Smartphone className="w-10 h-10 mx-auto mb-3 text-gray-300" aria-hidden />
                <p className="text-sm font-medium text-gray-900 mb-1">{t("unifiedInbox.emptyNoChannelsTitle")}</p>
                <p className="text-xs text-muted-foreground mb-4">{t("unifiedInbox.emptyNoChannelsHint")}</p>
                <Link href={settingsChannelsHref({ provider: "whatsapp" })}>
                  <a>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-brand-green hover:bg-brand-dark text-white"
                      data-testid="inbox-cta-connect-whatsapp"
                    >
                      <MessageCircle className="w-4 h-4 shrink-0" />
                      {t("unifiedInbox.connectWhatsAppCta")}
                    </Button>
                  </a>
                </Link>
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                <User className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No conversations</p>
              </div>
            )
          ) : (
            filteredInbox.map(item => {
              const fuStatus = getFollowUpStatus(item.contact.followUpDate);
              const rowUnread =
                item.conversation?.unreadCount != null
                  ? item.conversation.unreadCount
                  : item.unreadCount;
              const needsReply =
                item.conversation?.lastMessageDirection === "inbound" && rowUnread > 0;
              const isOverdue = fuStatus === 'overdue';
              const bookedAppt = nextAppointmentByContact.get(item.contact.id);
              const crmTag = isCrmDisplayTag(item.contact.tag) ? item.contact.tag : null;
              const showFollowUpBadge = fuStatus && !bookedAppt;
              const rowId = inboxRowKey(item);
              const isEmailRow = isEmailConversationChannel(item.channel);
              const isSelected =
                selectedContactId === item.contact.id &&
                (isEmailRow
                  ? selectedConversationId === item.conversation?.id
                  : !selectedConversationId ||
                    selectedConversationId === item.conversation?.id);
              return (
              <div
                key={rowId}
                onClick={() => {
                  // Explicit row click always wins over sticky / newest-primary.
                  const convId = item.conversation?.id?.trim() || null;
                  stickyContactIdRef.current = item.contact.id;
                  stickyConversationIdRef.current = convId;
                  setStickyEpoch((n) => n + 1);
                  setLocation(
                    buildInboxHref(
                      item.contact.id,
                      isEmailRow ? convId : null,
                    ),
                  );
                }}
                className={cn(
                  inboxConversationRowChromeClassName({
                    selected: isSelected,
                    overdue: isOverdue && !bookedAppt,
                  }),
                  item.channel === "email" && "group/email-row",
                )}
                data-testid={`inbox-item-${rowId}`}
              >
                <div className={INBOX_ROW_INNER}>
                  <ChatAvatar
                    src={item.contact.avatar}
                    name={item.contact.name}
                    size="sm"
                    className="shrink-0"
                  />
                  <div className={INBOX_ROW_BODY}>
                    <div className={INBOX_ROW_LINE1}>
                      <span
                        className={cn(
                          INBOX_ROW_NAME,
                          needsReply && INBOX_ROW_NAME_UNREAD,
                        )}
                      >
                        {item.contact.name}
                      </span>
                      <span className="relative inline-flex h-4 min-w-[2.75rem] shrink-0 items-center justify-end">
                        <span
                          className={cn(
                            INBOX_ROW_TIME,
                            item.channel === "email" &&
                              item.lastEmailMessageId &&
                              "group-hover/email-row:invisible",
                          )}
                        >
                          {formatTime(item.lastMessageAt)}
                        </span>
                        {item.channel === "email" && item.lastEmailMessageId ? (
                          <button
                            type="button"
                            title="Delete latest email"
                            aria-label="Delete latest email"
                            data-testid={`button-trash-email-row-${rowId}`}
                            disabled={
                              trashEmailMutation.isPending &&
                              emailTrashTarget?.messageId === item.lastEmailMessageId
                            }
                            className={cn(
                              "absolute right-0 top-1/2 -translate-y-1/2 inline-flex h-4 w-4 items-center justify-center rounded text-gray-400 opacity-0 transition-opacity hover:text-red-600 group-hover/email-row:opacity-100",
                              trashEmailMutation.isPending &&
                                emailTrashTarget?.messageId === item.lastEmailMessageId &&
                                "opacity-100",
                            )}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setEmailTrashTarget({
                                messageId: item.lastEmailMessageId!,
                                source: "list",
                              });
                            }}
                          >
                            {trashEmailMutation.isPending &&
                            emailTrashTarget?.messageId === item.lastEmailMessageId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : null}
                      </span>
                      {rowUnread > 0 ? (
                        <span className={INBOX_ROW_UNREAD_BADGE}>{rowUnread}</span>
                      ) : null}
                    </div>
                    <div className={INBOX_ROW_LINE2}>
                      <span className={INBOX_ROW_CHANNEL_ICON_WRAP} aria-hidden>
                        {getChannelIcon(item.channel, "w-3 h-3")}
                      </span>
                      <p
                        className={cn(
                          INBOX_ROW_PREVIEW,
                          needsReply && INBOX_ROW_PREVIEW_UNREAD,
                        )}
                      >
                        {item.lastMessage || "No messages yet"}
                      </p>
                    </div>
                    <div className={INBOX_ROW_LINE3}>
                      {needsReply ? (
                        <span
                          className={cn(INBOX_ROW_CHIP, "border-blue-200 bg-blue-50 font-semibold text-blue-700")}
                          data-testid={`badge-needs-reply-${item.contact.id}`}
                        >
                          <Zap className="h-2.5 w-2.5 shrink-0" />Needs Reply
                        </span>
                      ) : showFollowUpBadge && fuStatus === 'overdue' ? (
                        <span
                          className={cn(INBOX_ROW_CHIP, "border-red-200 bg-red-50 font-semibold text-red-600")}
                          data-testid={`badge-overdue-${item.contact.id}`}
                        >
                          Overdue
                        </span>
                      ) : showFollowUpBadge && fuStatus === 'today' ? (
                        <span
                          className={cn(INBOX_ROW_CHIP, "border-amber-200 bg-amber-50 text-amber-600")}
                          data-testid={`badge-today-${item.contact.id}`}
                        >
                          Today
                        </span>
                      ) : showFollowUpBadge && fuStatus === 'upcoming' ? (
                        <span
                          className={cn(INBOX_ROW_CHIP, "border-slate-200 bg-slate-50 text-slate-500")}
                          data-testid={`badge-upcoming-${item.contact.id}`}
                        >
                          {item.contact.followUp}
                        </span>
                      ) : null}
                      {crmTag ? (
                        <span
                          className={cn(
                            INBOX_ROW_CHIP,
                            TAG_COLORS[crmTag] || "border-blue-200 bg-blue-100 text-blue-700",
                          )}
                          data-testid={`badge-tag-${item.contact.id}`}
                        >
                          {crmTag}
                        </span>
                      ) : null}
                      {bookedAppt ? (
                        <span
                          className={cn(INBOX_ROW_CHIP, "border-emerald-200 bg-emerald-50 text-emerald-700")}
                          title={`Booked · ${format(new Date(bookedAppt.appointmentDate), "MMM d 'at' h:mm a")}`}
                          data-testid={`badge-booked-${item.contact.id}`}
                        >
                          <CalendarCheck className="h-2.5 w-2.5 shrink-0" aria-hidden />
                          Booked
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
            <div className="p-3 border-b border-gray-200 flex items-center gap-2 flex-shrink-0 bg-white">
              <button onClick={() => setLocation('/app/inbox')} className="md:hidden p-1 text-gray-500" data-testid="button-back-inbox">
                <ChevronDown className="w-5 h-5 rotate-90" />
              </button>
              <ChatAvatar src={contact.avatar} name={contact.name} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-semibold text-sm truncate" data-testid="inbox-selected-contact-name">{contact.name}</h3>
                  {getChannelIcon(activeChannel)}
                  {hasConversation ? (
                    <span className={cn("text-[10px] font-medium tracking-tight", conversationStatusRow.textClass)}>
                      {conversationStatusRow.label}
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium tracking-tight text-muted-foreground">
                      No conversation
                    </span>
                  )}
                </div>
                {isEmailChannel && (primaryConversation?.subject || emailSubject) ? (
                  <p className="text-xs text-gray-600 truncate" data-testid="inbox-email-subject">
                    {primaryConversation?.subject || emailSubject}
                  </p>
                ) : null}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {isEmailChannel && contact.email ? (
                    <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{contact.email}</span>
                  ) : null}
                  {contact.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{contact.phone}</span>}
                  {contact.assignedTo && (() => {
                    const assignee = teamMembers.find((m: TeamMember) => (m.memberId || m.id) === contact.assignedTo);
                    const name = assignee?.name || assignee?.email?.split('@')[0];
                    return name ? (
                      <span className="flex items-center gap-1 text-gray-500 hidden sm:flex">
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

                {/* Window timer/status (info) + channel switcher (action) */}
                {metaWindowHeaderHint ? (
                  <span
                    className={cn(
                      "hidden sm:inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-none",
                      "bg-gray-100 border-gray-200 text-gray-600",
                      metaWindowHeaderHint.expired && "bg-rose-50 border-rose-200 text-rose-700",
                      metaWindowHeaderHint.amber && !metaWindowHeaderHint.expired && "bg-amber-50 border-amber-200 text-amber-800"
                    )}
                    title="Time left for free-form messaging on this channel"
                    data-testid="meta-window-timer"
                  >
                    {metaWindowHeaderHint.expired
                      ? "Reply window expired"
                      : `Reply window: ${metaWindowHeaderHint.displaySuffix}`}
                  </span>
                ) : null}

                {/* Channel switcher (neutral control) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 max-w-[min(100%,12rem)] gap-1 rounded-md border border-gray-200/90 bg-white px-2 text-xs font-normal text-gray-600 shadow-none hover:bg-gray-50/90 hover:text-gray-700 focus-visible:ring-1 focus-visible:ring-gray-300/50 focus-visible:ring-offset-0"
                      data-testid="button-switch-channel"
                      disabled={contactReachableChannels.length === 0}
                      title={contactReachableChannels.length === 0 ? 'No messaging channel available for this contact' : undefined}
                    >
                      {getChannelIcon(activeChannel)}
                      <span className="hidden min-w-0 truncate sm:inline">
                        {activeChannel ? CHANNEL_CONFIG[activeChannel]?.label : 'No channel'}
                      </span>
                      <ChevronDown className="h-3 w-3 shrink-0 text-gray-500" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white border-gray-200">
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
                            if (selectedContactId) {
                              switchChannelMutation.mutate({ contactId: selectedContactId, channel: key as Channel });
                            }
                          }}
                          className={cn(
                            "min-h-0 gap-1.5 px-2 py-1 text-[13px] leading-tight",
                            "focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900",
                            isActive && "font-medium"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: cfg.color }} />
                          {cfg.label}
                          {isActive && <span className="ml-auto text-[11px] text-slate-400">✓</span>}
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

            {/* Messages area */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto relative"
              style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', backgroundSize: '400px' }}
            >
              <div className="absolute inset-0 bg-[#efeae2]/90 pointer-events-none" />
              <div ref={messagesInnerRef} className="relative z-10 flex min-w-0 flex-col gap-1.5 p-2 sm:p-3">
                {messagesLoading && messagesEnabled && messages.length === 0 ? (
                  <div className="flex flex-col gap-3 pb-4">
                    {[80, 55, 120, 45, 90].map((w, i) => (
                      <div key={i} className={`flex min-w-0 ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                        <div className="h-8 max-w-[min(82vw,100%)] rounded-lg bg-white/70 animate-pulse sm:max-w-[70%]" style={{ width: `${w}%` }} />
                      </div>
                    ))}
                  </div>
                ) : !hasConversation ? (
                  <div
                    className="text-center text-gray-600 py-10 self-center max-w-sm px-4"
                    data-testid="inbox-no-conversation-yet"
                  >
                    <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium text-gray-800">No conversation yet</p>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      This contact has no message history.
                      {contactReachableChannels.length > 0
                        ? " Choose an available channel below to start a conversation."
                        : " Add a phone number or connect a messaging channel to start a conversation."}
                    </p>
                  </div>
                ) : !messagesLoading && messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8 self-center" data-testid="inbox-no-messages-yet">
                    <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No messages yet</p>
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    if (msg.contentType === "commerce_event" && msg.content) {
                      return (
                        <div key={msg.id || i} className="flex min-w-0 justify-center px-1 py-1.5 animate-msg-in">
                          <div className="w-full min-w-0 max-w-[min(82vw,100%)] rounded-2xl border border-lime-200 bg-white/95 px-3 py-2.5 text-sm shadow-sm sm:max-w-sm sm:px-3.5 sm:py-3">
                            <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
                              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime-50 text-lime-800">
                                <ShoppingCart className="h-4 w-4" aria-hidden />
                              </div>
                              <pre className="min-w-0 flex-1 whitespace-pre-wrap font-sans text-sm text-gray-800 [overflow-wrap:anywhere] break-words">
                                {msg.content}
                              </pre>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const calendlyEvent = parseCalendlyEventMessage(msg);
                    if (calendlyEvent) {
                      return (
                        <CalendlyAppointmentChip
                          key={msg.id || i}
                          event={calendlyEvent}
                          expanded={i === expandedCalendlyMessageIndex}
                        />
                      );
                    }
                    const isOut = msg.direction === 'outbound';
                    const isSending = msg.status === 'sending';
                    const errBubbleText = (msg.errorMessage || "").trim();
                    const showReplyWindowFailureUi =
                      msg.deliveryFailureKind === "meta_reply_window" ||
                      msg.errorCode === "meta_reply_window" ||
                      isMetaReplyWindowExpiredError(errBubbleText) ||
                      errorLooksLikeReplyWindowOrTemplateBlock(errBubbleText);
                    const showSpecificNonReplyFailure =
                      !!errBubbleText &&
                      !showReplyWindowFailureUi &&
                      !isGenericOutboundSendFallbackMessage(errBubbleText);
                    const tvCarousel = msg.templateVariables?.carouselCardsDisplay;
                    const isWaCarouselChatBubble =
                      msg.contentType === "template" &&
                      Array.isArray(tvCarousel) &&
                      tvCarousel.length > 0;
                    const isWaTightTemplateBubble =
                      msg.contentType === "template" && !isWaCarouselChatBubble;
                    return (
                      <div key={msg.id || i} className={cn("flex min-w-0 animate-msg-in", isOut ? "justify-end" : "justify-start")}>
                        <div className={cn(
                          "relative flex min-w-0 max-w-[min(82vw,100%)] flex-col rounded-lg text-sm shadow-sm sm:max-w-[70%]",
                          isWaCarouselChatBubble || isWaTightTemplateBubble
                            ? "px-1.5 pt-0.5 pb-1"
                            : "px-2.5 py-1.5 sm:px-3",
                          isOut ? "bg-[#d9fdd3] text-gray-900 rounded-tr-none" : "bg-white text-gray-900 rounded-tl-none",
                          isSending && "opacity-75"
                        )}>
                          <div className="min-w-0 max-w-full [overflow-wrap:anywhere] break-words">
                            {(() => {
                            if (
                              isOut &&
                              msg.status === "failed" &&
                              msg.deliveryFailureKind === "media_validation" &&
                              msg.deliveryFailureInline
                            ) {
                              return (
                                <p className="whitespace-pre-wrap text-sm leading-snug text-gray-800 [overflow-wrap:anywhere] break-words">
                                  {msg.deliveryFailureInline}
                                </p>
                              );
                            }
                            const hasMedia = !!(msg.mediaUrl || msg.mediaFilename || msg.platformMediaId);
                            const isOptimistic = msg.id.startsWith('optimistic-');
                            const proxyUrl = `/api/media/proxy?messageId=${encodeURIComponent(msg.id)}`;
                            const useDirectMedia = !!(
                              msg.mediaUrl &&
                              (isOptimistic ||
                                msg.mediaUrl.startsWith("blob:") ||
                                msg.mediaUrl.startsWith("/") ||
                                isClientRenderableMediaUrl(msg.mediaUrl))
                            );
                            const imageSrc = useDirectMedia ? msg.mediaUrl! : proxyUrl;
                            const mediaDisplayUrl = useDirectMedia ? msg.mediaUrl! : proxyUrl;
                            const ct = msg.contentType;
                            if (ct === "template") {
                              const raw = msg.content || "";
                              const sep = raw.indexOf("\n\n");
                              const headerLine =
                                sep >= 0 ? raw.slice(0, sep).trim() : raw.trim();
                              let bodyPart = sep >= 0 ? raw.slice(sep + 2).trim() : "";
                              const tv = msg.templateVariables;
                              const lang =
                                tv && typeof tv.templateLanguage === "string"
                                  ? tv.templateLanguage
                                  : null;
                              const tmplName =
                                tv && typeof tv.templateName === "string"
                                  ? tv.templateName
                                  : headerLine.startsWith("Template:")
                                    ? headerLine.slice("Template:".length).trim()
                                    : headerLine;
                              const provider =
                                tv && typeof tv.provider === "string" ? tv.provider : null;
                              const langBadge = lang
                                ? lang.replace(/-/g, "_").toUpperCase()
                                : null;

                              if (
                                isOut &&
                                msg.status === "failed" &&
                                typeof msg.errorMessage === "string" &&
                                msg.errorMessage.trim()
                              ) {
                                return (
                                  <div className="space-y-1.5 rounded-xl border border-rose-200/90 bg-rose-50/50 px-3 py-2 leading-snug">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-900/85">
                                      Template not sent
                                    </p>
                                    <p className="whitespace-pre-wrap text-sm text-rose-950 [overflow-wrap:anywhere] break-words">
                                      {msg.errorMessage.trim()}
                                    </p>
                                    <p className="text-xs font-semibold text-gray-900 [overflow-wrap:anywhere] break-words">{tmplName || "Template"}</p>
                                    {langBadge ? (
                                      <p className="text-[10px] text-gray-500">{langBadge}</p>
                                    ) : null}
                                  </div>
                                );
                              }

                              const crmCarouselDisplay = tv?.carouselCardsDisplay;
                              if (Array.isArray(crmCarouselDisplay) && crmCarouselDisplay.length > 0) {
                                const carouselForPreview = crmCarouselDisplay.map((row: unknown) => {
                                  const r = row as Record<string, unknown>;
                                  const url =
                                    typeof r.headerMediaUrl === "string" ? r.headerMediaUrl.trim() : "";
                                  const hfRaw =
                                    typeof r.headerMediaType === "string"
                                      ? String(r.headerMediaType).toLowerCase()
                                      : "image";
                                  const hf =
                                    hfRaw === "video" || hfRaw === "document" ? hfRaw : "image";
                                  const bodyTx =
                                    typeof r.bodyText === "string" ? r.bodyText : "—";
                                  const labels = Array.isArray(r.buttonLabels)
                                    ? (r.buttonLabels as unknown[]).filter((x) => typeof x === "string")
                                    : [];
                                  const docDisp =
                                    typeof r.documentDisplayName === "string"
                                      ? r.documentDisplayName.trim()
                                      : "";
                                  const origFn =
                                    typeof r.originalFilename === "string"
                                      ? r.originalFilename.trim()
                                      : "";
                                  return {
                                    headerUrl:
                                      url && /^https?:\/\//i.test(url) ? url : undefined,
                                    headerFormat: hf,
                                    bodyText: bodyTx || "—",
                                    buttons: labels.map((t) => ({ text: String(t) })),
                                    documentDisplayName: docDisp || undefined,
                                    originalFilename: origFn || undefined,
                                  };
                                });
                                return (
                                  <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-emerald-100/90 bg-emerald-50/40 leading-snug">
                                    <WhatsAppTemplateRichPreview
                                      template={{
                                        name: tmplName || "Template",
                                        templateType: "carousel",
                                        bodyText: bodyPart || null,
                                        headerType: null,
                                        headerContent: null,
                                        carouselCards: carouselForPreview,
                                      }}
                                      livePreview={{ bodyText: bodyPart || undefined }}
                                      carouselStripScale="compact"
                                      density="compact"
                                      carouselInBubbleTight
                                      className="min-w-0"
                                    />
                                    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden border-t border-emerald-200/35 px-1.5 py-0.5">
                                      <span className="shrink-0 text-[8px] font-semibold uppercase tracking-wide text-emerald-900/65">
                                        WhatsApp template
                                      </span>
                                      {provider === "meta" ? (
                                        <span className="shrink-0 rounded-full border border-emerald-200/60 bg-white/60 px-1 py-px text-[8px] font-medium leading-none text-emerald-900/75">
                                          Meta
                                        </span>
                                      ) : null}
                                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight text-gray-900">
                                        {tmplName || "Template"}
                                      </span>
                                      {langBadge ? (
                                        <span className="shrink-0 text-[8px] tabular-nums leading-none text-gray-500">
                                          {langBadge}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              }

                              const tvHeaderUrl =
                                tv && typeof tv.headerMediaUrl === "string"
                                  ? tv.headerMediaUrl.trim()
                                  : "";
                              const rowMedia = msg.mediaUrl?.trim() || "";
                              let effectiveMediaUrl = tvHeaderUrl || rowMedia;

                              if (effectiveMediaUrl && bodyPart.startsWith(effectiveMediaUrl)) {
                                bodyPart = bodyPart
                                  .slice(effectiveMediaUrl.length)
                                  .replace(/^\n+/, "")
                                  .trim();
                              } else if (!effectiveMediaUrl && bodyPart) {
                                const firstLine = bodyPart.split("\n")[0]?.trim() ?? "";
                                if (
                                  /^https?:\/\//i.test(firstLine) &&
                                  !/\s/.test(firstLine)
                                ) {
                                  effectiveMediaUrl = firstLine;
                                  bodyPart = bodyPart
                                    .slice(firstLine.length)
                                    .replace(/^\n+/, "")
                                    .trim();
                                }
                              }

                              const headerTypeTv =
                                tv && typeof tv.headerType === "string"
                                  ? tv.headerType.toLowerCase()
                                  : "";
                              const mediaKind =
                                headerTypeTv === "image" ||
                                headerTypeTv === "video" ||
                                headerTypeTv === "document"
                                  ? headerTypeTv
                                  : effectiveMediaUrl
                                    ? inferTemplateMediaKindFromUrl(effectiveMediaUrl)
                                    : "";

                              const isOptimisticTemplate = msg.id.startsWith("optimistic-");
                              const tplUseDirect = !!(
                                effectiveMediaUrl &&
                                (isOptimisticTemplate ||
                                  effectiveMediaUrl.startsWith("blob:") ||
                                  effectiveMediaUrl.startsWith("/") ||
                                  isClientRenderableMediaUrl(effectiveMediaUrl))
                              );
                              const templateProxyUrl = `/api/media/proxy?messageId=${encodeURIComponent(msg.id)}`;
                              const templateMediaDisplayUrl = tplUseDirect
                                ? effectiveMediaUrl
                                : templateProxyUrl;

                              const tvHeaderMedia = tv?.headerMedia as
                                | {
                                    originalFilename?: unknown;
                                    url?: unknown;
                                  }
                                | null
                                | undefined;
                              const fromHeaderMedia =
                                tvHeaderMedia &&
                                typeof tvHeaderMedia.originalFilename === "string" &&
                                tvHeaderMedia.originalFilename.trim()
                                  ? tvHeaderMedia.originalFilename.trim()
                                  : "";
                              const documentBubbleTitle =
                                effectiveMediaUrl && mediaKind === "document"
                                  ? friendlyHeaderDocumentLabelForLibraryPreview({
                                      templateName: tmplName,
                                      optionalRuntimeFilename:
                                        (tv && typeof tv.headerDocumentFilename === "string"
                                          ? tv.headerDocumentFilename.trim()
                                          : "") ||
                                        fromHeaderMedia ||
                                        (typeof msg.mediaFilename === "string" ? msg.mediaFilename.trim() : "") ||
                                        null,
                                      mediaUrl: effectiveMediaUrl,
                                    })
                                  : "Document";

                              const hasTemplateBubbleMedia =
                                !!effectiveMediaUrl &&
                                (mediaKind === "image" ||
                                  mediaKind === "video" ||
                                  mediaKind === "document");

                              return (
                                <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-emerald-100/90 bg-emerald-50/40 leading-snug">
                                  {effectiveMediaUrl && mediaKind === "image" ? (
                                    <div className="min-w-0">
                                      <img
                                        src={templateMediaDisplayUrl}
                                        alt=""
                                        className="block max-h-40 w-full cursor-pointer rounded-lg object-cover"
                                        onClick={() =>
                                          window.open(
                                            tplUseDirect ? effectiveMediaUrl : templateProxyUrl,
                                            "_blank"
                                          )
                                        }
                                        onLoad={() => {
                                          if (shouldPinRef.current || justSentRef.current) {
                                            scrollToBottom();
                                          }
                                          justSentRef.current = false;
                                        }}
                                        onError={(e) => {
                                          justSentRef.current = false;
                                          if (!isOptimisticTemplate) {
                                            (e.currentTarget.parentElement!).innerHTML =
                                              '<span class="text-xs text-gray-400 italic">Media no longer available</span>';
                                          }
                                        }}
                                      />
                                    </div>
                                  ) : null}
                                  {effectiveMediaUrl && mediaKind === "video" ? (
                                    <video
                                      src={templateMediaDisplayUrl}
                                      controls
                                      className="block max-h-40 w-full rounded-lg bg-black"
                                      onLoadedMetadata={() => {
                                        if (shouldPinRef.current || justSentRef.current) {
                                          scrollToBottom();
                                        }
                                        justSentRef.current = false;
                                      }}
                                    />
                                  ) : null}
                                  {effectiveMediaUrl && mediaKind === "document" ? (
                                    <div className="mx-1.5 rounded-md border border-emerald-200/70 bg-white/80 px-2 py-1.5">
                                      <div className="flex min-w-0 items-center gap-1.5">
                                        <FileText
                                          className="h-3.5 w-3.5 shrink-0 text-gray-600"
                                          aria-hidden
                                        />
                                        <span className="min-w-0 truncate text-xs font-medium text-gray-900">
                                          {documentBubbleTitle}
                                        </span>
                                      </div>
                                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-tight">
                                        <a
                                          href={templateMediaDisplayUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-medium text-emerald-800 underline-offset-2 hover:underline"
                                        >
                                          Open
                                        </a>
                                        <span className="text-gray-300" aria-hidden>
                                          ·
                                        </span>
                                        <a
                                          href={templateMediaDisplayUrl}
                                          download={documentBubbleTitle}
                                          className="font-medium text-emerald-800 underline-offset-2 hover:underline"
                                        >
                                          Download
                                        </a>
                                      </div>
                                    </div>
                                  ) : null}
                                  <div
                                    className={cn(
                                      "flex min-w-0 items-center gap-1.5 overflow-hidden px-1.5 py-0.5",
                                      hasTemplateBubbleMedia && "border-t border-emerald-200/35"
                                    )}
                                  >
                                    <span className="shrink-0 text-[8px] font-semibold uppercase tracking-wide text-emerald-900/65">
                                      WhatsApp template
                                    </span>
                                    {provider === "meta" ? (
                                      <span className="shrink-0 rounded-full border border-emerald-200/60 bg-white/60 px-1 py-px text-[8px] font-medium leading-none text-emerald-900/75">
                                        Meta
                                      </span>
                                    ) : null}
                                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight text-gray-900">
                                      {tmplName || "Template"}
                                    </span>
                                    {langBadge ? (
                                      <span className="shrink-0 text-[8px] tabular-nums leading-none text-gray-500">
                                        {langBadge}
                                      </span>
                                    ) : null}
                                  </div>
                                  {bodyPart ? (
                                    <p className="whitespace-pre-wrap px-1.5 pb-1 pt-0.5 text-sm leading-snug text-gray-800 [overflow-wrap:anywhere] break-words">
                                      {bodyPart}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            }
                            const isImage = ct === 'image' || ct === 'sticker' || msg.mediaType?.startsWith('image');
                            const isVideo = ct === 'video' || msg.mediaType?.startsWith('video');
                            const isAudio = ct === 'audio' || msg.mediaType?.startsWith('audio');
                            const isDoc = ct === 'document' || msg.mediaType === 'document';
                            if (hasMedia && isImage) return (
                              <div className="min-w-0 max-w-full">
                                <img
                                  src={imageSrc}
                                  alt="Image"
                                  className="max-h-64 max-w-full rounded object-cover cursor-pointer"
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
                                {msg.content && <p className="mt-1 whitespace-pre-wrap text-sm leading-snug [overflow-wrap:anywhere] break-words">{msg.content}</p>}
                              </div>
                            );
                            if (hasMedia && isVideo) return (
                              <video
                                src={mediaDisplayUrl}
                                controls
                                className="max-h-64 max-w-full rounded"
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
                              <a href={mediaDisplayUrl} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 text-blue-600 underline">
                                <FileText className="w-4 h-4 flex-shrink-0" />
                                <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] break-words">{msg.mediaFilename || msg.content || 'Document'}</span>
                              </a>
                            );
                            if (
                              ct === "email" ||
                              ct === "email_html" ||
                              (activeChannel === "email" && !hasMedia && !msg.mediaUrl)
                            ) {
                              return (
                                <EmailMessageBody
                                  messageId={msg.id}
                                  fallbackText={msg.content || ""}
                                />
                              );
                            }
                            return <p className="whitespace-pre-wrap leading-snug [overflow-wrap:anywhere] break-words">{msg.content || (ct === 'sticker' ? 'Sticker received' : '')}</p>;
                            })()}
                          </div>
                          <div className="mt-1 flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-1 gap-y-0.5 self-end">
                            {msg.sentViaFallback && (
                              <span className="text-[10px] text-amber-600 [overflow-wrap:anywhere] break-words">via {msg.fallbackChannel}</span>
                            )}
                            <span className="text-[10px] text-gray-400">{format(new Date(msg.createdAt), 'h:mm a')}</span>
                            {isOut && (
                              isSending
                                ? <Loader2 className="w-2.5 h-2.5 text-gray-400 animate-spin" />
                                : msg.status === 'failed'
                                  ? msg.deliveryFailureKind === 'meta_reply_window' ||
                                      msg.deliveryFailureKind === 'media_validation' ||
                                      msg.errorCode === 'meta_reply_window' ||
                                      isMetaReplyWindowExpiredError(errBubbleText)
                                    ? null
                                    : <span className="text-[10px] text-red-500 font-medium">Not sent</span>
                                  : <span className="text-[10px] text-gray-400">
                                      {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                                    </span>
                            )}
                            {isEmailChannel && !msg.id.startsWith("optimistic-") ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    title="Email actions"
                                    aria-label="Email actions"
                                    data-testid={`button-email-message-menu-${msg.id}`}
                                    className="inline-flex h-4 w-4 items-center justify-center rounded text-gray-400 hover:text-gray-700"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreVertical className="h-3 w-3" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600"
                                    data-testid={`menu-delete-email-message-${msg.id}`}
                                    disabled={trashEmailMutation.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEmailTrashTarget({ messageId: msg.id, source: "bubble" });
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Delete Email
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </div>
                          {isOut &&
                            msg.status === "failed" &&
                            msg.deliveryFailureKind !== "media_validation" && (
                            <div
                              className={cn(
                                "mt-1 w-full text-left",
                                showReplyWindowFailureUi &&
                                  "rounded-md border border-rose-200/70 bg-rose-50/50 px-2 py-1.5",
                              )}
                            >
                              {showReplyWindowFailureUi ? (
                                <p className="whitespace-pre-wrap text-[11px] leading-snug text-rose-900/90 [overflow-wrap:anywhere] break-words">
                                  {userFacingReplyWindowBlockedMessageInbox(
                                    (primaryConversation?.channel || activeChannel || "whatsapp") as string
                                  )}
                                </p>
                              ) : showSpecificNonReplyFailure ? (
                                <p className="whitespace-pre-wrap text-[11px] font-medium leading-snug text-red-600 [overflow-wrap:anywhere] break-words">
                                  {webchatSendErrorDescription(errBubbleText, msg.errorCode, { expanded: true }) || errBubbleText}
                                </p>
                              ) : (
                                <p className="whitespace-pre-wrap text-[11px] leading-snug text-gray-600 [overflow-wrap:anywhere] break-words">
                                  Couldn&apos;t send this message. Check your connection or try again.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} className="h-2 w-full shrink-0" aria-hidden />
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

            {filePickerHint && (
              <div className="border-t border-amber-100 bg-amber-50/70 px-4 py-2.5 text-xs text-gray-800 flex gap-2 items-start shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden />
                <span>{filePickerHint}</span>
              </div>
            )}

            {/* File preview strip */}
            {(pendingFile || isUploading) && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 flex items-center gap-3">
                {isUploading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
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
                      onClick={() => {
                        setPendingFile(null);
                        setFilePickerHint(null);
                        URL.revokeObjectURL(pendingFile.localPreview);
                      }}
                      className="ml-auto p-1 rounded-full hover:bg-gray-200 text-gray-500"
                      title="Remove attachment"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : null}
              </div>
            )}

            {whatsappNotReady && (
              <div className="border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-950 flex gap-2 items-start shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden />
                <p className="font-medium leading-snug min-w-0 flex-1">
                  {whatsappAvailability?.bannerText || WHATSAPP_SETUP_INCOMPLETE_BANNER}
                </p>
              </div>
            )}

            {isEmailChannel && forceNewEmailCompose ? (
              <div
                className="border-t border-emerald-100 bg-emerald-50/70 px-4 py-2 text-xs text-emerald-900 shrink-0"
                data-testid="inbox-new-outreach-compose-banner"
              >
                New outreach email — review subject and message, then Send. This starts a new thread (not a reply).
              </div>
            ) : null}

            {isEmailChannel && (
              <div className="border-t border-gray-200 bg-white px-4 pt-2.5 pb-1 space-y-1.5 shrink-0">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="w-10 shrink-0">To</span>
                  <span className="truncate text-gray-800" data-testid="inbox-email-to">
                    {contact.email || "No email on contact"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="inbox-email-subject" className="w-10 shrink-0 text-xs text-gray-500">
                    Subj
                  </label>
                  <Input
                    id="inbox-email-subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder={
                      forceNewEmailCompose || !primaryConversation?.externalThreadId
                        ? "Subject"
                        : "Re: …"
                    }
                    className="h-8 text-sm"
                    data-testid="input-inbox-email-subject"
                    disabled={
                      !forceNewEmailCompose &&
                      !!primaryConversation?.externalThreadId &&
                      !!primaryConversation?.subject
                    }
                  />
                </div>
              </div>
            )}

            {/* Composer — Meta reply-window + AI notices merge into one chip bar inside AIComposer */}
            <AIComposer
              key={composerScopeKey ?? `contact-${selectedContactId}`}
              ref={composerRef}
              value={messageInput}
              onChange={handleComposerChange}
              onSend={handleSendMessage}
              onAutoSend={isEmailChannel ? undefined : handleAutoSend}
              aiEnabled={aiEnabled}
              hasFullAIBrain={hasFullAIBrain}
              capabilities={capabilities}
              businessAiMode={businessAiMode}
              handoffKeywords={handoffKeywords}
              contactId={selectedContactId}
              contactContext={contactContext}
              conversationId={hasConversation ? (primaryConversation?.id ?? null) : null}
              channel={isEmailChannel ? "email" : activeChannel}
              messages={
                hasConversation
                  ? messages.map((m) => ({
                      role: m.direction === "inbound" ? "user" : "assistant",
                      direction: m.direction,
                      content: m.content || "",
                    }))
                  : []
              }
              onTemplate={isWhatsAppContact && hasConversation ? handleOpenTemplatePicker : undefined}
              fileInputRef={isEmailChannel ? undefined : fileInputRef}
              handleFileSelect={isEmailChannel ? undefined : handleFileSelect}
              metaReplyWindowNotice={hasConversation && !isEmailChannel ? metaComposerWindowNotice : null}
              hasPendingAttachment={!!pendingFile && !isEmailChannel}
              onAttachPendingMedia={isEmailChannel ? undefined : attachComposerPendingMedia}
              forceManualMode={forceNewEmailCompose}
            />
          </>
        ) : selectedContactId ? (
          /* Contact selected but detail still loading (and not yet in inbox list cache) */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#efeae2]/30">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Loading contact…</p>
          </div>
        ) : (
          /* Empty state — no contact selected */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#efeae2]/30">
            <div className="bg-white rounded-2xl p-8 shadow-sm max-w-sm">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-gray-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Select a contact</h2>
              <p className="text-gray-500 text-sm">Choose a contact from the list to view messages and manage their CRM details.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT COLUMN: CRM Panel (desktop) ── */}
      {!isMobile && selectedContactId && contact && (
        <InboxLeadDetailsPanel
          key={contact.id}
          contact={contact as InboxLeadDetailsPanelContact}
          primaryConversation={hasConversation ? (primaryConversation as InboxLeadDetailsPanelConversation) : undefined}
          teamMembers={teamMembers}
          messages={hasConversation ? messages.map(m => ({ direction: m.direction, content: m.content || '' })) : []}
          capabilities={capabilities}
          currentUserId={user?.id}
          handoffActive={!!activeHandoff && hasConversation}
          handoffEventId={hasConversation ? (activeHandoff?.id ?? null) : null}
          handoffMessage={
            hasConversation && activeHandoff
              ? String((activeHandoff.eventData as any)?.reason || "Customer requested human assistance")
              : undefined
          }
          composerDraftPreview={
            hasFullAIBrain && messageInput.trim()
              ? `${messageInput.slice(0, 100)}${messageInput.length > 100 ? "…" : ""}`
              : undefined
          }
          onInsertComposerDraft={insertComposerDraftFromCopilot}
          connectedChannels={connectedChannelsMap}
          onUpdateContact={updateContact}
          onUpdateConversationStatus={status => {
            if (primaryConversation && hasConversation) {
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
              {showDetailsSheet && selectedContactId && contact ? (
                <InboxLeadDetailsPanel
                  key={contact.id}
                  contact={contact as InboxLeadDetailsPanelContact}
                  primaryConversation={hasConversation ? (primaryConversation as InboxLeadDetailsPanelConversation) : undefined}
                  teamMembers={teamMembers}
                  messages={hasConversation ? messages.map(m => ({ direction: m.direction, content: m.content || '' })) : []}
                  capabilities={capabilities}
                  currentUserId={user?.id}
                  panelClassName="flex flex-col w-full bg-white"
                  handoffActive={!!activeHandoff && hasConversation}
                  handoffEventId={hasConversation ? (activeHandoff?.id ?? null) : null}
                  handoffMessage={
                    hasConversation && activeHandoff
                      ? String((activeHandoff.eventData as any)?.reason || "Customer requested human assistance")
                      : undefined
                  }
                  composerDraftPreview={
                    hasFullAIBrain && messageInput.trim()
                      ? `${messageInput.slice(0, 100)}${messageInput.length > 100 ? "…" : ""}`
                      : undefined
                  }
                  onInsertComposerDraft={insertComposerDraftFromCopilot}
                  connectedChannels={connectedChannelsMap}
                  onUpdateContact={updateContact}
                  onUpdateConversationStatus={status => {
                    if (primaryConversation && hasConversation) {
                      updateConversationMutation.mutate({ conversationId: primaryConversation.id, status });
                    }
                  }}
                  onEditContact={() => { setShowDetailsSheet(false); handleEditContact(); }}
                  onDeleteContact={() => { setShowDetailsSheet(false); setShowDeleteConfirm(true); }}
                />
              ) : !selectedContactId || !contact ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-2">
                  <PanelRight className="w-6 h-6 opacity-40" />
                  <p>No contact selected</p>
                </div>
              ) : null}
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
                else if (event.eventType === "note") {
                  if (data?.kind === "workflow_task") {
                    description = data?.content || `Task: ${data?.title || "Workflow task"}`;
                  } else if (data?.kind === "language_detected") {
                    description = data?.content || `Language: ${data?.language || ""}`;
                  } else {
                    description = `Note: "${data?.content || ''}"`;
                  }
                }
                else if (event.eventType === "assignment") description = `Assigned to ${data?.assignee || data?.to || "team member"}`;
                else if (event.eventType === "contact_created") description = "Contact created";
                else description = Object.entries(data || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || "Activity recorded";

                return (
                  <div key={event.id} className="flex gap-3 p-2.5 bg-gray-50 rounded-lg" data-testid={`timeline-event-${event.id}`}>
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-gray-400 flex-shrink-0" />
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

      {/* Email message trash — separate from Delete Contact */}
      <Dialog
        open={!!emailTrashTarget}
        onOpenChange={(open) => {
          if (!open && !trashEmailMutation.isPending) setEmailTrashTarget(null);
        }}
      >
        <DialogContent className="max-w-sm" data-testid="dialog-delete-email">
          <DialogHeader>
            <DialogTitle>Delete Email</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to move this email to Trash? Other messages and the contact will remain.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={trashEmailMutation.isPending}
              onClick={() => setEmailTrashTarget(null)}
              data-testid="button-cancel-delete-email"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={trashEmailMutation.isPending || !emailTrashTarget}
              data-testid="button-confirm-delete-email"
              onClick={() => {
                if (!emailTrashTarget) return;
                trashEmailMutation.mutate({
                  messageId: emailTrashTarget.messageId,
                  source: emailTrashTarget.source,
                });
              }}
            >
              {trashEmailMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete Email
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template send: pick template + variables in one dialog */}
      <Dialog
        open={showTemplatePicker}
        onOpenChange={(open) => {
          setShowTemplatePicker(open);
          if (!open) {
            setSelectedInboxTemplate(null);
            setVarValues({});
            setTemplateSearch("");
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-gray-600" />
              {selectedInboxTemplate ? selectedInboxTemplate.name : "Send WhatsApp template"}
            </DialogTitle>
            {selectedInboxTemplate ? (
              <p className="text-left text-sm text-muted-foreground">
                Sending to this conversation. Fill any variables, then send.
              </p>
            ) : null}
          </DialogHeader>
          {!selectedInboxTemplate ? (
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
                <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                  {inboxTemplates
                    .filter(
                      (t) =>
                        t.status === "approved" &&
                        (t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                          t.bodyText?.toLowerCase().includes(templateSearch.toLowerCase()))
                    )
                    .map((t) => {
                      const { blocked } = getInboxTemplateSendBlockReason({
                        name: t.name,
                        bodyText: t.bodyText,
                        headerType: t.headerType,
                        headerContent: t.headerContent,
                        buttons: t.buttons,
                        templateType: t.templateType,
                        carouselCards: t.carouselCards,
                        category: t.category,
                      });
                      return (
                        <div
                          key={t.id}
                          className={cn(
                            "flex min-w-0 gap-2 rounded-lg border p-2.5 transition-colors",
                            blocked
                              ? "border-gray-200 bg-gray-50/90"
                              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                          )}
                          data-testid={`template-item-${t.id}`}
                        >
                          <button
                            type="button"
                            disabled={blocked}
                            onClick={() => {
                              if (!blocked) handleSelectTemplate(t);
                            }}
                            className={cn(
                              "min-w-0 flex-1 rounded-md px-1 py-0.5 text-left transition-colors",
                              blocked ? "cursor-not-allowed opacity-90" : "hover:bg-white/60"
                            )}
                          >
                            <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium text-gray-900">{t.name}</span>
                              <span className="shrink-0 text-[10px] text-gray-400 uppercase">{t.language}</span>
                            </div>
                            <p className="line-clamp-2 break-words text-xs text-gray-500">{t.bodyText}</p>
                            {blocked ? (
                              <p className="mt-2 rounded-md border border-gray-200 bg-white/90 px-2.5 py-2 text-[11px] leading-snug text-gray-600">
                                {INBOX_QUICK_SEND_ADVANCED_COPY}
                              </p>
                            ) : null}
                          </button>
                          {blocked ? (
                            <button
                              type="button"
                              onClick={() => {
                                setInboxPreviewTemplate(t);
                                setInboxTemplatePreviewOpen(true);
                              }}
                              className="shrink-0 self-start rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                              data-testid={`button-template-preview-${t.id}`}
                            >
                              Preview
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  {inboxTemplates.filter(
                    (t) =>
                      t.status === "approved" &&
                      (t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                        t.bodyText?.toLowerCase().includes(templateSearch.toLowerCase()))
                  ).length === 0 && (
                    <p className="py-4 text-center text-sm text-gray-500">No approved templates match your search.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
                {selectedInboxTemplate.bodyText}
              </div>
              {inboxQuickSendBlocked ? (
                <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-snug text-gray-600">
                  {INBOX_QUICK_SEND_ADVANCED_COPY}
                </p>
              ) : (selectedInboxTemplate.variables || []).length > 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-medium text-gray-500">Fill in the variables:</p>
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
              <div className="mt-1 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedInboxTemplate(null);
                    setVarValues({});
                  }}
                  data-testid="button-template-back"
                >
                  Back
                </Button>
                <Button
                  onClick={handleSendTemplateFromInbox}
                  disabled={sendTemplateFromInboxMutation.isPending || inboxQuickSendBlocked}
                  className={cn(
                    !inboxQuickSendBlocked && "bg-brand-green text-white hover:bg-brand-green/90"
                  )}
                  variant={inboxQuickSendBlocked ? "secondary" : "default"}
                  data-testid="button-template-send"
                >
                  {sendTemplateFromInboxMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : inboxQuickSendBlocked ? (
                    "Not available in quick-send"
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Template
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Advanced template: read-only preview from inbox picker */}
      <Dialog
        open={inboxTemplatePreviewOpen}
        onOpenChange={(open) => {
          setInboxTemplatePreviewOpen(open);
          if (!open) setInboxPreviewTemplate(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="dialog-inbox-template-preview">
          <DialogHeader>
            <DialogTitle className="pr-8 text-left leading-snug">{inboxPreviewTemplate?.name}</DialogTitle>
          </DialogHeader>
          {inboxPreviewTemplate ? (
            <>
              <WhatsAppTemplateRichPreview
                key={inboxPreviewTemplate.id}
                template={inboxPreviewTemplate}
                density="comfortable"
                livePreview={{
                  carouselCardMediaUrls: carouselDefaultMediaUrlsForLivePreview(
                    inboxPreviewTemplate.carouselDefaultMedia ?? undefined
                  ),
                }}
                savedCarouselDefaultsHint={
                  !!carouselDefaultMediaUrlsForLivePreview(
                    inboxPreviewTemplate.carouselDefaultMedia ?? undefined
                  )
                }
              />
              <p className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
                {INBOX_ADVANCED_PREVIEW_MODAL_NOTE}
              </p>
              <div className="flex justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setInboxTemplatePreviewOpen(false)}>
                  Close
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

    </div>
  );
}
