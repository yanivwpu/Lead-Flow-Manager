import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import {
  Zap, Plus, Trash2, Save, MessageSquare, GitBranch,
  Clock, Tag, Loader2, AlertCircle, Crown,
  X, CheckCircle2, Image, Video,
  FileText, ListOrdered, Upload, MoreHorizontal,
  Play, Search, Settings2, Copy,
  ChevronUp, ChevronDown, MousePointer2, ArrowDown
} from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────── */

type MessageType = "text" | "image" | "video" | "file" | "buttons";

export interface ButtonOption {
  label: string;
  value: string;
  nextNodeId?: string;
}

function resolveButton(btn: string | ButtonOption): ButtonOption {
  if (typeof btn === "string") return { label: btn, value: btn };
  return { label: btn.label || btn.value, value: btn.value || btn.label, nextNodeId: btn.nextNodeId };
}

interface ChatbotNode {
  id: string;
  type: "message" | "question" | "condition" | "action" | "delay";
  position: { x: number; y: number };
  data: {
    label: string;
    content?: string;
    messageType?: MessageType;
    mediaUrl?: string;
    mediaCaption?: string;
    fileName?: string;
    buttons?: ButtonOption[];
    options?: { label: string; nextNodeId: string }[];
    condition?: { type: string; value: string };
    action?: { type: string; value: string };
    delayMinutes?: number;
    variableName?: string;
  };
}

interface ChatbotEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface ChatbotFlow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  triggerKeywords: string[];
  triggerOnNewChat: boolean;
  nodes: ChatbotNode[];
  edges: ChatbotEdge[];
  executionCount: number;
  lastExecutedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ─── Constants ──────────────────────────────────────────────────────── */

const STEP_TYPES = [
  {
    type: "message", label: "Send Message", icon: MessageSquare,
    color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100",
    description: "Send a text, image, or file",
  },
  {
    type: "question", label: "Ask Question", icon: GitBranch,
    color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-100",
    description: "Ask with quick-reply options",
  },
  {
    type: "delay", label: "Wait", icon: Clock,
    color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100",
    description: "Pause before continuing",
  },
  {
    type: "action", label: "Action", icon: Tag,
    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100",
    description: "Tag, assign, or move a lead",
  },
];

const MESSAGE_TYPES: { value: MessageType; label: string; icon: any }[] = [
  { value: "text", label: "Text", icon: MessageSquare },
  { value: "image", label: "Image", icon: Image },
  { value: "video", label: "Video", icon: Video },
  { value: "file", label: "File", icon: FileText },
  { value: "buttons", label: "Buttons", icon: ListOrdered },
];

const ACTION_TYPES = [
  { value: "set_tag", label: "Add Tag" },
  { value: "set_status", label: "Set Status" },
  { value: "assign", label: "Assign to Team" },
  { value: "set_pipeline", label: "Move Pipeline Stage" },
];

/* ─── Helpers ────────────────────────────────────────────────────────── */

function stepSummary(node: ChatbotNode): string {
  switch (node.type) {
    case "message":
      if (node.data.messageType === "image") return node.data.mediaCaption ? `📷 ${node.data.mediaCaption}` : "📷 Image";
      if (node.data.messageType === "video") return node.data.mediaCaption ? `🎥 ${node.data.mediaCaption}` : "🎥 Video";
      if (node.data.messageType === "file") return `📎 ${node.data.fileName || "File"}`;
      if (node.data.messageType === "buttons") return node.data.content || "Message with quick-reply buttons";
      return node.data.content || "No message written yet";
    case "question":
      return node.data.content || "No question written yet";
    case "delay": {
      const m = node.data.delayMinutes || 0;
      if (m >= 60 && m % 60 === 0) return `Wait ${m / 60} hour${m / 60 > 1 ? "s" : ""}`;
      if (m >= 1440 && m % 1440 === 0) return `Wait ${m / 1440} day${m / 1440 > 1 ? "s" : ""}`;
      return `Wait ${m} minute${m !== 1 ? "s" : ""}`;
    }
    case "action": {
      const at = ACTION_TYPES.find(a => a.value === node.data.action?.type);
      const val = node.data.action?.value;
      return at ? (val ? `${at.label}: ${val}` : at.label) : "Configure this action";
    }
    default:
      return "";
  }
}

function stepTypeMeta(type: string) {
  return STEP_TYPES.find(s => s.type === type) || STEP_TYPES[0];
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function FileUploadButton({ onUploaded, accept, nodeId, label = "Upload" }: {
  onUploaded: (url: string, fileName: string) => void;
  accept: string; nodeId: string; label?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading, progress } = useUpload({
    onSuccess: (response) => {
      const url = `${window.location.origin}${response.objectPath}`;
      onUploaded(url, response.metadata.name);
    },
  });
  return (
    <div className="flex-shrink-0">
      <input ref={fileInputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadFile(f); e.target.value = ""; } }}
        data-testid={`file-input-${nodeId}`} />
      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
          isUploading ? "bg-gray-50 text-gray-400 border-gray-200 cursor-wait"
            : "bg-white text-brand-green border-brand-green/25 hover:bg-brand-green/5 hover:border-brand-green/40"
        )}
        data-testid={`upload-btn-${nodeId}`}>
        {isUploading
          ? <><Loader2 className="h-3 w-3 animate-spin" />{progress > 0 && progress < 100 ? `${progress}%` : "Uploading…"}</>
          : <><Upload className="h-3 w-3" />{label}</>}
      </button>
    </div>
  );
}

