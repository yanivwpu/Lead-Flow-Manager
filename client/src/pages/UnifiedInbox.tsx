import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Search, 
  Send,
  Plus,
  User,
  Phone,
  Mail,
  Tag,
  Clock,
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
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { ChatAvatar } from "@/components/ChatAvatar";
import { TAG_COLORS } from "@/lib/data";

type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'sms' | 'webchat' | 'telegram' | 'tiktok';

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
  lastIncomingAt?: string;
  createdAt: string;
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

const CHANNEL_CONFIG: Record<Channel, { icon: any; color: string; label: string }> = {
  whatsapp: { icon: MessageCircle, color: '#25D366', label: 'WhatsApp' },
  instagram: { icon: Instagram, color: '#E4405F', label: 'Instagram' },
  facebook: { icon: Facebook, color: '#1877F2', label: 'Messenger' },
  sms: { icon: Smartphone, color: '#6B7280', label: 'SMS' },
  webchat: { icon: Globe, color: '#3B82F6', label: 'Web Chat' },
  telegram: { icon: Send, color: '#0088CC', label: 'Telegram' },
  tiktok: { icon: Video, color: '#000000', label: 'TikTok' },
};


export function UnifiedInbox() {
  const [match, params] = useRoute("/app/inbox/:contactId");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactForm, setNewContactForm] = useState({ name: "", phone: "", email: "" });
  const [showEditContact, setShowEditContact] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editContactForm, setEditContactForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedContactId = match ? params?.contactId : null;

  const { data: inbox = [], isLoading: inboxLoading } = useQuery<InboxItem[]>({
    queryKey: ["/api/inbox"],
  });

  const { data: contactData } = useQuery<{ contact: Contact; conversations: Conversation[] }>({
    queryKey: ["/api/contacts", selectedContactId],
    enabled: !!selectedContactId,
  });

  const primaryConversation = contactData?.conversations?.find(
    c => c.channel === (contactData?.contact?.primaryChannelOverride || contactData?.contact?.primaryChannel)
  ) || contactData?.conversations?.[0];

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/conversations", primaryConversation?.id, "messages"],
    enabled: !!primaryConversation?.id,
  });

  // Window status for Meta channels (Instagram, Facebook)
  interface WindowStatus {
    hasRestriction: boolean;
    isActive: boolean;
    windowExpiresAt?: string;
    hoursRemaining?: number;
    isExpiringSoon?: boolean;
    channel: string;
    message?: string;
  }

  const { data: windowStatus } = useQuery<WindowStatus>({
    queryKey: ["/api/conversations", primaryConversation?.id, "window-status"],
    enabled: !!primaryConversation?.id,
    refetchInterval: 60000, // Refresh every minute
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { contactId: string; content: string }) => {
      const res = await fetch(`/api/contacts/${data.contactId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: data.content }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setMessageInput("");
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: { name: string; phone?: string; email?: string }) => {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create contact");
      return res.json();
    },
    onSuccess: (contact) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      setShowNewContact(false);
      setNewContactForm({ name: "", phone: "", email: "" });
      setLocation(`/app/inbox/${contact.id}`);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async (data: { contactId: string; name: string; phone?: string; email?: string; notes?: string }) => {
      const res = await fetch(`/api/contacts/${data.contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: data.name, phone: data.phone, email: data.email, notes: data.notes }),
      });
      if (!res.ok) throw new Error("Failed to update contact");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      setShowEditContact(false);
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

  interface TimelineEvent {
    id: string;
    type: string;
    description: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
  }

  const { data: timeline = [] } = useQuery<TimelineEvent[]>({
    queryKey: ["/api/contacts", selectedContactId, "timeline"],
    enabled: !!selectedContactId && showTimeline,
  });

  const handleEditContact = () => {
    if (contactData?.contact) {
      setEditContactForm({
        name: contactData.contact.name || "",
        phone: contactData.contact.phone || "",
        email: contactData.contact.email || "",
        notes: contactData.contact.notes || "",
      });
      setShowEditContact(true);
    }
  };

  const handleSaveContact = () => {
    if (!selectedContactId) return;
    updateContactMutation.mutate({
      contactId: selectedContactId,
      ...editContactForm,
    });
  };

  const handleDeleteContact = () => {
    if (!selectedContactId) return;
    deleteContactMutation.mutate(selectedContactId);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filteredInbox = inbox.filter(item =>
    item.contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.contact.phone?.includes(searchQuery) ||
    item.contact.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedContactId) return;
    sendMessageMutation.mutate({ contactId: selectedContactId, content: messageInput });
  };

  const getChannelIcon = (channel: Channel) => {
    const config = CHANNEL_CONFIG[channel];
    const Icon = config.icon;
    return <Icon className="w-3 h-3" style={{ color: config.color }} />;
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

  if (inboxLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white" data-testid="unified-inbox">
      {/* Contact List - Hidden on mobile when a contact is selected */}
      <div className={cn(
        "w-full md:w-80 border-r flex flex-col",
        selectedContactId ? "hidden md:flex" : "flex"
      )}>
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold flex-1">Inbox</h2>
            <Dialog open={showNewContact} onOpenChange={setShowNewContact}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-new-contact">
                  <Plus className="w-4 h-4 mr-1" /> New
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Contact</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={newContactForm.name}
                      onChange={(e) => setNewContactForm({ ...newContactForm, name: e.target.value })}
                      placeholder="Contact name"
                      data-testid="input-contact-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={newContactForm.phone}
                      onChange={(e) => setNewContactForm({ ...newContactForm, phone: e.target.value })}
                      placeholder="+1234567890"
                      data-testid="input-contact-phone"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={newContactForm.email}
                      onChange={(e) => setNewContactForm({ ...newContactForm, email: e.target.value })}
                      placeholder="email@example.com"
                      data-testid="input-contact-email"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => createContactMutation.mutate(newContactForm)}
                    disabled={!newContactForm.name || createContactMutation.isPending}
                    data-testid="button-save-contact"
                  >
                    {createContactMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Add Contact"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-inbox"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {filteredInbox.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No contacts yet</p>
              <p className="text-sm">Add your first contact to get started</p>
            </div>
          ) : (
            filteredInbox.map((item) => (
              <div
                key={item.contact.id}
                onClick={() => setLocation(`/app/inbox/${item.contact.id}`)}
                className={cn(
                  "p-3 border-b cursor-pointer hover:bg-slate-50 transition-colors",
                  selectedContactId === item.contact.id && "bg-slate-100"
                )}
                data-testid={`inbox-item-${item.contact.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative flex-shrink-0">
                    <ChatAvatar src={item.contact.avatar} name={item.contact.name} size="md" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{item.contact.name}</span>
                      {getChannelIcon(item.channel)}
                      {item.unreadCount > 0 && (
                        <Badge variant="default" className="ml-auto text-xs px-1.5 py-0">
                          {item.unreadCount}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {item.lastMessage || "No messages yet"}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span 
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium border",
                          TAG_COLORS[item.contact.tag] || 'bg-blue-100 text-blue-700 border-blue-200'
                        )}
                      >
                        {item.contact.tag}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-slate-100 text-slate-600 border-slate-200">
                        {item.contact.pipelineStage}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatTime(item.lastMessageAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Conversation Panel - Full width on mobile */}
      <div className={cn(
        "flex-1 flex flex-col",
        selectedContactId ? "flex" : "hidden md:flex"
      )}>
        {selectedContactId && contactData?.contact ? (
          <>
            <div className="p-3 md:p-4 border-b flex items-center gap-2 md:gap-3">
              {/* Back button for mobile */}
              <button
                onClick={() => setLocation('/app/inbox')}
                className="md:hidden p-1 -ml-1 text-gray-600"
                data-testid="button-back-inbox"
              >
                <ChevronDown className="w-5 h-5 rotate-90" />
              </button>
              <ChatAvatar src={contactData.contact.avatar} name={contactData.contact.name} size="md" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{contactData.contact.name}</h3>
                  {getChannelIcon(contactData.contact.primaryChannelOverride as Channel || contactData.contact.primaryChannel)}
                  <span className="text-xs text-muted-foreground">
                    {CHANNEL_CONFIG[contactData.contact.primaryChannelOverride as Channel || contactData.contact.primaryChannel]?.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {contactData.contact.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {contactData.contact.phone}
                    </span>
                  )}
                  {contactData.contact.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {contactData.contact.email}
                    </span>
                  )}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2" data-testid="button-switch-channel">
                    {getChannelIcon(contactData.contact.primaryChannelOverride as Channel || contactData.contact.primaryChannel)}
                    <span className="text-xs">
                      {CHANNEL_CONFIG[contactData.contact.primaryChannelOverride as Channel || contactData.contact.primaryChannel]?.label}
                    </span>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {Object.entries(CHANNEL_CONFIG)
                    .filter(([key, config]) => config.label !== 'TikTok')
                    .map(([key, config]) => {
                      const Icon = config.icon;
                      const isActive = (contactData.contact.primaryChannelOverride || contactData.contact.primaryChannel) === key;
                      return (
                        <DropdownMenuItem
                          key={key}
                          onClick={() => switchChannelMutation.mutate({ contactId: selectedContactId!, channel: key as Channel })}
                          className={cn("gap-2", isActive && "bg-slate-100")}
                          data-testid={`channel-option-${key}`}
                        >
                          <Icon className="w-4 h-4" style={{ color: config.color }} />
                          {config.label}
                          {isActive && <span className="ml-auto text-xs text-muted-foreground">Active</span>}
                        </DropdownMenuItem>
                      );
                    })}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-contact-menu">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleEditContact} data-testid="menu-edit-contact">Edit Contact</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowTimeline(true)} data-testid="menu-view-timeline">View Timeline</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)} className="text-red-600" data-testid="menu-delete-contact">Delete Contact</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No messages yet</p>
                  <p className="text-sm">Send a message to start the conversation</p>
                </div>
              ) : (
                [...messages].reverse().map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.direction === 'outbound' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[70%] rounded-lg px-4 py-2",
                        message.direction === 'outbound'
                          ? "bg-primary text-primary-foreground"
                          : "bg-white border"
                      )}
                      data-testid={`message-${message.id}`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      <div className={cn(
                        "text-xs mt-1 flex items-center gap-1",
                        message.direction === 'outbound' ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        {format(new Date(message.createdAt), "h:mm a")}
                        {message.direction === 'outbound' && message.status === 'sent' && (
                          <span>✓</span>
                        )}
                        {message.direction === 'outbound' && message.status === 'delivered' && (
                          <span>✓✓</span>
                        )}
                        {message.sentViaFallback && message.fallbackChannel && (
                          <span className="ml-1 text-amber-200 flex items-center gap-1">
                            • via {CHANNEL_CONFIG[message.fallbackChannel]?.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t bg-white">
              {/* Meta 24-hour window warning */}
              {windowStatus?.hasRestriction && !windowStatus?.isActive && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700">Messaging window expired</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      The 24-hour {windowStatus.channel === 'instagram' ? 'Instagram' : 'Facebook Messenger'} messaging window has closed. 
                      You can only respond after {contactData?.contact?.name || 'the customer'} messages you first.
                    </p>
                  </div>
                </div>
              )}
              {windowStatus?.hasRestriction && windowStatus?.isExpiringSoon && windowStatus?.isActive && (
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-700">Window expiring soon</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Only {windowStatus.hoursRemaining?.toFixed(1)} hours left to reply via {windowStatus.channel === 'instagram' ? 'Instagram' : 'Facebook Messenger'}. 
                      After that, you'll need to wait for the customer to message first.
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Textarea
                  placeholder={windowStatus?.hasRestriction && !windowStatus?.isActive 
                    ? "Cannot send - messaging window expired" 
                    : "Type a message..."}
                  className="min-h-[44px] max-h-32 resize-none"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={windowStatus?.hasRestriction && !windowStatus?.isActive}
                  data-testid="input-message"
                />
                
                {contactData.contact.primaryChannel !== 'whatsapp' && contactData.contact.phone && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
                    title="Move to WhatsApp"
                    onClick={() => {
                      const text = encodeURIComponent(messageInput || "Hi, I'm reaching out from your website.");
                      const phone = contactData.contact.phone!.replace(/\D/g, '');
                      window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
                    }}
                    data-testid="button-move-to-whatsapp"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </Button>
                )}

                <Button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || sendMessageMutation.isPending || (windowStatus?.hasRestriction && !windowStatus?.isActive)}
                  data-testid="button-send-message"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                {getChannelIcon(contactData.contact.primaryChannelOverride as Channel || contactData.contact.primaryChannel)}
                Sending via {CHANNEL_CONFIG[contactData.contact.primaryChannelOverride as Channel || contactData.contact.primaryChannel]?.label}
                {windowStatus?.hasRestriction && windowStatus?.isActive && windowStatus?.hoursRemaining && (
                  <span className="ml-2 text-amber-600">
                    ({Math.round(windowStatus.hoursRemaining)}h window remaining)
                  </span>
                )}
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-1">Select a contact</h3>
              <p className="text-sm">Choose a contact to view their conversation</p>
            </div>
          </div>
        )}
      </div>

      {/* Edit Contact Dialog */}
      <Dialog open={showEditContact} onOpenChange={setShowEditContact}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editContactForm.name}
                onChange={(e) => setEditContactForm({ ...editContactForm, name: e.target.value })}
                data-testid="input-edit-name"
              />
            </div>
            <div>
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editContactForm.phone}
                onChange={(e) => setEditContactForm({ ...editContactForm, phone: e.target.value })}
                data-testid="input-edit-phone"
              />
            </div>
            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editContactForm.email}
                onChange={(e) => setEditContactForm({ ...editContactForm, email: e.target.value })}
                data-testid="input-edit-email"
              />
            </div>
            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editContactForm.notes}
                onChange={(e) => setEditContactForm({ ...editContactForm, notes: e.target.value })}
                data-testid="input-edit-notes"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEditContact(false)} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button onClick={handleSaveContact} disabled={updateContactMutation.isPending} data-testid="button-save-contact">
                {updateContactMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Timeline Dialog */}
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
                {timeline.map((event) => (
                  <div key={event.id} className="flex gap-3 p-3 bg-slate-50 rounded-lg" data-testid={`timeline-event-${event.id}`}>
                    <div className="w-2 h-2 mt-2 rounded-full bg-primary flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{event.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(event.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
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
            Are you sure you want to delete <strong>{contactData?.contact?.name}</strong>? 
            This will remove all conversations and messages. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteContact} 
              disabled={deleteContactMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteContactMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete Contact
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
