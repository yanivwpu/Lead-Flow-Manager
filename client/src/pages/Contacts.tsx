import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Search, UserPlus, MessageCircle, Instagram, Facebook, Smartphone, Globe, Send,
  ChevronUp, ChevronDown, ChevronsUpDown, X, Users, Phone, Mail, ShoppingCart,
  ArrowUpRight, RefreshCw, Download, StickyNote, Sparkles, Loader2, CalendarCheck,
  MoreVertical, Trash2,
} from "lucide-react";
import {
  getContactDisplayChannel,
  getContactDisplayChannelLabel,
} from "@shared/contactChannelDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { invalidateQueriesAfterContactDeletion } from "@/lib/contactDeletionCache";
import { useToast } from "@/hooks/use-toast";
import { TAG_COLORS } from "@/lib/data";
import { isCrmDisplayTag, nextActiveAppointmentByContact } from "@shared/activeAppointment";
import {
  CONTACTS_BULK_DELETE_MAX,
  contactHasActiveFollowUp,
  describeContactDeletionExtraWarning,
} from "@shared/contactDeletion";

type Channel = "whatsapp" | "instagram" | "facebook" | "sms" | "webchat" | "telegram" | "shopify" | "woocommerce";

/** Filter/stats key when contact has no messaging or commerce display channel */
const DISPLAY_CHANNEL_NONE = "__none__";

interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  avatar?: string;
  tag: string;
  pipelineStage: string;
  primaryChannel: Channel;
  primaryChannelOverride?: Channel;
  lastIncomingChannel?: string;
  source?: string;
  assignedTo?: string;
  followUp?: string;
  followUpDate?: string;
  hasActiveCampaignEnrollment?: boolean;
  notes?: string;
  createdAt: string;
  whatsappId?: string;
  instagramId?: string;
  facebookId?: string;
  telegramId?: string;
  ghlId?: string;
  customFields?: Record<string, unknown>;
}

const CHANNEL_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  whatsapp: { icon: MessageCircle, color: "#25D366", label: "WhatsApp" },
  instagram: { icon: Instagram, color: "#E4405F", label: "Instagram" },
  facebook: { icon: Facebook, color: "#1877F2", label: "Messenger" },
  sms: { icon: Smartphone, color: "#6B7280", label: "SMS" },
  webchat: { icon: Globe, color: "#3B82F6", label: "Web Chat" },
  telegram: { icon: Send, color: "#0088CC", label: "Telegram" },
  shopify: { icon: ShoppingCart, color: "#96BF48", label: "Shopify" },
  woocommerce: { icon: ShoppingCart, color: "#96588A", label: "WooCommerce" },
  email: { icon: Mail, color: "#EA4335", label: "Email" },
  [DISPLAY_CHANNEL_NONE]: { icon: Smartphone, color: "#9CA3AF", label: "No channel" },
};

function contactDisplayChannelKey(contact: Contact): string {
  return getContactDisplayChannel(contact) ?? DISPLAY_CHANNEL_NONE;
}

const CONTACTS_TABLE_COLS =
  "grid-cols-[2rem_minmax(0,2fr)_1fr_1.2fr_1fr_1fr_1fr_2rem]";

function channelUiConfig(channelKey: string) {
  return CHANNEL_CONFIG[channelKey] ?? CHANNEL_CONFIG[DISPLAY_CHANNEL_NONE];
}

function getTagColor(tag: string) {
  return TAG_COLORS[tag] || "bg-gray-100 text-gray-600 border-gray-200";
}

function displayCrmTag(tag: string | undefined): string | null {
  return isCrmDisplayTag(tag) ? tag : null;
}

function formatBookedAt(iso: string): string {
  return format(new Date(iso), "MMM d 'at' h:mm a");
}

function ChannelIcon({ channel, size = "w-3.5 h-3.5" }: { channel: string; size?: string }) {
  const cfg = channelUiConfig(channel);
  const Icon = cfg.icon;
  return <Icon className={size} style={{ color: cfg.color }} />;
}

