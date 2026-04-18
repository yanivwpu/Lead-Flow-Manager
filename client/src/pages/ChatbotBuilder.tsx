import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import {
  Zap, Plus, Trash2, Save, MessageSquare, GitBranch,
  Clock, Tag, Loader2, AlertCircle, Crown,
  X, CheckCircle2, ChevronLeft, Image, Video,
  FileText, ListOrdered, Upload, MoreHorizontal,
  Play, Search, ArrowDown, Settings2, Copy,
  ChevronUp, ChevronDown, MousePointer2
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

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

const STEP_TYPES = [
  { type: "message", label: "Send Message", icon: MessageSquare, color: "text-blue-500", bg: "bg-blue-50", border: "border-blue-100", description: "Send a text, image, or file" },
  { type: "question", label: "Ask Question", icon: GitBranch, color: "text-purple-500", bg: "bg-purple-50", border: "border-purple-100", description: "Ask with quick-reply options" },
  { type: "delay", label: "Wait", icon: Clock, color: "text-amber-500", bg: "bg-amber-50", border: "border-amber-100", description: "Pause before the next step" },
  { type: "action", label: "Action", icon: Tag, color: "text-emerald-500", bg: "bg-emerald-50", border: "border-emerald-100", description: "Tag, assign, or move a lead" },
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

function stepPreview(node: ChatbotNode): string {
  switch (node.type) {
    case "message":
      if (node.data.messageType === "image") return "📷 Image" + (node.data.mediaCaption ? ` — ${node.data.mediaCaption}` : "");
      if (node.data.messageType === "video") return "🎥 Video" + (node.data.mediaCaption ? ` — ${node.data.mediaCaption}` : "");
      if (node.data.messageType === "file") return `📎 ${node.data.fileName || "File"}`;
      if (node.data.messageType === "buttons") return node.data.content || "Message with buttons";
      return node.data.content || "No message set";
    case "question":
      return node.data.content || "No question set";
    case "delay":
      return `Wait ${node.data.delayMinutes || 0} min`;
    case "action":
      const at = ACTION_TYPES.find(a => a.value === node.data.action?.type);
      return at ? `${at.label}: ${node.data.action?.value || "—"}` : "Configure action";
    default:
      return "";
  }
}

function FileUploadButton({
  onUploaded, accept, nodeId, label = "Upload"
}: {
  onUploaded: (url: string, fileName: string) => void;
  accept: string;
  nodeId: string;
  label?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading, progress } = useUpload({
    onSuccess: (response) => {
      const absoluteUrl = `${window.location.origin}${response.objectPath}`;
      onUploaded(absoluteUrl, response.metadata.name);
    },
  });

  return (
    <div className="flex-shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { uploadFile(file); e.target.value = ""; }
        }}
        data-testid={`file-input-${nodeId}`}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
          isUploading
            ? "bg-gray-50 text-gray-400 border-gray-200 cursor-wait"
            : "bg-white text-brand-green border-brand-green/30 hover:bg-brand-green/5"
        )}
        data-testid={`upload-btn-${nodeId}`}
      >
        {isUploading ? (
          <><Loader2 className="h-3 w-3 animate-spin" />{progress > 0 && progress < 100 ? `${progress}%` : "Uploading…"}</>
        ) : (
          <><Upload className="h-3 w-3" />{label}</>
        )}
      </button>
    </div>
  );
}

