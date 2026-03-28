import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Search, UserPlus, MessageCircle, Instagram, Facebook, Smartphone, Globe, Send,
  ChevronUp, ChevronDown, ChevronsUpDown, X, Users, Phone, Mail,
  ArrowUpRight, RefreshCw, Download, StickyNote, Sparkles, Loader2, NotebookPen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

type Channel = "whatsapp" | "instagram" | "facebook" | "sms" | "webchat" | "telegram";

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
  source?: string;
  assignedTo?: string;
  followUpDate?: string;
  notes?: string;
  createdAt: string;
  whatsappId?: string;
  instagramId?: string;
  facebookId?: string;
  telegramId?: string;
}

const CHANNEL_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  whatsapp: { icon: MessageCircle, color: "#25D366", label: "WhatsApp" },
  instagram: { icon: Instagram, color: "#E4405F", label: "Instagram" },
  facebook: { icon: Facebook, color: "#1877F2", label: "Messenger" },
  sms: { icon: Smartphone, color: "#6B7280", label: "SMS" },
  webchat: { icon: Globe, color: "#3B82F6", label: "Web Chat" },
  telegram: { icon: Send, color: "#0088CC", label: "Telegram" },
};

const TAG_COLORS: Record<string, string> = {
  Hot: "bg-red-100 text-red-700 border-red-200",
  Warm: "bg-orange-100 text-orange-700 border-orange-200",
  Cold: "bg-blue-100 text-blue-700 border-blue-200",
  New: "bg-gray-100 text-gray-700 border-gray-200",
  Quoted: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Paid: "bg-green-100 text-green-700 border-green-200",
  Investor: "bg-purple-100 text-purple-700 border-purple-200",
  Buyer: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Seller: "bg-pink-100 text-pink-700 border-pink-200",
};

function getTagColor(tag: string) {
  return TAG_COLORS[tag] || "bg-gray-100 text-gray-600 border-gray-200";
}

function ChannelIcon({ channel, size = "w-3.5 h-3.5" }: { channel: string; size?: string }) {
  const cfg = CHANNEL_CONFIG[channel] || CHANNEL_CONFIG.whatsapp;
  const Icon = cfg.icon;
  return <Icon className={size} style={{ color: cfg.color }} />;
}

function Avatar({ contact }: { contact: Contact }) {
  const ch = contact.primaryChannelOverride || contact.primaryChannel;
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
        active ? "text-indigo-600" : "text-gray-500 hover:text-gray-700",
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

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm min-w-0">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", color)}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-900 leading-none">{value.toLocaleString()}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
}