function Avatar({ contact }: { contact: Contact }) {
  const ch = contactDisplayChannelKey(contact);
  const initials = contact.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="relative flex-shrink-0">
      {contact.avatar ? (
        <img src={contact.avatar} alt={contact.name} className="w-9 h-9 rounded-full object-cover" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
          {initials}
        </div>
      )}
      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-sm border border-gray-100">
        <ChannelIcon channel={ch} size="w-2.5 h-2.5" />
      </span>
    </div>
  );
}

type SortField = "name" | "createdAt" | "pipelineStage" | "tag";
type SortDir = "asc" | "desc";

function SortHeader({
  label, field, sortField, sortDir, onSort,
}: {
  label: string; field: SortField; sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors",
        active ? "text-gray-700 font-semibold" : "text-gray-500 hover:text-gray-700",
      )}
    >
      {label}
      <span className="w-3.5">
        {active ? (
          sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />
        )}
      </span>
    </button>
  );
}

function StatCard({ label, value, icon: Icon, color, iconColor = "text-gray-500" }: { label: string; value: number; icon: any; color: string; iconColor?: string }) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm min-w-0">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", color)}>
        <Icon className={cn("w-4 h-4", iconColor)} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-900 leading-none">{value.toLocaleString()}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
}

function ContactRowMenu({
  contact,
  onDelete,
}: {
  contact: Contact;
  onDelete: (contact: Contact) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          data-testid={`menu-contact-${contact.id}`}
          aria-label="Contact actions"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600"
          data-testid={`menu-delete-contact-${contact.id}`}
          onSelect={() => onDelete(contact)}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Contact
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Contacts() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const contactsQueryKey = withUserQueryScope(["/api/contacts"], user?.id);
  const notesSummaryQueryKey = withUserQueryScope(["/api/contacts/notes-summary"], user?.id);
  const appointmentsQueryKey = withUserQueryScope(["/api/appointments"], user?.id);

  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState<string>("");
  const [filterChannel, setFilterChannel] = useState<string>("");
  const [filterStage, setFilterStage] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", phone: "", email: "" });
  const [addError, setAddError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<
    { mode: "single"; contact: Contact } | { mode: "bulk"; ids: string[] } | null
  >(null);

  const [snapshotContact, setSnapshotContact] = useState<Contact | null>(null);
  const [snapshotText, setSnapshotText] = useState<string>("");
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState("");

  const [notesContact, setNotesContact] = useState<Contact | null>(null);
  const [notesList, setNotesList] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const { data: notesSummary = {} } = useQuery<Record<string, number>>({
    queryKey: notesSummaryQueryKey,
    queryFn: async () => {
      const res = await fetch("/api/contacts/notes-summary", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
  });

  async function openNotesPopup(contact: Contact, e: React.MouseEvent) {
    e.stopPropagation();
    setNotesContact(contact);
    setNotesList([]);
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/notes`, { credentials: "include" });
      const data = await res.json();
      setNotesList(Array.isArray(data) ? data : []);
    } catch {
      setNotesList([]);
    } finally {
      setNotesLoading(false);
    }
  }

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: contactsQueryKey,
    queryFn: async () => {
      const res = await fetch("/api/contacts?limit=5000", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: contactAppointments = [] } = useQuery<Array<{
    id: string;
    contactId: string;
    appointmentDate: string;
    title?: string;
    appointmentType?: string;
  }>>({
    queryKey: appointmentsQueryKey,
    staleTime: 30_000,
  });

  const nextAppointmentByContact = useMemo(
    () => nextActiveAppointmentByContact(contactAppointments),
    [contactAppointments]
  );

  const addMutation = useMutation({
    mutationFn: async (data: { name: string; phone: string; email: string }) => {
      const res = await fetch("/api/contacts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create contact");
      }
      return res.json();
    },
    onSuccess: (contact) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setShowAddDialog(false);
      setNewContact({ name: "", phone: "", email: "" });
      setAddError("");
      navigate(`/app/inbox/${contact.id}`);
    },
    onError: (err: Error) => setAddError(err.message),
  });

  const removeContactsFromCache = (deletedIds: string[]) => {
    const deleted = new Set(deletedIds);
    queryClient.setQueryData<Contact[]>(contactsQueryKey, (old) =>
      old ? old.filter((c) => !deleted.has(c.id)) : old,
    );
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const id of prev) {
        if (!deleted.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  };

  const deleteSingleMutation = useMutation({
    mutationFn: async (contact: Contact) => {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete contact");
      }
      return contact;
    },
    onSuccess: (contact) => {
      removeContactsFromCache([contact.id]);
      invalidateQueriesAfterContactDeletion(queryClient);
      setDeleteTarget(null);
      toast({ title: `${contact.name} deleted.` });
    },
    onError: (err: Error) => {
      toast({ title: "Could not delete contact", description: err.message, variant: "destructive" });
    },
  });

  const deleteBulkMutation = useMutation({
    mutationFn: async (contactIds: string[]) => {
      const res = await fetch("/api/contacts/bulk-delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to delete contacts");
      }
      return { deleted: Number(body.deleted) || contactIds.length, contactIds };
    },
    onSuccess: ({ deleted, contactIds }) => {
      removeContactsFromCache(contactIds);
      invalidateQueriesAfterContactDeletion(queryClient);
      setDeleteTarget(null);
      toast({
        title: deleted === 1 ? "1 contact deleted." : `${deleted} contacts deleted.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Could not delete contacts", description: err.message, variant: "destructive" });
    },
  });

  const allTags = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => {
      const tag = displayCrmTag(c.tag);
      if (tag) s.add(tag);
    });
    return Array.from(s).sort();
  }, [contacts]);

  const allStages = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => { if (c.pipelineStage) s.add(c.pipelineStage); });
    return Array.from(s).sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    let list = [...contacts];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.email?.toLowerCase().includes(q),
      );
    }
    if (filterTag) list = list.filter((c) => c.tag === filterTag);
    if (filterStage) list = list.filter((c) => c.pipelineStage === filterStage);
    if (filterChannel) {
      list = list.filter((c) => contactDisplayChannelKey(c) === filterChannel);
    }

    list.sort((a, b) => {
      let av: string, bv: string;
      if (sortField === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (sortField === "createdAt") { av = a.createdAt; bv = b.createdAt; }
      else if (sortField === "tag") { av = a.tag; bv = b.tag; }
      else { av = a.pipelineStage; bv = b.pipelineStage; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [contacts, search, filterTag, filterStage, filterChannel, sortField, sortDir]);

  useEffect(() => {
    const visible = new Set(filtered.map((c) => c.id));
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filtered]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const someFilteredSelected = filtered.some((c) => selectedIds.has(c.id));
  const headerCheckboxState: boolean | "indeterminate" = allFilteredSelected
    ? true
    : someFilteredSelected
      ? "indeterminate"
      : false;

  function toggleContactSelected(contactId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(contactId);
      else next.delete(contactId);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const c of filtered) next.delete(c.id);
        return next;
      }
      const next = new Set(prev);
      for (const c of filtered) next.add(c.id);
      return next;
    });
  }

  const appointmentContactIds = useMemo(() => {
    const ids = new Set<string>();
    for (const appt of contactAppointments) {
      if (appt.contactId) ids.add(appt.contactId);
    }
    return ids;
  }, [contactAppointments]);

  const contactsById = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts) map.set(c.id, c);
    return map;
  }, [contacts]);

  const deleteExtraWarning = useMemo(() => {
    if (!deleteTarget) return null;
    const ids = deleteTarget.mode === "single" ? [deleteTarget.contact.id] : deleteTarget.ids;
    const flags = {
      hasAppointments: ids.some((id) => appointmentContactIds.has(id)),
      hasActiveCampaignEnrollment: ids.some((id) => contactsById.get(id)?.hasActiveCampaignEnrollment),
      hasActiveFollowUp: ids.some((id) => {
        const c = contactsById.get(id);
        return c ? contactHasActiveFollowUp(c) : false;
      }),
    };
    return describeContactDeletionExtraWarning(flags, deleteTarget.mode);
  }, [deleteTarget, appointmentContactIds, contactsById]);

  const deletePending = deleteSingleMutation.isPending || deleteBulkMutation.isPending;

  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    contacts.forEach((c) => {
      const ch = contactDisplayChannelKey(c);
      counts[ch] = (counts[ch] || 0) + 1;
    });
    return counts;
  }, [contacts]);

  const activeFiltersCount = [filterTag, filterChannel, filterStage].filter(Boolean).length;

  async function openSnapshot(contact: Contact, e: React.MouseEvent) {
    e.stopPropagation();
    setSnapshotContact(contact);
    setSnapshotText("");
    setSnapshotError("");
    setSnapshotLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/snapshot`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSnapshotText(data.snapshot || "");
    } catch (err: any) {
      setSnapshotError(err.message);
    } finally {
      setSnapshotLoading(false);
    }
  }

  function handleSort(field: SortField) {
    if (field === sortField) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  function clearFilters() {
    setFilterTag("");
    setFilterChannel("");
    setFilterStage("");
    setSearch("");
  }

  function handleExport() {
    const rows = [
      ["Name", "Phone", "Email", "Tag", "Appointment", "Pipeline Stage", "Channel", "Created"],
      ...filtered.map((c) => {
        const appt = nextAppointmentByContact.get(c.id);
        return [
          c.name,
          c.phone || "",
          c.email || "",
          displayCrmTag(c.tag) || "",
          appt ? formatBookedAt(appt.appointmentDate) : "",
          c.pipelineStage,
          getContactDisplayChannelLabel(getContactDisplayChannel(c)),
          c.createdAt ? format(new Date(c.createdAt), "yyyy-MM-dd") : "",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contacts.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const topChannels = Object.entries(channelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900" data-testid="contacts-title">
              {t("contacts.title", "Contacts")}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {t("contacts.subtitle", "All your contacts in one place")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              data-testid="button-export-contacts"
              className="hidden sm:flex items-center gap-1.5 text-gray-600"
            >
              <Download className="w-4 h-4" />
              {t("contacts.export", "Export")}
            </Button>
            <button
              onClick={() => setShowAddDialog(true)}
              data-testid="button-add-contact"
              className="h-8 px-3 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {t("contacts.addContact", "Add Contact")}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label={t("contacts.totalContacts", "Total Contacts")}
              value={contacts.length}
              icon={Users}
              color="bg-gray-100"
              iconColor="text-gray-500"
            />
            {topChannels.map(([ch, count]) => {
              const cfg = channelUiConfig(ch);
              const Icon = cfg.icon;
              return (
                <div
                  key={ch}
                  onClick={() => setFilterChannel(filterChannel === ch ? "" : ch)}
                  className={cn(
                    "flex items-center gap-3 bg-white rounded-xl border px-4 py-3 shadow-sm cursor-pointer transition-all",
                    filterChannel === ch
                      ? "border-gray-300 ring-2 ring-gray-100"
                      : "border-gray-100 hover:border-gray-200",
                  )}
                  data-testid={`stat-channel-${ch}`}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-50 border border-gray-100">
                    <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold text-gray-900 leading-none">{count}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{cfg.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Search + Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder={t("contacts.searchPlaceholder", "Search by name, phone or email…")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 bg-white"
                data-testid="input-contacts-search"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Tag filter */}
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              data-testid="select-filter-tag"
            >
              <option value="">{t("contacts.allTags", "All Tags")}</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>

            {/* Pipeline stage filter */}
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              data-testid="select-filter-stage"
            >
              <option value="">{t("contacts.allStages", "All Stages")}</option>
              {allStages.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Channel filter */}
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              data-testid="select-filter-channel"
            >
              <option value="">{t("contacts.allChannels", "All Channels")}</option>
              {Object.entries(CHANNEL_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>

            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-gray-500 h-9 flex items-center gap-1"
                data-testid="button-clear-filters"
              >
                <X className="w-3.5 h-3.5" />
                {t("contacts.clearFilters", "Clear")}
                <Badge className="ml-0.5 bg-gray-100 text-gray-600 text-xs px-1.5 py-0 h-4">
                  {activeFiltersCount}
                </Badge>
              </Button>
            )}

            <span className="text-sm text-gray-400 ml-auto">
              {filtered.length === contacts.length
                ? t("contacts.countAll", "{{count}} contacts", { count: contacts.length })
                : t("contacts.countFiltered", "{{filtered}} of {{total}}", { filtered: filtered.length, total: contacts.length })}
            </span>
          </div>

          {selectedIds.size >= 1 && (
            <div
              className="flex flex-col gap-2 rounded-lg border bg-gray-50/70 px-2.5 py-1.5 sm:flex-row sm:flex-wrap sm:items-center"
              data-testid="contacts-bulk-bar"
            >
              <p className="text-xs font-medium text-gray-800" data-testid="contacts-selected-count">
                {selectedIds.size} selected
              </p>
              <div className="flex flex-wrap gap-1.5 sm:ml-auto">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-gray-500"
                  onClick={() => setSelectedIds(new Set())}
                  data-testid="button-clear-contact-selection"
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-8 text-xs"
                  disabled={selectedIds.size > CONTACTS_BULK_DELETE_MAX}
                  title={selectedIds.size > CONTACTS_BULK_DELETE_MAX ? `Select at most ${CONTACTS_BULK_DELETE_MAX} contacts` : undefined}
                  onClick={() => setDeleteTarget({ mode: "bulk", ids: [...selectedIds] })}
                  data-testid="button-delete-selected-contacts"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Delete selected
                </Button>
              </div>
              {selectedIds.size > CONTACTS_BULK_DELETE_MAX ? (
                <p className="w-full text-[11px] text-amber-800" data-testid="contacts-bulk-max-hint">
                  Select at most {CONTACTS_BULK_DELETE_MAX} contacts to delete at once.
                </p>
              ) : null}
            </div>
          )}

          {/* ── MOBILE card list (< md) ── */}
          <div className="md:hidden bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="py-16 text-center text-gray-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                <p className="text-sm">{t("contacts.loading", "Loading contacts…")}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">
                  {contacts.length === 0
                    ? t("contacts.emptyState", "No contacts yet")
                    : t("contacts.noResults", "No contacts match your filters")}
                </p>
                {contacts.length === 0 && (
                  <p className="text-gray-400 text-sm mt-1">
                    {t("contacts.emptyHint", "Contacts are created automatically when someone messages you")}
                  </p>
                )}
                {contacts.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-3 text-gray-600">
                    {t("contacts.clearFilters", "Clear filters")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-50">
                  <Checkbox
                    checked={headerCheckboxState}
                    onCheckedChange={() => toggleSelectAllFiltered()}
                    aria-label="Select all filtered contacts"
                    data-testid="checkbox-select-all-contacts-mobile"
                  />
                  <span className="text-xs font-medium text-gray-500">
                    {t("contacts.selectAllFiltered", "Select all")}
                  </span>
                </div>
                {filtered.map((contact) => {
                  const ch = contactDisplayChannelKey(contact);
                  const cfg = channelUiConfig(ch);
                  const crmTag = displayCrmTag(contact.tag);
                  const bookedAppt = nextAppointmentByContact.get(contact.id);
                  return (
                    <div
                      key={contact.id}
                      onClick={() => navigate(`/app/inbox/${contact.id}`)}
                      className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 cursor-pointer transition-colors"
                      data-testid={`row-contact-${contact.id}`}
                    >
                      <div
                        className="flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedIds.has(contact.id)}
                          onCheckedChange={(checked) => toggleContactSelected(contact.id, checked === true)}
                          aria-label={`Select ${contact.name}`}
                          data-testid={`checkbox-contact-${contact.id}`}
                        />
                      </div>
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        <Avatar contact={contact} />
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="font-medium text-gray-900 text-sm truncate">
                            {contact.name}
                          </p>
                          {(notesSummary[contact.id] ?? 0) > 0 && (
                            <button
                              onClick={(e) => openNotesPopup(contact, e)}
                              data-testid={`btn-notes-${contact.id}`}
                              className="flex-shrink-0 text-amber-400"
                            >
                              <StickyNote className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={(e) => openSnapshot(contact, e)}
                            data-testid={`btn-snapshot-${contact.id}`}
                            className="flex-shrink-0 text-violet-400"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Channel icon + label */}
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <ChannelIcon channel={ch} size="w-3.5 h-3.5" />
                            {cfg.label}
                          </span>
                          {/* Tag badge */}
                          {crmTag && (
                            <span className={cn(
                              "inline-flex items-center px-1.5 py-0 rounded-full text-[11px] font-medium border",
                              getTagColor(crmTag),
                            )} data-testid={`badge-tag-${contact.id}`}>
                              {crmTag}
                            </span>
                          )}
                          {/* Stage */}
                          {contact.pipelineStage && (
                            <span className="text-[11px] text-gray-500" data-testid={`text-stage-${contact.id}`}>
                              {contact.pipelineStage}
                            </span>
                          )}
                        </div>
                        {/* Phone / email */}
                        {contact.phone ? (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 flex-shrink-0" />
                            {contact.phone}
                          </p>
                        ) : contact.email ? (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3 flex-shrink-0" />
                            {contact.email}
                          </p>
                        ) : null}
                      </div>

                      {/* Right: appointment + timestamp + menu */}
                      <div className="flex-shrink-0 flex items-start gap-1">
                        <div className="flex flex-col items-end gap-1">
                          {bookedAppt ? (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700"
                              data-testid={`text-appointment-${contact.id}`}
                            >
                              <CalendarCheck className="w-3 h-3 shrink-0" aria-hidden />
                              {formatBookedAt(bookedAppt.appointmentDate)}
                            </span>
                          ) : null}
                          <span className="text-[10px] text-gray-400" data-testid={`text-created-${contact.id}`}>
                            {contact.createdAt
                              ? formatDistanceToNow(new Date(contact.createdAt), { addSuffix: true })
                              : "—"}
                          </span>
                        </div>
                        <ContactRowMenu
                          contact={contact}
                          onDelete={(c) => setDeleteTarget({ mode: "single", contact: c })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── DESKTOP table (md+) ── */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className={cn("grid gap-4 px-4 py-2.5 border-b border-gray-100 bg-gray-50", CONTACTS_TABLE_COLS)}>
              <div className="flex items-center">
                <Checkbox
                  checked={headerCheckboxState}
                  onCheckedChange={() => toggleSelectAllFiltered()}
                  aria-label="Select all filtered contacts"
                  data-testid="checkbox-select-all-contacts"
                />
              </div>
              <SortHeader label={t("contacts.colName", "Contact")} field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label={t("contacts.colTag", "Tag")} field="tag" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {t("contacts.colAppointment", "Appointment")}
              </span>
              <SortHeader label={t("contacts.colStage", "Stage")} field="pipelineStage" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {t("contacts.colChannel", "Channel")}
              </span>
              <SortHeader label={t("contacts.colAdded", "Added")} field="createdAt" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <span className="sr-only">Actions</span>
            </div>

            {isLoading ? (
              <div className="py-16 text-center text-gray-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                <p className="text-sm">{t("contacts.loading", "Loading contacts…")}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">
                  {contacts.length === 0
                    ? t("contacts.emptyState", "No contacts yet")
                    : t("contacts.noResults", "No contacts match your filters")}
                </p>
                {contacts.length === 0 && (
                  <p className="text-gray-400 text-sm mt-1">
                    {t("contacts.emptyHint", "Contacts are created automatically when someone messages you")}
                  </p>
                )}
                {contacts.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-3 text-gray-600">
                    {t("contacts.clearFilters", "Clear filters")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map((contact) => {
                  const ch = contactDisplayChannelKey(contact);
                  const cfg = channelUiConfig(ch);
                  const crmTag = displayCrmTag(contact.tag);
                  const bookedAppt = nextAppointmentByContact.get(contact.id);
                  return (
                    <div
                      key={contact.id}
                      onClick={() => navigate(`/app/inbox/${contact.id}`)}
                      className={cn("grid gap-4 px-4 py-3 items-center hover:bg-gray-50 cursor-pointer transition-colors group", CONTACTS_TABLE_COLS)}
                      data-testid={`row-contact-${contact.id}`}
                    >
                      <div
                        className="flex items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedIds.has(contact.id)}
                          onCheckedChange={(checked) => toggleContactSelected(contact.id, checked === true)}
                          aria-label={`Select ${contact.name}`}
                          data-testid={`checkbox-contact-${contact.id}`}
                        />
                      </div>
                      {/* Name + phone */}
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar contact={contact} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-gray-900 text-sm truncate group-hover:text-gray-700 transition-colors">
                              {contact.name}
                            </p>
                            {(notesSummary[contact.id] ?? 0) > 0 && (
                              <button
                                onClick={(e) => openNotesPopup(contact, e)}
                                title={`${notesSummary[contact.id]} note${notesSummary[contact.id] > 1 ? "s" : ""}`}
                                data-testid={`btn-notes-${contact.id}`}
                                className="flex-shrink-0 text-amber-400 hover:text-amber-600 transition-colors"
                              >
                                <StickyNote className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={(e) => openSnapshot(contact, e)}
                              title="AI Snapshot"
                              data-testid={`btn-snapshot-${contact.id}`}
                              className="flex-shrink-0 text-violet-400 hover:text-violet-600 transition-colors"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {contact.phone && (
                            <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 flex-shrink-0" />
                              {contact.phone}
                            </p>
                          )}
                          {!contact.phone && contact.email && (
                            <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 flex-shrink-0" />
                              {contact.email}
                            </p>
                          )}
                        </div>
                        <ArrowUpRight className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </div>

                      {/* Tag */}
                      <div>
                        {crmTag ? (
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                            getTagColor(crmTag),
                          )} data-testid={`badge-tag-${contact.id}`}>
                            {crmTag}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </div>

                      {/* Appointment */}
                      <div>
                        {bookedAppt ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium"
                            data-testid={`text-appointment-${contact.id}`}
                          >
                            <CalendarCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            {formatBookedAt(bookedAppt.appointmentDate)}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </div>

                      {/* Pipeline stage */}
                      <div>
                        <span className="text-sm text-gray-600 truncate block" data-testid={`text-stage-${contact.id}`}>
                          {contact.pipelineStage || <span className="text-gray-300">—</span>}
                        </span>
                      </div>

                      {/* Channel */}
                      <div className="flex items-center gap-1.5">
                        <ChannelIcon channel={ch} size="w-4 h-4" />
                        <span className="text-sm text-gray-500 hidden sm:block">{cfg.label}</span>
                      </div>

                      {/* Created */}
                      <div>
                        <span className="text-xs text-gray-400" data-testid={`text-created-${contact.id}`}>
                          {contact.createdAt
                            ? formatDistanceToNow(new Date(contact.createdAt), { addSuffix: true })
                            : "—"}
                        </span>
                      </div>
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <ContactRowMenu
                          contact={contact}
                          onDelete={(c) => setDeleteTarget({ mode: "single", contact: c })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Contact Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(o) => { setShowAddDialog(o); if (!o) { setAddError(""); setNewContact({ name: "", phone: "", email: "" }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-semibold">
              {t("contacts.addNewContact", "Add New Contact")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>{t("contacts.fieldName", "Name")}</Label>
              <Input
                value={newContact.name}
                onChange={(e) => setNewContact((p) => ({ ...p, name: e.target.value }))}
                placeholder="Contact name"
                data-testid="input-new-contact-name"
              />
            </div>
            <div>
              <Label>{t("contacts.fieldPhone", "Phone")}</Label>
              <Input
                value={newContact.phone}
                onChange={(e) => setNewContact((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+1234567890"
                data-testid="input-new-contact-phone"
              />
            </div>
            <div>
              <Label>{t("contacts.fieldEmail", "Email")}</Label>
              <Input
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact((p) => ({ ...p, email: e.target.value }))}
                placeholder="email@example.com"
                data-testid="input-new-contact-email"
              />
            </div>
            {addError && <p className="text-sm text-red-500">{addError}</p>}
            <Button
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={() => {
                if (!newContact.name.trim()) { setAddError(t("contacts.nameRequired", "Name is required")); return; }
                addMutation.mutate(newContact);
              }}
              disabled={addMutation.isPending}
              data-testid="button-save-new-contact"
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t("contacts.addContact", "Add Contact")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notes Popup */}
      <Dialog open={!!notesContact} onOpenChange={(o) => !o && setNotesContact(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <StickyNote className="w-4 h-4 text-amber-500" />
              {notesContact?.name} — Team Notes
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[420px] space-y-3 pr-1 py-1">
            {notesLoading && (
              <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading notes…</span>
              </div>
            )}
            {!notesLoading && notesList.length === 0 && (
              <div className="py-10 text-center text-gray-400 text-sm">No notes for this contact.</div>
            )}
            {!notesLoading && notesList.map((note: any) => (
              <div key={note.id} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                  <span className="font-semibold text-amber-600">{note.createdByName || "Team member"}</span>
                  {note.createdAt && (
                    <span>· {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Snapshot Dialog */}
      <Dialog open={!!snapshotContact} onOpenChange={(o) => !o && setSnapshotContact(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              Snapshot — {snapshotContact?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 min-h-[80px]">
            {snapshotLoading ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Generating snapshot…</span>
              </div>
            ) : snapshotError ? (
              <p className="text-sm text-red-500">{snapshotError}</p>
            ) : snapshotText ? (
              <p className="text-gray-700 text-sm leading-relaxed">{snapshotText}</p>
            ) : (
              <p className="text-gray-400 text-sm italic">
                No conversation or notes yet — nothing to summarise for this contact.
              </p>
            )}
          </div>
          {snapshotText && (
            <p className="text-xs text-gray-400 border-t pt-3 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-violet-400" />
              AI-generated from recent conversation and team notes
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !deletePending) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-delete-contacts">
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {deleteTarget?.mode === "single"
                ? `Delete ${deleteTarget.contact.name}?`
                : `Delete ${deleteTarget?.ids.length ?? 0} contacts?`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget?.mode === "single"
              ? "This permanently deletes the contact and all conversations and messages. This cannot be undone."
              : "This permanently deletes these contacts and all related conversations and messages. This cannot be undone."}
          </p>
          {deleteExtraWarning ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2" data-testid="contacts-delete-extra-warning">
              {deleteExtraWarning}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deletePending}
              data-testid="button-cancel-delete-contacts"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deletePending}
              data-testid="button-confirm-delete-contacts"
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.mode === "single") {
                  deleteSingleMutation.mutate(deleteTarget.contact);
                } else {
                  deleteBulkMutation.mutate(deleteTarget.ids);
                }
              }}
            >
              {deletePending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {deleteTarget?.mode === "single" ? "Delete Contact" : "Delete selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