function AddStepPicker({ onAdd, hint }: { onAdd: (type: ChatbotNode["type"]) => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="group flex items-center gap-2 px-4 py-2 rounded-full border border-dashed border-gray-300 bg-white text-xs text-gray-400 hover:border-brand-green hover:text-brand-green hover:bg-brand-green/3 transition-all shadow-sm"
          data-testid="button-add-step"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{hint || "Add step"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1.5 shadow-lg border border-gray-100" align="center" sideOffset={6}>
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 pt-1 pb-1.5">Choose step type</div>
        {STEP_TYPES.map((st) => {
          const Icon = st.icon;
          return (
            <button key={st.type}
              onClick={() => { onAdd(st.type as ChatbotNode["type"]); setOpen(false); }}
              className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left group"
              data-testid={`pick-step-${st.type}`}>
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors", st.bg)}>
                <Icon className={cn("h-3.5 w-3.5", st.color)} />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800">{st.label}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{st.description}</div>
              </div>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

export function ChatbotBuilder() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedFlow, setSelectedFlow] = useState<ChatbotFlow | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDesc, setNewFlowDesc] = useState("");

  /* ── Queries ── */
  const { data: flows = [], isLoading, error } = useQuery<ChatbotFlow[]>({
    queryKey: ["/api/chatbot-flows"],
    retry: false,
  });

  /* ── Mutations ── */
  const createFlowMutation = useMutation({
    mutationFn: async (data: any) => (await apiRequest("POST", "/api/chatbot-flows", data)).json(),
    onSuccess: (flow) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      toast({ title: "Flow created", description: `"${flow.name}" is ready to build.` });
      setSelectedFlow(flow);
      setIsCreating(false);
      setNewFlowName("");
      setNewFlowDesc("");
      setUnsavedChanges(false);
    },
    onError: (e: any) => toast({ title: "Couldn't create flow", description: e.message, variant: "destructive" }),
  });

  const updateFlowMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => (await apiRequest("PATCH", `/api/chatbot-flows/${id}`, data)).json(),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      toast({ title: "Flow saved" });
      setUnsavedChanges(false);
      setSelectedFlow(updated);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteFlowMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/chatbot-flows/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      toast({ title: "Flow deleted" });
      setSelectedFlow(null);
      setSelectedStepId(null);
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const toggleFlowMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      (await apiRequest("PATCH", `/api/chatbot-flows/${id}`, { isActive })).json(),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      if (selectedFlow?.id === updated.id) setSelectedFlow(updated);
      toast({ title: updated.isActive ? "Flow activated" : "Flow set to draft" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const duplicateFlowMutation = useMutation({
    mutationFn: async (flow: ChatbotFlow) => {
      const payload = {
        name: `${flow.name} (Copy)`,
        description: flow.description,
        nodes: flow.nodes,
        edges: flow.edges,
        triggerKeywords: flow.triggerKeywords,
        triggerOnNewChat: flow.triggerOnNewChat,
        isActive: false,
      };
      return (await apiRequest("POST", "/api/chatbot-flows", payload)).json();
    },
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      setSelectedFlow(copy);
      setSelectedStepId(null);
      setUnsavedChanges(false);
      toast({ title: "Flow duplicated", description: `"${copy.name}" created as a draft.` });
    },
    onError: (e: any) => toast({ title: "Duplication failed", description: e.message, variant: "destructive" }),
  });

  /* ── Handlers ── */
  const handleSave = () => {
    if (!selectedFlow) return;
    updateFlowMutation.mutate({
      id: selectedFlow.id,
      name: selectedFlow.name,
      nodes: selectedFlow.nodes,
      edges: selectedFlow.edges,
      triggerKeywords: selectedFlow.triggerKeywords,
      triggerOnNewChat: selectedFlow.triggerOnNewChat,
    });
  };

  const handleCreateFlow = () => {
    if (!newFlowName.trim()) return;
    const startNode: ChatbotNode = {
      id: "start",
      type: "message",
      position: { x: 250, y: 50 },
      data: { label: "Welcome Message", content: "Hello! How can I help you today?" },
    };
    createFlowMutation.mutate({
      name: newFlowName.trim(),
      description: newFlowDesc.trim() || null,
      nodes: [startNode],
      edges: [],
      triggerKeywords: [],
      triggerOnNewChat: false,
    });
  };

  const addStep = (type: ChatbotNode["type"]) => {
    if (!selectedFlow) return;
    const meta = STEP_TYPES.find(s => s.type === type);
    const newNode: ChatbotNode = {
      id: `node_${Date.now()}`,
      type,
      position: { x: 250, y: (selectedFlow.nodes.length + 1) * 120 },
      data: {
        label: meta?.label || type,
        content: type === "message" ? "" : undefined,
        messageType: type === "message" ? "text" : undefined,
        options: type === "question" ? [{ label: "Option 1", nextNodeId: "" }] : undefined,
        delayMinutes: type === "delay" ? 5 : undefined,
        action: type === "action" ? { type: "set_tag", value: "" } : undefined,
      },
    };
    const lastNode = selectedFlow.nodes[selectedFlow.nodes.length - 1];
    const newEdge = lastNode ? { id: `edge_${Date.now()}`, source: lastNode.id, target: newNode.id } : null;
    setSelectedFlow({
      ...selectedFlow,
      nodes: [...selectedFlow.nodes, newNode],
      edges: newEdge ? [...selectedFlow.edges, newEdge] : selectedFlow.edges,
    });
    setSelectedStepId(newNode.id);
    setUnsavedChanges(true);
    toast({ title: "Step added", description: meta?.label });
  };

  const updateStep = (nodeId: string, updates: Partial<ChatbotNode["data"]>) => {
    if (!selectedFlow) return;
    setSelectedFlow({
      ...selectedFlow,
      nodes: selectedFlow.nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n),
    });
    setUnsavedChanges(true);
  };

  const deleteStep = (nodeId: string) => {
    if (!selectedFlow) return;
    setSelectedFlow({
      ...selectedFlow,
      nodes: selectedFlow.nodes.filter(n => n.id !== nodeId),
      edges: selectedFlow.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    });
    if (selectedStepId === nodeId) setSelectedStepId(null);
    setUnsavedChanges(true);
  };

  const moveStep = (nodeId: string, dir: "up" | "down") => {
    if (!selectedFlow) return;
    const idx = selectedFlow.nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) return;
    const ni = dir === "up" ? idx - 1 : idx + 1;
    if (ni < 0 || ni >= selectedFlow.nodes.length) return;
    const nodes = [...selectedFlow.nodes];
    [nodes[idx], nodes[ni]] = [nodes[ni], nodes[idx]];
    setSelectedFlow({ ...selectedFlow, nodes });
    setUnsavedChanges(true);
  };

  const addKeyword = (kw: string) => {
    if (!selectedFlow || !kw.trim()) return;
    const clean = kw.trim().toLowerCase();
    if (selectedFlow.triggerKeywords.includes(clean)) return;
    setSelectedFlow({ ...selectedFlow, triggerKeywords: [...selectedFlow.triggerKeywords, clean] });
    setUnsavedChanges(true);
    toast({ title: "Trigger keyword added" });
  };

  const removeKeyword = (kw: string) => {
    if (!selectedFlow) return;
    setSelectedFlow({ ...selectedFlow, triggerKeywords: selectedFlow.triggerKeywords.filter(k => k !== kw) });
    setUnsavedChanges(true);
  };

  /* ── Derived state ── */
  const selectedStep = selectedFlow?.nodes.find(n => n.id === selectedStepId) || null;
  const filteredFlows = flows.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  /* ── Error states ── */
  if (error) {
    const isPlan = (error as any)?.message?.includes("paid plan") || (error as any)?.status === 403;
    if (isPlan) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <Helmet><title>Flow Builder — Upgrade Required | ChatCRM</title></Helmet>
          <div className="text-center max-w-md">
            <div className="mx-auto h-16 w-16 bg-gradient-to-br from-brand-green to-brand-teal rounded-2xl flex items-center justify-center mb-6">
              <Zap className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Flow Builder</h2>
            <p className="text-gray-500 mb-6">Design automated conversation flows to qualify leads, answer questions, and route conversations — 24/7. Available on Starter and Pro.</p>
            <Link href="/pricing">
              <Button className="bg-brand-green hover:bg-brand-green/90" data-testid="button-upgrade">
                <Crown className="h-4 w-4 mr-2" />View Plans
              </Button>
            </Link>
          </div>
        </div>
      );
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-green" />
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /* Render                                                              */
  /* ─────────────────────────────────────────────────────────────────── */
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f7f8fa]">
      <Helmet>
        <title>Flow Builder | ChatCRM</title>
        <meta name="description" content="Design automated conversation flows across your channels" />
      </Helmet>

      {/* ══ Page Header ════════════════════════════════════════════════ */}
      <header className="bg-white border-b border-gray-200/80 px-5 py-3 flex items-center gap-4 flex-shrink-0 z-10">
        {/* Left: product identity */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 bg-gradient-to-br from-brand-green to-brand-teal rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-gray-400">Flow Builder</span>
            {selectedFlow && (
              <>
                <span className="text-gray-300 text-sm">/</span>
                <input
                  value={selectedFlow.name}
                  onChange={(e) => { setSelectedFlow({ ...selectedFlow, name: e.target.value }); setUnsavedChanges(true); }}
                  className="text-[13px] font-semibold text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 min-w-0 max-w-[200px]"
                  placeholder="Untitled Flow"
                  data-testid="input-flow-name"
                />
              </>
            )}
          </div>
          {selectedFlow && unsavedChanges && (
            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md tracking-wide">
              UNSAVED
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Right: actions */}
        {selectedFlow ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Status toggle */}
            <button
              onClick={() => toggleFlowMutation.mutate({ id: selectedFlow.id, isActive: !selectedFlow.isActive })}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                selectedFlow.isActive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
              )}
              data-testid="button-toggle-status"
            >
              <div className={cn("h-1.5 w-1.5 rounded-full", selectedFlow.isActive ? "bg-emerald-500" : "bg-gray-400")} />
              {selectedFlow.isActive ? "Active" : "Draft"}
            </button>

            <Button variant="outline" size="sm" className="h-8 text-xs font-medium gap-1.5 text-gray-600" data-testid="button-test-flow">
              <Play className="h-3 w-3" />
              Test Flow
            </Button>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={!unsavedChanges || updateFlowMutation.isPending}
              className="h-8 text-xs font-semibold bg-brand-green hover:bg-brand-green/90 gap-1.5"
              data-testid="button-save-flow"
            >
              {updateFlowMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <><Save className="h-3.5 w-3.5" />Save</>
              }
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 border-gray-200" data-testid="button-flow-more">
                  <MoreHorizontal className="h-4 w-4 text-gray-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 shadow-lg border-gray-100">
                <DropdownMenuItem
                  onClick={() => duplicateFlowMutation.mutate(selectedFlow)}
                  disabled={duplicateFlowMutation.isPending}
                  className="text-sm font-medium gap-2"
                  data-testid="menu-duplicate-flow"
                >
                  {duplicateFlowMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                    : <Copy className="h-3.5 w-3.5 text-gray-400" />
                  }
                  Duplicate Flow
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => deleteFlowMutation.mutate(selectedFlow.id)}
                  className="text-sm font-medium gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
                  data-testid="menu-delete-flow"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Flow
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Button
            size="sm"
            onClick={() => setIsCreating(true)}
            className="h-8 text-xs font-semibold bg-brand-green hover:bg-brand-green/90 gap-1.5"
            data-testid="button-new-flow-header"
          >
            <Plus className="h-3.5 w-3.5" />New Flow
          </Button>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ══ Left Sidebar ════════════════════════════════════════════ */}
        <aside className={cn(
          "w-56 bg-white border-r border-gray-200/80 flex flex-col flex-shrink-0",
          selectedFlow ? "hidden md:flex" : "flex"
        )}>
          {/* Sidebar header */}
          <div className="px-3.5 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Your Flows</span>
              <button
                onClick={() => { setIsCreating(true); setSelectedFlow(null); setSelectedStepId(null); }}
                className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-brand-green/8 text-gray-400 hover:text-brand-green transition-colors"
                data-testid="button-new-flow-sidebar"
                title="New Flow"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-300 pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green/40 placeholder-gray-300 transition-all"
                data-testid="input-search-flows"
              />
            </div>
          </div>

          {/* Flow list */}
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
            {filteredFlows.length === 0 && !isCreating && (
              <div className="text-center py-10 px-4">
                <Zap className="h-7 w-7 mx-auto text-gray-200 mb-2.5" />
                <p className="text-xs font-medium text-gray-400 mb-0.5">No flows yet</p>
                <p className="text-[11px] text-gray-300 mb-3">Create your first automated flow</p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="text-[11px] font-semibold text-brand-green hover:underline"
                >
                  + Create flow
                </button>
              </div>
            )}
            {filteredFlows.map((flow) => {
              const isSelected = selectedFlow?.id === flow.id;
              return (
                <button
                  key={flow.id}
                  onClick={() => {
                    setSelectedFlow(flow);
                    setSelectedStepId(null);
                    setIsCreating(false);
                    setUnsavedChanges(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-xl transition-all",
                    isSelected
                      ? "bg-brand-green/8 border border-brand-green/20 shadow-sm"
                      : "hover:bg-gray-50 border border-transparent"
                  )}
                  data-testid={`flow-item-${flow.id}`}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1.5",
                      flow.isActive ? "bg-emerald-400" : "bg-gray-300"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "text-xs font-semibold truncate leading-tight",
                        isSelected ? "text-brand-green" : "text-gray-800"
                      )}>
                        {flow.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-gray-400">{flow.nodes?.length || 0} steps</span>
                        <span className="text-gray-200">·</span>
                        <span className="text-[10px] text-gray-400">{flow.executionCount || 0} runs</span>
                        {flow.isActive && (
                          <span className="text-[10px] font-semibold text-emerald-600">Active</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ══ Center Canvas ════════════════════════════════════════════ */}
        <main className={cn("flex-1 overflow-y-auto", selectedStep ? "border-r border-gray-200/80" : "")}>

          {/* Create flow inline */}
          {isCreating && (
            <div className="max-w-lg mx-auto p-8">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <div className="h-10 w-10 bg-gradient-to-br from-brand-green to-brand-teal rounded-xl flex items-center justify-center mb-4">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <h2 className="text-base font-bold text-gray-900">Create a new flow</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Give it a name to get started. You can always rename it later.</p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Flow name</Label>
                    <Input
                      value={newFlowName}
                      onChange={(e) => setNewFlowName(e.target.value)}
                      placeholder="e.g., Welcome Flow, Lead Qualifier"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleCreateFlow()}
                      className="text-sm"
                      data-testid="input-new-flow-name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                      Description <span className="text-gray-400 font-normal">(optional)</span>
                    </Label>
                    <Textarea
                      value={newFlowDesc}
                      onChange={(e) => setNewFlowDesc(e.target.value)}
                      placeholder="What does this flow do?"
                      className="min-h-[70px] resize-none text-sm"
                      data-testid="input-new-flow-desc"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={handleCreateFlow}
                      disabled={!newFlowName.trim() || createFlowMutation.isPending}
                      className="bg-brand-green hover:bg-brand-green/90 text-sm font-semibold"
                      data-testid="button-confirm-create-flow"
                    >
                      {createFlowMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                      Create Flow
                    </Button>
                    <Button variant="outline" className="text-sm" onClick={() => setIsCreating(false)} data-testid="button-cancel-create">
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Empty: no flow selected */}
          {!isCreating && !selectedFlow && (
            <div className="flex flex-col items-center justify-center min-h-full p-8 text-center">
              <div className="h-14 w-14 bg-white border border-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Zap className="h-6 w-6 text-gray-300" />
              </div>
              <h3 className="text-sm font-bold text-gray-700 mb-1">Select a flow or create one</h3>
              <p className="text-xs text-gray-400 mb-5 max-w-xs">Design automated conversation flows to qualify leads, answer questions, and route contacts.</p>
              <Button
                size="sm"
                onClick={() => setIsCreating(true)}
                className="bg-brand-green hover:bg-brand-green/90 text-xs font-semibold gap-1.5"
                data-testid="button-create-first-flow"
              >
                <Plus className="h-3.5 w-3.5" />New Flow
              </Button>
            </div>
          )}

          {/* Flow editor */}
          {!isCreating && selectedFlow && (
            <div className="max-w-[520px] mx-auto px-4 py-7 space-y-0">

              {/* ── Trigger card ──────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-violet-50/60 to-transparent border-b border-violet-100/60">
                  <div className="h-9 w-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-4 w-4 text-violet-600" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-900">Trigger</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Set when this flow should start</div>
                  </div>
                </div>

                <div className="px-5 py-5 space-y-5">
                  {/* Start on new conversation */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-gray-700">Start on new conversation</div>
                      <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                        Runs when a contact starts a new conversation
                      </div>
                    </div>
                    <Switch
                      checked={selectedFlow.triggerOnNewChat}
                      onCheckedChange={(checked) => {
                        setSelectedFlow({ ...selectedFlow, triggerOnNewChat: checked });
                        setUnsavedChanges(true);
                        toast({ title: checked ? "Trigger enabled" : "Trigger disabled" });
                      }}
                      data-testid="switch-trigger-new-chat"
                    />
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-gray-100" />

                  {/* Keywords */}
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-2">Keyword triggers</div>
                    {selectedFlow.triggerKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {selectedFlow.triggerKeywords.map((kw) => (
                          <span
                            key={kw}
                            className="flex items-center gap-1 px-2.5 py-1 bg-violet-50 border border-violet-100 text-violet-700 rounded-full text-[11px] font-semibold"
                            data-testid={`keyword-chip-${kw}`}
                          >
                            {kw}
                            <button
                              onClick={() => removeKeyword(kw)}
                              className="text-violet-300 hover:text-violet-600 transition-colors ml-0.5"
                              data-testid={`remove-keyword-${kw}`}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            addKeyword(keywordInput);
                            setKeywordInput("");
                          }
                        }}
                        placeholder="Type keyword and press Enter…"
                        className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green/40 transition-all"
                        data-testid="input-trigger-keywords"
                      />
                      <button
                        onClick={() => { addKeyword(keywordInput); setKeywordInput(""); }}
                        disabled={!keywordInput.trim()}
                        className="px-3 py-2 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                        data-testid="button-add-keyword"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Trigger status banner */}
                  {(() => {
                    const hasKw = selectedFlow.triggerKeywords.length > 0;
                    const newChat = selectedFlow.triggerOnNewChat;
                    if (!hasKw && !newChat) return (
                      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700" data-testid="trigger-summary-warning">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>No trigger set. Add a keyword or enable "Start on new conversation" so this flow can run.</span>
                      </div>
                    );
                    if (hasKw && newChat) return (
                      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-700" data-testid="trigger-summary-both">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>This flow runs when a new conversation starts <strong>or</strong> when a message matches a keyword — whichever comes first.</span>
                      </div>
                    );
                    if (newChat) return (
                      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700" data-testid="trigger-summary-newchat">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>This flow runs on <strong>every new conversation.</strong></span>
                      </div>
                    );
                    return (
                      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700" data-testid="trigger-summary-keywords">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>This flow runs when a message matches one of the trigger keywords.</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── Flow path ──────────────────────────────────────── */}
              <div className="flex flex-col items-center py-3 gap-0">
                <div className="w-px h-5 bg-gray-200" />
                <ArrowDown className="h-3.5 w-3.5 text-gray-300" />
              </div>

              {/* Empty flow state */}
              {selectedFlow.nodes.length === 0 && (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center shadow-sm">
                  <MousePointer2 className="h-8 w-8 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm font-bold text-gray-500 mb-1">Start building your flow</p>
                  <p className="text-xs text-gray-400 mb-5">Add your first step to design the conversation path.</p>
                  <AddStepPicker onAdd={addStep} hint="Add first step" />
                </div>
              )}

              {/* Steps */}
              {selectedFlow.nodes.map((node, index) => {
                const meta = stepTypeMeta(node.type);
                const Icon = meta.icon;
                const isSelected = selectedStepId === node.id;
                const summary = stepSummary(node);

                return (
                  <div key={node.id} className="flex flex-col items-center">
                    {/* Step card */}
                    <div
                      onClick={() => setSelectedStepId(isSelected ? null : node.id)}
                      className={cn(
                        "w-full bg-white rounded-2xl border shadow-sm cursor-pointer transition-all group select-none",
                        isSelected
                          ? "border-brand-green ring-2 ring-brand-green/15 shadow-brand-green/10"
                          : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                      )}
                      data-testid={`step-${node.id}`}
                    >
                      <div className="flex items-center gap-3.5 px-4 py-3.5">
                        {/* Icon */}
                        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0", meta.bg)}>
                          <Icon className={cn("h-4 w-4", meta.color)} />
                        </div>

                        {/* Content hierarchy */}
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide leading-none mb-0.5">
                            {meta.label}
                          </div>
                          <div className="text-sm font-semibold text-gray-800 truncate leading-snug">
                            {node.data.label}
                          </div>
                          {summary && (
                            <div className="text-xs text-gray-400 truncate mt-0.5 leading-snug">{summary}</div>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); moveStep(node.id, "up"); }} disabled={index === 0}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-20 transition-colors">
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); moveStep(node.id, "down"); }} disabled={index === selectedFlow.nodes.length - 1}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-20 transition-colors">
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                                data-testid={`step-more-${node.id}`}>
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 shadow-lg border-gray-100">
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); deleteStep(node.id); }}
                                className="text-xs font-medium gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
                                data-testid={`delete-step-${node.id}`}>
                                <Trash2 className="h-3 w-3" />Delete step
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <Settings2 className={cn(
                          "h-3.5 w-3.5 flex-shrink-0 ml-1 transition-colors",
                          isSelected ? "text-brand-green" : "text-gray-200 group-hover:text-gray-400"
                        )} />
                      </div>
                    </div>

                    {/* Connector + Add Step */}
                    <div className="flex flex-col items-center py-2 gap-0">
                      <div className="w-px h-4 bg-gray-200" />
                      <AddStepPicker
                        onAdd={addStep}
                        hint={index < selectedFlow.nodes.length - 1 ? "Add step" : "Continue the flow"}
                      />
                      {index < selectedFlow.nodes.length - 1 && (
                        <div className="w-px h-4 bg-gray-200" />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* End of flow */}
              {selectedFlow.nodes.length > 0 && (
                <div className="flex justify-center pb-10 pt-2">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 shadow-sm text-xs text-gray-400 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 text-gray-300" />
                    Flow ends here
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* ══ Right Inspector Panel ════════════════════════════════════ */}
        {selectedStep && selectedFlow && (
          <aside className="w-[300px] bg-white border-l border-gray-200/80 flex flex-col flex-shrink-0 overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 bg-gray-50/50">
              {(() => {
                const meta = stepTypeMeta(selectedStep.type);
                const Icon = meta.icon;
                return (
                  <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0", meta.bg)}>
                    <Icon className={cn("h-3.5 w-3.5", meta.color)} />
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {stepTypeMeta(selectedStep.type).label}
                </div>
                <input
                  value={selectedStep.data.label}
                  onChange={(e) => updateStep(selectedStep.id, { label: e.target.value })}
                  className="text-xs font-semibold text-gray-800 bg-transparent border-0 focus:outline-none w-full p-0 mt-0.5"
                  data-testid="input-step-label"
                />
              </div>
              <button
                onClick={() => setSelectedStepId(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors flex-shrink-0"
                data-testid="button-close-panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              {/* ── SEND MESSAGE ── */}
              {selectedStep.type === "message" && (
                <>
                  {/* Type switcher */}
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Message type</div>
                    <div className="flex flex-wrap gap-1">
                      {MESSAGE_TYPES.map((mt) => {
                        const Icon = mt.icon;
                        const active = (selectedStep.data.messageType || "text") === mt.value;
                        return (
                          <button key={mt.value}
                            onClick={() => updateStep(selectedStep.id, {
                              messageType: mt.value,
                              ...(mt.value === "text" ? { mediaUrl: undefined, mediaCaption: undefined, fileName: undefined, buttons: undefined } : {}),
                              ...(mt.value === "buttons" && !selectedStep.data.buttons ? { buttons: [{ label: "Option 1", value: "option_1" }] as ButtonOption[] } : {}),
                            })}
                            className={cn(
                              "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all border",
                              active ? "bg-brand-green text-white border-brand-green shadow-sm"
                                : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                            )}
                            data-testid={`msg-type-${mt.value}-${selectedStep.id}`}>
                            <Icon className="h-3 w-3" />{mt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Text */}
                  {(selectedStep.data.messageType || "text") === "text" && (
                    <div>
                      <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Message</Label>
                      <Textarea
                        value={selectedStep.data.content || ""}
                        onChange={(e) => updateStep(selectedStep.id, { content: e.target.value })}
                        placeholder="Type your message here…"
                        className="min-h-[110px] text-sm resize-none border-gray-200 focus:ring-brand-green/20"
                        data-testid={`input-message-${selectedStep.id}`}
                      />
                    </div>
                  )}

                  {/* Image / Video */}
                  {(selectedStep.data.messageType === "image" || selectedStep.data.messageType === "video") && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                          {selectedStep.data.messageType === "image" ? "Image" : "Video"}
                        </Label>
                        <div className="flex gap-2 mb-2">
                          <Input value={selectedStep.data.mediaUrl || ""} onChange={(e) => updateStep(selectedStep.id, { mediaUrl: e.target.value })}
                            placeholder="Paste URL…" className="text-sm flex-1 border-gray-200" data-testid={`input-media-url-${selectedStep.id}`} />
                          <FileUploadButton nodeId={`media-${selectedStep.id}`}
                            accept={selectedStep.data.messageType === "image" ? "image/*" : "video/*"}
                            label={selectedStep.data.mediaUrl ? "Replace" : "Upload"}
                            onUploaded={(url) => updateStep(selectedStep.id, { mediaUrl: url })} />
                        </div>
                        {selectedStep.data.mediaUrl && selectedStep.data.messageType === "image" && (
                          <div className="rounded-xl overflow-hidden border border-gray-100 max-h-28 bg-gray-50">
                            <img src={selectedStep.data.mediaUrl} alt="Preview" className="w-full object-cover max-h-28"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        )}
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                          Caption <span className="normal-case font-normal text-gray-300">(optional)</span>
                        </Label>
                        <Textarea value={selectedStep.data.mediaCaption || ""} onChange={(e) => updateStep(selectedStep.id, { mediaCaption: e.target.value })}
                          placeholder="Add a caption…" className="min-h-[60px] text-sm resize-none border-gray-200" data-testid={`input-media-caption-${selectedStep.id}`} />
                      </div>
                    </div>
                  )}

                  {/* File */}
                  {selectedStep.data.messageType === "file" && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">File</Label>
                        <div className="flex gap-2 mb-2">
                          <Input value={selectedStep.data.mediaUrl || ""} onChange={(e) => updateStep(selectedStep.id, { mediaUrl: e.target.value })}
                            placeholder="Paste URL…" className="text-sm flex-1 border-gray-200" data-testid={`input-file-url-${selectedStep.id}`} />
                          <FileUploadButton nodeId={`file-${selectedStep.id}`} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                            label={selectedStep.data.mediaUrl ? "Replace" : "Upload"}
                            onUploaded={(url, fileName) => updateStep(selectedStep.id, { mediaUrl: url, fileName })} />
                        </div>
                        {selectedStep.data.mediaUrl && (
                          <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                            <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="text-xs text-gray-600 truncate">{selectedStep.data.fileName || "Uploaded file"}</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                          File name <span className="normal-case font-normal text-gray-300">(optional)</span>
                        </Label>
                        <Input value={selectedStep.data.fileName || ""} onChange={(e) => updateStep(selectedStep.id, { fileName: e.target.value })}
                          placeholder="e.g., Price List.pdf" className="text-sm border-gray-200" data-testid={`input-file-name-${selectedStep.id}`} />
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                          Message <span className="normal-case font-normal text-gray-300">(optional)</span>
                        </Label>
                        <Textarea value={selectedStep.data.content || ""} onChange={(e) => updateStep(selectedStep.id, { content: e.target.value })}
                          placeholder="Here's the file you requested…" className="min-h-[60px] text-sm resize-none border-gray-200" data-testid={`input-file-message-${selectedStep.id}`} />
                      </div>
                    </div>
                  )}

                  {/* Buttons */}
                  {selectedStep.data.messageType === "buttons" && (() => {
                    const rawBtns = selectedStep.data.buttons || [];
                    const buttons: ButtonOption[] = rawBtns.map(b => resolveButton(b as any));
                    const otherNodes = selectedFlow.nodes.filter(n => n.id !== selectedStep.id);
                    return (
                      <div className="space-y-4">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 space-y-1.5">
                          <p className="font-bold text-slate-700 mb-1">Channel support</p>
                          <p>✅ Full — WhatsApp (Meta), WebChat</p>
                          <p>〜 Partial — WhatsApp (Twilio), sent as numbered list</p>
                          <p>✖ Text only — Instagram, Facebook, Telegram, SMS</p>
                        </div>
                        {buttons.length > 3 && (
                          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-100 text-[11px] text-amber-700">
                            ⚠️ WhatsApp supports max 3 buttons.
                          </div>
                        )}
                        <div>
                          <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Prompt message</Label>
                          <Textarea value={selectedStep.data.content || ""} onChange={(e) => updateStep(selectedStep.id, { content: e.target.value })}
                            placeholder="Choose an option below:" className="min-h-[60px] text-sm resize-none border-gray-200" data-testid={`input-buttons-message-${selectedStep.id}`} />
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                            Buttons <span className="normal-case font-normal text-gray-300">(max 3)</span>
                          </Label>
                          <div className="space-y-2">
                            {buttons.map((btn, bi) => (
                              <div key={bi} className="p-3 rounded-xl border border-gray-200 bg-gray-50 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Button {bi + 1}</span>
                                  <button onClick={() => { const nb = buttons.filter((_, i) => i !== bi); updateStep(selectedStep.id, { buttons: nb }); }}
                                    className="text-gray-300 hover:text-red-500 transition-colors" data-testid={`delete-button-${selectedStep.id}-${bi}`}>
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <Input value={btn.label} onChange={(e) => {
                                  const nb = [...buttons]; const label = e.target.value;
                                  const autoVal = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").substring(0, 64);
                                  nb[bi] = { ...nb[bi], label, value: autoVal || label };
                                  updateStep(selectedStep.id, { buttons: nb });
                                }} placeholder={`Button ${bi + 1} label`} maxLength={20} className="text-sm h-8 border-gray-200" data-testid={`input-button-label-${selectedStep.id}-${bi}`} />
                                {otherNodes.length > 0 && (
                                  <Select value={btn.nextNodeId || "__none__"} onValueChange={(val) => {
                                    const nb = [...buttons]; nb[bi] = { ...nb[bi], nextNodeId: val === "__none__" ? undefined : val };
                                    updateStep(selectedStep.id, { buttons: nb });
                                  }}>
                                    <SelectTrigger className="h-8 text-xs border-gray-200" data-testid={`select-nextstep-${selectedStep.id}-${bi}`}>
                                      <SelectValue placeholder="Next step (optional)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">End flow</SelectItem>
                                      {otherNodes.map(n => <SelectItem key={n.id} value={n.id}>{n.data.label || n.id}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            ))}
                            {buttons.length < 3 && (
                              <button onClick={() => {
                                const idx = buttons.length + 1;
                                updateStep(selectedStep.id, { buttons: [...buttons, { label: `Option ${idx}`, value: `option_${idx}` }] });
                              }} className="w-full py-2.5 rounded-xl border border-dashed border-gray-200 text-[11px] font-semibold text-gray-400 hover:border-brand-green hover:text-brand-green transition-colors flex items-center justify-center gap-1"
                                data-testid={`add-button-${selectedStep.id}`}>
                                <Plus className="h-3 w-3" />Add button
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {/* ── ASK QUESTION ── */}
              {selectedStep.type === "question" && (
                <>
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Question</Label>
                    <Textarea value={selectedStep.data.content || ""} onChange={(e) => updateStep(selectedStep.id, { content: e.target.value })}
                      placeholder="Enter your question…" className="min-h-[90px] text-sm resize-none border-gray-200" data-testid={`input-question-${selectedStep.id}`} />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                      Save answer as <span className="normal-case font-normal text-gray-300">(optional)</span>
                    </Label>
                    <Input value={selectedStep.data.variableName || ""} onChange={(e) => updateStep(selectedStep.id, { variableName: e.target.value })}
                      placeholder="e.g., customer_name" className="text-sm border-gray-200" data-testid={`input-variable-${selectedStep.id}`} />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Quick reply options</Label>
                    <div className="space-y-2">
                      {(selectedStep.data.options || []).map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <Input value={opt.label} onChange={(e) => {
                            const opts = [...(selectedStep.data.options || [])];
                            opts[oi] = { ...opts[oi], label: e.target.value };
                            updateStep(selectedStep.id, { options: opts });
                          }} placeholder={`Option ${oi + 1}`} className="text-sm flex-1 border-gray-200" data-testid={`input-option-${selectedStep.id}-${oi}`} />
                          <button onClick={() => {
                            const opts = (selectedStep.data.options || []).filter((_, i) => i !== oi);
                            updateStep(selectedStep.id, { options: opts });
                          }} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => {
                        const opts = [...(selectedStep.data.options || []), { label: "", nextNodeId: "" }];
                        updateStep(selectedStep.id, { options: opts });
                      }} className="w-full py-2.5 rounded-xl border border-dashed border-gray-200 text-[11px] font-semibold text-gray-400 hover:border-brand-green hover:text-brand-green transition-colors flex items-center justify-center gap-1"
                        data-testid={`add-option-${selectedStep.id}`}>
                        <Plus className="h-3 w-3" />Add option
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* ── WAIT ── */}
              {selectedStep.type === "delay" && (
                <div>
                  <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Delay duration</Label>
                  <div className="flex items-center gap-3">
                    <Input type="number" value={selectedStep.data.delayMinutes || 0}
                      onChange={(e) => updateStep(selectedStep.id, { delayMinutes: parseInt(e.target.value) || 0 })}
                      min={0} className="text-sm w-24 border-gray-200" data-testid={`input-delay-${selectedStep.id}`} />
                    <span className="text-sm text-gray-500 font-medium">minutes</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">The flow will pause before continuing to the next step.</p>
                </div>
              )}

              {/* ── ACTION ── */}
              {selectedStep.type === "action" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Action type</Label>
                    <Select value={selectedStep.data.action?.type || "set_tag"}
                      onValueChange={(val) => updateStep(selectedStep.id, { action: { type: val, value: selectedStep.data.action?.value || "" } })}>
                      <SelectTrigger className="text-sm border-gray-200 bg-gray-50" data-testid={`select-action-type-${selectedStep.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Value</Label>
                    <Input value={selectedStep.data.action?.value || ""}
                      onChange={(e) => updateStep(selectedStep.id, { action: { type: selectedStep.data.action?.type || "set_tag", value: e.target.value } })}
                      placeholder="Enter value…" className="text-sm border-gray-200" data-testid={`input-action-value-${selectedStep.id}`} />
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