function AddStepPicker({ onAdd }: { onAdd: (type: ChatbotNode["type"]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-gray-300 text-xs text-gray-500 hover:border-brand-green hover:text-brand-green transition-colors bg-white shadow-sm"
          data-testid="button-add-step"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Step
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="center">
        {STEP_TYPES.map((st) => {
          const Icon = st.icon;
          return (
            <button
              key={st.type}
              onClick={() => { onAdd(st.type as ChatbotNode["type"]); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
              data-testid={`pick-step-${st.type}`}
            >
              <div className={cn("h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0", st.bg)}>
                <Icon className={cn("h-3.5 w-3.5", st.color)} />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-800">{st.label}</div>
                <div className="text-xs text-gray-400">{st.description}</div>
              </div>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

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

  const { data: flows = [], isLoading, error } = useQuery<ChatbotFlow[]>({
    queryKey: ["/api/chatbot-flows"],
    retry: false,
  });

  const createFlowMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/chatbot-flows", data);
      return res.json();
    },
    onSuccess: (flow) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      toast({ title: "Flow created" });
      setSelectedFlow(flow);
      setIsCreating(false);
      setNewFlowName("");
      setNewFlowDesc("");
      setUnsavedChanges(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateFlowMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/chatbot-flows/${id}`, data);
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      toast({ title: "Flow saved" });
      setUnsavedChanges(false);
      setSelectedFlow(updated);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteFlowMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/chatbot-flows/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      toast({ title: "Flow deleted" });
      setSelectedFlow(null);
      setSelectedStepId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleFlowMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/chatbot-flows/${id}`, { isActive });
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      if (selectedFlow?.id === updated.id) setSelectedFlow(updated);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!selectedFlow) return;
    updateFlowMutation.mutate({
      id: selectedFlow.id,
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
    const newNode: ChatbotNode = {
      id: `node_${Date.now()}`,
      type,
      position: { x: 250, y: (selectedFlow.nodes.length + 1) * 120 },
      data: {
        label: STEP_TYPES.find(s => s.type === type)?.label || type,
        content: type === "message" ? "" : undefined,
        messageType: type === "message" ? "text" : undefined,
        options: type === "question" ? [{ label: "Option 1", nextNodeId: "" }] : undefined,
        delayMinutes: type === "delay" ? 5 : undefined,
        action: type === "action" ? { type: "set_tag", value: "" } : undefined,
      },
    };
    const lastNode = selectedFlow.nodes[selectedFlow.nodes.length - 1];
    const newEdge: ChatbotEdge | null = lastNode ? {
      id: `edge_${Date.now()}`, source: lastNode.id, target: newNode.id,
    } : null;
    setSelectedFlow({
      ...selectedFlow,
      nodes: [...selectedFlow.nodes, newNode],
      edges: newEdge ? [...selectedFlow.edges, newEdge] : selectedFlow.edges,
    });
    setSelectedStepId(newNode.id);
    setUnsavedChanges(true);
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

  const duplicateStep = (nodeId: string) => {
    if (!selectedFlow) return;
    const node = selectedFlow.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const idx = selectedFlow.nodes.findIndex(n => n.id === nodeId);
    const clone: ChatbotNode = { ...node, id: `node_${Date.now()}`, data: { ...node.data } };
    const nodes = [...selectedFlow.nodes];
    nodes.splice(idx + 1, 0, clone);
    const lastBefore = nodes[idx];
    const newEdge: ChatbotEdge = { id: `edge_${Date.now()}`, source: lastBefore.id, target: clone.id };
    setSelectedFlow({ ...selectedFlow, nodes, edges: [...selectedFlow.edges, newEdge] });
    setUnsavedChanges(true);
  };

  const addKeyword = (kw: string) => {
    if (!selectedFlow || !kw.trim()) return;
    const clean = kw.trim().toLowerCase();
    if (selectedFlow.triggerKeywords.includes(clean)) return;
    setSelectedFlow({ ...selectedFlow, triggerKeywords: [...selectedFlow.triggerKeywords, clean] });
    setUnsavedChanges(true);
  };

  const removeKeyword = (kw: string) => {
    if (!selectedFlow) return;
    setSelectedFlow({ ...selectedFlow, triggerKeywords: selectedFlow.triggerKeywords.filter(k => k !== kw) });
    setUnsavedChanges(true);
  };

  const selectedStep = selectedFlow?.nodes.find(n => n.id === selectedStepId) || null;
  const filteredFlows = flows.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (error) {
    const isPlanRestriction = (error as any)?.message?.includes("paid plan") || (error as any)?.status === 403;
    if (isPlanRestriction) {
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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50">
      <Helmet>
        <title>Flow Builder | ChatCRM</title>
        <meta name="description" content="Design automated conversation flows across your channels" />
      </Helmet>

      {/* ── Page Header ─────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 bg-gradient-to-br from-brand-green to-brand-teal rounded-lg flex items-center justify-center flex-shrink-0">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <h1 className="text-base font-semibold text-gray-900">Flow Builder</h1>
            {selectedFlow && unsavedChanges && (
              <span className="text-xs text-amber-600 font-medium px-1.5 py-0.5 bg-amber-50 rounded-md border border-amber-200">
                Unsaved
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 ml-9">Design automated conversation flows across your channels</p>
        </div>

        {selectedFlow && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
              <div className={cn("h-1.5 w-1.5 rounded-full", selectedFlow.isActive ? "bg-emerald-500" : "bg-gray-300")} />
              <span className="text-xs font-medium text-gray-600">{selectedFlow.isActive ? "Active" : "Draft"}</span>
              <Switch
                checked={selectedFlow.isActive}
                onCheckedChange={(checked) => toggleFlowMutation.mutate({ id: selectedFlow.id, isActive: checked })}
                className="scale-75"
                data-testid="switch-flow-status"
              />
            </div>
            <Button variant="outline" size="sm" className="text-xs h-8" data-testid="button-test-flow">
              <Play className="h-3 w-3 mr-1.5" />
              Test Flow
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!unsavedChanges || updateFlowMutation.isPending}
              className="bg-brand-green hover:bg-brand-green/90 h-8 text-xs"
              data-testid="button-save-flow"
            >
              {updateFlowMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1.5" />Save</>}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" data-testid="button-flow-more">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={() => {/* future: duplicate flow */}}
                  className="text-sm"
                  data-testid="menu-duplicate-flow"
                >
                  <Copy className="h-3.5 w-3.5 mr-2 text-gray-400" />Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => deleteFlowMutation.mutate(selectedFlow.id)}
                  className="text-sm text-red-600 focus:text-red-600"
                  data-testid="menu-delete-flow"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />Delete Flow
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {!selectedFlow && (
          <Button
            size="sm"
            onClick={() => setIsCreating(true)}
            className="bg-brand-green hover:bg-brand-green/90 h-8 text-xs"
            data-testid="button-new-flow-header"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />New Flow
          </Button>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Left Sidebar ─────────────────────────────────────────── */}
        <aside className={cn(
          "w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0",
          selectedFlow ? "hidden md:flex" : "flex"
        )}>
          <div className="p-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your Flows</span>
              <button
                onClick={() => { setIsCreating(true); setSelectedFlow(null); setSelectedStepId(null); }}
                className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-brand-green transition-colors"
                data-testid="button-new-flow-sidebar"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-300" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search flows…"
                className="w-full pl-6 pr-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-green/30 focus:border-brand-green/40"
                data-testid="input-search-flows"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredFlows.length === 0 && !isCreating && (
              <div className="text-center py-8 px-3">
                <Zap className="h-8 w-8 mx-auto text-gray-200 mb-2" />
                <p className="text-xs text-gray-400">No flows yet</p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="mt-2 text-xs text-brand-green hover:underline"
                >
                  Create your first flow
                </button>
              </div>
            )}
            {filteredFlows.map((flow) => (
              <button
                key={flow.id}
                onClick={() => {
                  setSelectedFlow(flow);
                  setSelectedStepId(null);
                  setIsCreating(false);
                  setUnsavedChanges(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg transition-colors",
                  selectedFlow?.id === flow.id
                    ? "bg-brand-green/8 border border-brand-green/20 text-gray-900"
                    : "hover:bg-gray-50 text-gray-700 border border-transparent"
                )}
                data-testid={`flow-item-${flow.id}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", flow.isActive ? "bg-emerald-500" : "bg-gray-300")} />
                  <span className="text-xs font-medium truncate">{flow.name}</span>
                </div>
                <div className="text-xs text-gray-400 ml-3.5">
                  {flow.nodes?.length || 0} steps · {flow.executionCount || 0} runs
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Center Canvas ─────────────────────────────────────────── */}
        <main className={cn(
          "flex-1 overflow-y-auto",
          selectedStep ? "border-r border-gray-200" : ""
        )}>
          {isCreating && (
            <div className="max-w-xl mx-auto p-8">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Create Flow</h2>
                <p className="text-xs text-gray-400 mb-5">Give your flow a name to get started.</p>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs font-medium text-gray-600 mb-1.5 block">Flow name</Label>
                    <Input
                      value={newFlowName}
                      onChange={(e) => setNewFlowName(e.target.value)}
                      placeholder="e.g., Welcome Flow, Lead Qualifier"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleCreateFlow()}
                      data-testid="input-new-flow-name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-600 mb-1.5 block">Description <span className="text-gray-400 font-normal">(optional)</span></Label>
                    <Textarea
                      value={newFlowDesc}
                      onChange={(e) => setNewFlowDesc(e.target.value)}
                      placeholder="What does this flow do?"
                      className="min-h-[70px] resize-none text-sm"
                      data-testid="input-new-flow-desc"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <Button
                    onClick={handleCreateFlow}
                    disabled={!newFlowName.trim() || createFlowMutation.isPending}
                    className="bg-brand-green hover:bg-brand-green/90 text-sm"
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
          )}

          {!isCreating && !selectedFlow && (
            <div className="flex-1 flex flex-col items-center justify-center min-h-full p-8">
              <div className="text-center max-w-sm">
                <div className="h-14 w-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-6 w-6 text-gray-300" />
                </div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Select a flow or create one</h3>
                <p className="text-xs text-gray-400 mb-4">Design automated conversation flows across your channels.</p>
                <Button
                  size="sm"
                  onClick={() => setIsCreating(true)}
                  className="bg-brand-green hover:bg-brand-green/90 text-xs"
                  data-testid="button-create-first-flow"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />New Flow
                </Button>
              </div>
            </div>
          )}

          {!isCreating && selectedFlow && (
            <div className="max-w-xl mx-auto px-4 py-6 space-y-2">
              {/* Flow name editable */}
              <div className="mb-2">
                <input
                  value={selectedFlow.name}
                  onChange={(e) => {
                    setSelectedFlow({ ...selectedFlow, name: e.target.value });
                    setUnsavedChanges(true);
                  }}
                  className="text-base font-semibold text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 w-full p-0 placeholder-gray-300"
                  placeholder="Untitled Flow"
                  data-testid="input-flow-name"
                />
              </div>

              {/* ── Trigger Section ──────────────────────────────────── */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  <div className="h-7 w-7 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-3.5 w-3.5 text-violet-500" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-800">Trigger</div>
                    <div className="text-xs text-gray-400">Choose when this flow starts</div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* Start on new conversation */}
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-700">Start on new conversation</div>
                      <div className="text-xs text-gray-400 mt-0.5">This flow runs when a contact starts a new conversation</div>
                    </div>
                    <Switch
                      checked={selectedFlow.triggerOnNewChat}
                      onCheckedChange={(checked) => {
                        setSelectedFlow({ ...selectedFlow, triggerOnNewChat: checked });
                        setUnsavedChanges(true);
                      }}
                      data-testid="switch-trigger-new-chat"
                    />
                  </div>

                  {/* Keyword triggers */}
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Keyword triggers</div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {selectedFlow.triggerKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="flex items-center gap-1 px-2 py-1 bg-violet-50 border border-violet-100 text-violet-700 rounded-full text-xs font-medium"
                          data-testid={`keyword-chip-${kw}`}
                        >
                          {kw}
                          <button
                            onClick={() => removeKeyword(kw)}
                            className="text-violet-400 hover:text-violet-700 transition-colors"
                            data-testid={`remove-keyword-${kw}`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
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
                        placeholder="Type a keyword and press Enter…"
                        className="flex-1 px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-green/30 focus:border-brand-green/40"
                        data-testid="input-trigger-keywords"
                      />
                      <button
                        onClick={() => { addKeyword(keywordInput); setKeywordInput(""); }}
                        disabled={!keywordInput.trim()}
                        className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                        data-testid="button-add-keyword"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Trigger summary */}
                  {(() => {
                    const hasKw = selectedFlow.triggerKeywords.length > 0;
                    const newChat = selectedFlow.triggerOnNewChat;
                    if (!hasKw && !newChat) return (
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-700" data-testid="trigger-summary-warning">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span><strong>No trigger set</strong> — this flow will never start. Add a keyword or enable "Start on new conversation."</span>
                      </div>
                    );
                    if (hasKw && newChat) return (
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700" data-testid="trigger-summary-both">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>This flow runs when a new conversation starts <strong>or</strong> when a message matches a trigger keyword — whichever comes first.</span>
                      </div>
                    );
                    if (newChat) return (
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-700" data-testid="trigger-summary-newchat">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>This flow runs on <strong>every new conversation.</strong></span>
                      </div>
                    );
                    return (
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-700" data-testid="trigger-summary-keywords">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>This flow runs when a message matches one of the trigger keywords.</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── Flow connector ──────────────────────────────────── */}
              <div className="flex flex-col items-center py-1 gap-0">
                <div className="w-px h-4 bg-gray-200" />
                <div className="h-2 w-2 rounded-full border-2 border-gray-300 bg-white" />
              </div>

              {/* ── Steps ──────────────────────────────────────────── */}
              {selectedFlow.nodes.length === 0 && (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center">
                  <MousePointer2 className="h-8 w-8 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-500 mb-1">Start building your flow</p>
                  <p className="text-xs text-gray-400 mb-4">Add steps to design your conversation path</p>
                  <AddStepPicker onAdd={addStep} />
                </div>
              )}

              {selectedFlow.nodes.map((node, index) => {
                const stepMeta = STEP_TYPES.find(s => s.type === node.type);
                const Icon = stepMeta?.icon || MessageSquare;
                const isSelected = selectedStepId === node.id;

                return (
                  <div key={node.id} className="flex flex-col items-center">
                    <div
                      onClick={() => setSelectedStepId(isSelected ? null : node.id)}
                      className={cn(
                        "w-full bg-white rounded-xl border shadow-sm cursor-pointer transition-all group",
                        isSelected
                          ? "border-brand-green ring-1 ring-brand-green/20"
                          : "border-gray-200 hover:border-gray-300 hover:shadow"
                      )}
                      data-testid={`step-${node.id}`}
                    >
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0", stepMeta?.bg)}>
                          <Icon className={cn("h-4 w-4", stepMeta?.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">{node.data.label}</span>
                            <span className="text-xs text-gray-400">{stepMeta?.label}</span>
                          </div>
                          <p className="text-xs text-gray-400 truncate mt-0.5">{stepPreview(node)}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); moveStep(node.id, "up"); }}
                            disabled={index === 0}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-20"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); moveStep(node.id, "down"); }}
                            disabled={index === selectedFlow.nodes.length - 1}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-20"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 rounded hover:bg-gray-100 text-gray-400"
                                data-testid={`step-more-${node.id}`}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); duplicateStep(node.id); }} className="text-xs">
                                <Copy className="h-3 w-3 mr-2 text-gray-400" />Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); deleteStep(node.id); }}
                                className="text-xs text-red-600 focus:text-red-600"
                                data-testid={`delete-step-${node.id}`}
                              >
                                <Trash2 className="h-3 w-3 mr-2" />Delete step
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <Settings2 className={cn("h-4 w-4 flex-shrink-0 transition-colors", isSelected ? "text-brand-green" : "text-gray-300")} />
                      </div>
                    </div>

                    {/* Connector + Add Step */}
                    <div className="flex flex-col items-center py-1">
                      <div className="w-px h-4 bg-gray-200" />
                      <AddStepPicker onAdd={addStep} />
                      {index < selectedFlow.nodes.length - 1 && (
                        <div className="w-px h-4 bg-gray-200" />
                      )}
                    </div>
                  </div>
                );
              })}

              {selectedFlow.nodes.length > 0 && (
                <div className="flex flex-col items-center pb-6">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-400">
                    <CheckCircle2 className="h-3 w-3" />
                    End of flow
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* ── Right Settings Panel ──────────────────────────────────── */}
        {selectedStep && selectedFlow && (
          <aside className="w-80 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0", STEP_TYPES.find(s => s.type === selectedStep.type)?.bg)}>
                {(() => { const Icon = STEP_TYPES.find(s => s.type === selectedStep.type)?.icon || MessageSquare; return <Icon className={cn("h-3.5 w-3.5", STEP_TYPES.find(s => s.type === selectedStep.type)?.color)} />; })()}
              </div>
              <div className="flex-1 min-w-0">
                <input
                  value={selectedStep.data.label}
                  onChange={(e) => updateStep(selectedStep.id, { label: e.target.value })}
                  className="text-sm font-semibold text-gray-800 bg-transparent border-0 focus:outline-none w-full p-0"
                  data-testid="input-step-label"
                />
                <div className="text-xs text-gray-400">{STEP_TYPES.find(s => s.type === selectedStep.type)?.label}</div>
              </div>
              <button
                onClick={() => setSelectedStepId(null)}
                className="p-1 rounded hover:bg-gray-100 text-gray-400"
                data-testid="button-close-panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* SEND MESSAGE */}
              {selectedStep.type === "message" && (
                <>
                  <div>
                    <Label className="text-xs font-medium text-gray-500 mb-2 block">Message type</Label>
                    <div className="flex flex-wrap gap-1">
                      {MESSAGE_TYPES.map((mt) => {
                        const Icon = mt.icon;
                        const active = (selectedStep.data.messageType || "text") === mt.value;
                        return (
                          <button
                            key={mt.value}
                            onClick={() => updateStep(selectedStep.id, {
                              messageType: mt.value,
                              ...(mt.value === "text" ? { mediaUrl: undefined, mediaCaption: undefined, fileName: undefined, buttons: undefined } : {}),
                              ...(mt.value === "buttons" && !selectedStep.data.buttons ? { buttons: [{ label: "Option 1", value: "option_1" }] as ButtonOption[] } : {}),
                            })}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border",
                              active ? "bg-brand-green text-white border-brand-green" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                            )}
                            data-testid={`msg-type-${mt.value}-${selectedStep.id}`}
                          >
                            <Icon className="h-3 w-3" />{mt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(selectedStep.data.messageType || "text") === "text" && (
                    <div>
                      <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Message content</Label>
                      <Textarea
                        value={selectedStep.data.content || ""}
                        onChange={(e) => updateStep(selectedStep.id, { content: e.target.value })}
                        placeholder="Enter your message…"
                        className="min-h-[100px] text-sm resize-none"
                        data-testid={`input-message-${selectedStep.id}`}
                      />
                    </div>
                  )}

                  {(selectedStep.data.messageType === "image" || selectedStep.data.messageType === "video") && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs font-medium text-gray-500 mb-1.5 block">{selectedStep.data.messageType === "image" ? "Image" : "Video"}</Label>
                        <div className="flex gap-2 mb-2">
                          <Input
                            value={selectedStep.data.mediaUrl || ""}
                            onChange={(e) => updateStep(selectedStep.id, { mediaUrl: e.target.value })}
                            placeholder="Paste URL…"
                            className="text-sm flex-1"
                            data-testid={`input-media-url-${selectedStep.id}`}
                          />
                          <FileUploadButton
                            nodeId={`media-${selectedStep.id}`}
                            accept={selectedStep.data.messageType === "image" ? "image/*" : "video/*"}
                            label={selectedStep.data.mediaUrl ? "Replace" : "Upload"}
                            onUploaded={(url) => updateStep(selectedStep.id, { mediaUrl: url })}
                          />
                        </div>
                        {selectedStep.data.mediaUrl && selectedStep.data.messageType === "image" && (
                          <div className="rounded-lg overflow-hidden border border-gray-100 max-h-28">
                            <img src={selectedStep.data.mediaUrl} alt="Preview" className="w-full object-cover max-h-28" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Caption <span className="text-gray-400 font-normal">(optional)</span></Label>
                        <Textarea
                          value={selectedStep.data.mediaCaption || ""}
                          onChange={(e) => updateStep(selectedStep.id, { mediaCaption: e.target.value })}
                          placeholder="Add a caption…"
                          className="min-h-[60px] text-sm resize-none"
                          data-testid={`input-media-caption-${selectedStep.id}`}
                        />
                      </div>
                    </div>
                  )}

                  {selectedStep.data.messageType === "file" && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs font-medium text-gray-500 mb-1.5 block">File</Label>
                        <div className="flex gap-2 mb-2">
                          <Input
                            value={selectedStep.data.mediaUrl || ""}
                            onChange={(e) => updateStep(selectedStep.id, { mediaUrl: e.target.value })}
                            placeholder="Paste URL…"
                            className="text-sm flex-1"
                            data-testid={`input-file-url-${selectedStep.id}`}
                          />
                          <FileUploadButton
                            nodeId={`file-${selectedStep.id}`}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                            label={selectedStep.data.mediaUrl ? "Replace" : "Upload"}
                            onUploaded={(url, fileName) => updateStep(selectedStep.id, { mediaUrl: url, fileName })}
                          />
                        </div>
                        {selectedStep.data.mediaUrl && (
                          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                            <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="text-xs text-gray-600 truncate">{selectedStep.data.fileName || "Uploaded file"}</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-gray-500 mb-1.5 block">File name <span className="text-gray-400 font-normal">(optional)</span></Label>
                        <Input value={selectedStep.data.fileName || ""} onChange={(e) => updateStep(selectedStep.id, { fileName: e.target.value })} placeholder="e.g., Price List.pdf" className="text-sm" data-testid={`input-file-name-${selectedStep.id}`} />
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Accompanying message <span className="text-gray-400 font-normal">(optional)</span></Label>
                        <Textarea value={selectedStep.data.content || ""} onChange={(e) => updateStep(selectedStep.id, { content: e.target.value })} placeholder="Here's the file you requested…" className="min-h-[60px] text-sm resize-none" data-testid={`input-file-message-${selectedStep.id}`} />
                      </div>
                    </div>
                  )}

                  {selectedStep.data.messageType === "buttons" && (() => {
                    const rawBtns = selectedStep.data.buttons || [];
                    const buttons: ButtonOption[] = rawBtns.map(b => resolveButton(b as any));
                    const otherNodes = selectedFlow.nodes.filter(n => n.id !== selectedStep.id);
                    return (
                      <div className="space-y-3">
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-600 space-y-1">
                          <p className="font-medium text-slate-700">Channel support</p>
                          <p>✅ Full — WhatsApp (Meta), WebChat</p>
                          <p>〜 Partial — WhatsApp (Twilio), sent as numbered list</p>
                          <p>✖ Text only — Instagram, Facebook, Telegram, SMS</p>
                        </div>
                        {buttons.length > 3 && (
                          <div className="p-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-700">
                            ⚠️ WhatsApp supports max 3 buttons.
                          </div>
                        )}
                        <div>
                          <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Prompt message</Label>
                          <Textarea value={selectedStep.data.content || ""} onChange={(e) => updateStep(selectedStep.id, { content: e.target.value })} placeholder="Choose an option below:" className="min-h-[60px] text-sm resize-none" data-testid={`input-buttons-message-${selectedStep.id}`} />
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Buttons <span className="text-gray-400 font-normal">(max 3)</span></Label>
                          <div className="space-y-2">
                            {buttons.map((btn, bi) => (
                              <div key={bi} className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-gray-500">Button {bi + 1}</span>
                                  <button onClick={() => { const nb = buttons.filter((_, i) => i !== bi); updateStep(selectedStep.id, { buttons: nb }); }} className="text-gray-300 hover:text-red-500 transition-colors" data-testid={`delete-button-${selectedStep.id}-${bi}`}>
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <Input
                                  value={btn.label}
                                  onChange={(e) => {
                                    const nb = [...buttons];
                                    const label = e.target.value;
                                    const autoVal = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").substring(0, 64);
                                    nb[bi] = { ...nb[bi], label, value: autoVal || label };
                                    updateStep(selectedStep.id, { buttons: nb });
                                  }}
                                  placeholder={`Button ${bi + 1} label`}
                                  maxLength={20}
                                  className="text-sm h-8"
                                  data-testid={`input-button-label-${selectedStep.id}-${bi}`}
                                />
                                {otherNodes.length > 0 && (
                                  <Select
                                    value={btn.nextNodeId || "__none__"}
                                    onValueChange={(val) => {
                                      const nb = [...buttons];
                                      nb[bi] = { ...nb[bi], nextNodeId: val === "__none__" ? undefined : val };
                                      updateStep(selectedStep.id, { buttons: nb });
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs" data-testid={`select-nextstep-${selectedStep.id}-${bi}`}>
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
                              <button
                                onClick={() => {
                                  const idx = buttons.length + 1;
                                  updateStep(selectedStep.id, { buttons: [...buttons, { label: `Option ${idx}`, value: `option_${idx}` }] });
                                }}
                                className="w-full py-2 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400 hover:border-brand-green hover:text-brand-green transition-colors flex items-center justify-center gap-1"
                                data-testid={`add-button-${selectedStep.id}`}
                              >
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

              {/* ASK QUESTION */}
              {selectedStep.type === "question" && (
                <>
                  <div>
                    <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Question</Label>
                    <Textarea
                      value={selectedStep.data.content || ""}
                      onChange={(e) => updateStep(selectedStep.id, { content: e.target.value })}
                      placeholder="Enter your question…"
                      className="min-h-[80px] text-sm resize-none"
                      data-testid={`input-question-${selectedStep.id}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Save answer as <span className="text-gray-400 font-normal">(optional)</span></Label>
                    <Input
                      value={selectedStep.data.variableName || ""}
                      onChange={(e) => updateStep(selectedStep.id, { variableName: e.target.value })}
                      placeholder="e.g., customer_name"
                      className="text-sm"
                      data-testid={`input-variable-${selectedStep.id}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Quick reply options</Label>
                    <div className="space-y-2">
                      {(selectedStep.data.options || []).map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <Input
                            value={opt.label}
                            onChange={(e) => {
                              const opts = [...(selectedStep.data.options || [])];
                              opts[oi] = { ...opts[oi], label: e.target.value };
                              updateStep(selectedStep.id, { options: opts });
                            }}
                            placeholder={`Option ${oi + 1}`}
                            className="text-sm flex-1"
                            data-testid={`input-option-${selectedStep.id}-${oi}`}
                          />
                          <button
                            onClick={() => {
                              const opts = (selectedStep.data.options || []).filter((_, i) => i !== oi);
                              updateStep(selectedStep.id, { options: opts });
                            }}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const opts = [...(selectedStep.data.options || []), { label: "", nextNodeId: "" }];
                          updateStep(selectedStep.id, { options: opts });
                        }}
                        className="w-full py-2 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400 hover:border-brand-green hover:text-brand-green transition-colors flex items-center justify-center gap-1"
                        data-testid={`add-option-${selectedStep.id}`}
                      >
                        <Plus className="h-3 w-3" />Add option
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* WAIT */}
              {selectedStep.type === "delay" && (
                <div>
                  <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Delay duration</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={selectedStep.data.delayMinutes || 0}
                      onChange={(e) => updateStep(selectedStep.id, { delayMinutes: parseInt(e.target.value) || 0 })}
                      min={0}
                      className="text-sm w-24"
                      data-testid={`input-delay-${selectedStep.id}`}
                    />
                    <span className="text-sm text-gray-500">minutes</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">The flow will pause before continuing to the next step.</p>
                </div>
              )}

              {/* ACTION */}
              {selectedStep.type === "action" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Action type</Label>
                    <Select
                      value={selectedStep.data.action?.type || "set_tag"}
                      onValueChange={(val) => updateStep(selectedStep.id, { action: { type: val, value: selectedStep.data.action?.value || "" } })}
                    >
                      <SelectTrigger className="text-sm" data-testid={`select-action-type-${selectedStep.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Value</Label>
                    <Input
                      value={selectedStep.data.action?.value || ""}
                      onChange={(e) => updateStep(selectedStep.id, { action: { type: selectedStep.data.action?.type || "set_tag", value: e.target.value } })}
                      placeholder="Enter value…"
                      className="text-sm"
                      data-testid={`input-action-value-${selectedStep.id}`}
                    />
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