export function Contacts() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState<string>("");
  const [filterChannel, setFilterChannel] = useState<string>("");
  const [filterStage, setFilterStage] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", phone: "", email: "" });
  const [addError, setAddError] = useState("");

  const [notesContact, setNotesContact] = useState<Contact | null>(null);
  const [snapshotContact, setSnapshotContact] = useState<Contact | null>(null);
  const [snapshotText, setSnapshotText] = useState<string>("");
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState("");

  const { data: contacts = [], isLoading, refetch } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      const res = await fetch("/api/contacts?limit=5000", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

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

  const allTags = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => { if (c.tag) s.add(c.tag); });
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
      list = list.filter((c) => {
        const ch = c.primaryChannelOverride || c.primaryChannel;
        return ch === filterChannel;
      });
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

  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    contacts.forEach((c) => {
      const ch = c.primaryChannelOverride || c.primaryChannel;
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

  function openNotes(contact: Contact, e: React.MouseEvent) {
    e.stopPropagation();
    setNotesContact(contact);
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
      ["Name", "Phone", "Email", "Tag", "Pipeline Stage", "Channel", "Created"],
      ...filtered.map((c) => [
        c.name, c.phone || "", c.email || "", c.tag, c.pipelineStage,
        c.primaryChannelOverride || c.primaryChannel,
        c.createdAt ? format(new Date(c.createdAt), "yyyy-MM-dd") : "",
      ]),
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
            <Button
              size="sm"
              onClick={() => setShowAddDialog(true)}
              data-testid="button-add-contact"
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <UserPlus className="w-4 h-4" />
              {t("contacts.addContact", "Add Contact")}
            </Button>
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
              color="bg-indigo-500"
            />
            {topChannels.map(([ch, count]) => {
              const cfg = CHANNEL_CONFIG[ch] || CHANNEL_CONFIG.whatsapp;
              const Icon = cfg.icon;
              return (
                <div
                  key={ch}
                  onClick={() => setFilterChannel(filterChannel === ch ? "" : ch)}
                  className={cn(
                    "flex items-center gap-3 bg-white rounded-xl border px-4 py-3 shadow-sm cursor-pointer transition-all",
                    filterChannel === ch
                      ? "border-indigo-300 ring-2 ring-indigo-100"
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
                <Badge className="ml-0.5 bg-indigo-100 text-indigo-700 text-xs px-1.5 py-0 h-4">
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

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
              <SortHeader label={t("contacts.colName", "Contact")} field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label={t("contacts.colTag", "Tag")} field="tag" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label={t("contacts.colStage", "Stage")} field="pipelineStage" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {t("contacts.colChannel", "Channel")}
              </span>
              <SortHeader label={t("contacts.colAdded", "Added")} field="createdAt" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
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
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-3 text-indigo-600">
                    {t("contacts.clearFilters", "Clear filters")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map((contact) => {
                  const ch = contact.primaryChannelOverride || contact.primaryChannel;
                  const cfg = CHANNEL_CONFIG[ch] || CHANNEL_CONFIG.whatsapp;
                  return (
                    <div
                      key={contact.id}
                      onClick={() => navigate(`/app/inbox/${contact.id}`)}
                      className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 items-center hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                      data-testid={`row-contact-${contact.id}`}
                    >
                      {/* Name + phone */}
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar contact={contact} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-gray-900 text-sm truncate group-hover:text-indigo-700 transition-colors">
                              {contact.name}
                            </p>
                            <button
                              onClick={(e) => openNotes(contact, e)}
                              title="View notes"
                              data-testid={`btn-notes-${contact.id}`}
                              className="flex-shrink-0 text-amber-400 hover:text-amber-600 transition-colors"
                            >
                              <StickyNote className="w-3.5 h-3.5" />
                            </button>
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
                        <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </div>

                      {/* Tag */}
                      <div>
                        {contact.tag ? (
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                            getTagColor(contact.tag),
                          )} data-testid={`badge-tag-${contact.id}`}>
                            {contact.tag}
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Contact Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("contacts.addContact", "Add Contact")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">{t("contacts.fieldName", "Name")} *</Label>
              <Input
                id="contact-name"
                value={newContact.name}
                onChange={(e) => setNewContact((p) => ({ ...p, name: e.target.value }))}
                placeholder={t("contacts.namePlaceholder", "Full name")}
                data-testid="input-new-contact-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">{t("contacts.fieldPhone", "Phone")}</Label>
              <Input
                id="contact-phone"
                value={newContact.phone}
                onChange={(e) => setNewContact((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+1 234 567 8900"
                data-testid="input-new-contact-phone"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">{t("contacts.fieldEmail", "Email")}</Label>
              <Input
                id="contact-email"
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact((p) => ({ ...p, email: e.target.value }))}
                placeholder="name@example.com"
                data-testid="input-new-contact-email"
              />
            </div>
            {addError && (
              <p className="text-sm text-red-600">{addError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="button-cancel-add-contact">
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!newContact.name.trim()) { setAddError(t("contacts.nameRequired", "Name is required")); return; }
                addMutation.mutate(newContact);
              }}
              disabled={addMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              data-testid="button-save-new-contact"
            >
              {addMutation.isPending ? t("common.saving", "Saving…") : t("contacts.saveAndOpen", "Save & Open")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={!!notesContact} onOpenChange={(o) => !o && setNotesContact(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NotebookPen className="w-4 h-4 text-amber-500" />
              {notesContact?.name} — Notes
            </DialogTitle>
          </DialogHeader>
          <NotesContent contactId={notesContact?.id} contactNotes={notesContact?.notes} />
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
    </div>
  );
}

function NotesContent({ contactId, contactNotes }: { contactId?: string; contactNotes?: string }) {
  const { data: notes, isLoading } = useQuery<any[]>({
    queryKey: ["/api/contacts", contactId, "notes"],
    queryFn: async () => {
      if (!contactId) return [];
      const res = await fetch(`/api/contacts/${contactId}/notes`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!contactId,
  });

  const hasContactNotes = contactNotes && contactNotes.trim().length > 0;
  const hasTeamNotes = notes && notes.length > 0;
  const hasAnything = hasContactNotes || hasTeamNotes;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading notes…</span>
      </div>
    );
  }

  if (!hasAnything) {
    return (
      <div className="py-8 text-center">
        <StickyNote className="w-8 h-8 text-gray-200 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">No notes yet for this contact.</p>
        <p className="text-gray-300 text-xs mt-1">Open the conversation to add a note.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto py-1 pr-1">
      {hasContactNotes && (
        <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2.5">
          <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-1.5">Contact Notes</p>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{contactNotes}</p>
        </div>
      )}
      {hasTeamNotes && (
        <>
          {hasContactNotes && (
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Team Notes</p>
          )}
          {notes!.map((note: any) => (
            <div key={note.id} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{note.content}</p>
              <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                <span className="font-medium text-amber-600">{note.createdByName || "Team member"}</span>
                {note.createdAt && (
                  <span>· {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}</span>
                )}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
