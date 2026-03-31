import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { 
  Bot, Plus, Trash2, Edit2, ToggleLeft, ToggleRight, 
  Play, Save, ArrowRight, MessageSquare, GitBranch, 
  Clock, Tag, User, Loader2, AlertCircle, Crown,
  GripVertical, X, ChevronDown, ChevronUp, Keyboard,
  Send, MousePointer, CheckCircle2, ChevronLeft,
  Image, Video, FileText, ListOrdered, Upload
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

type MessageType = 'text' | 'image' | 'video' | 'file' | 'buttons';

export interface ButtonOption {
  label: string;
  value: string;
  nextNodeId?: string;
}

/** Normalize legacy string buttons to ButtonOption objects */
function resolveButton(btn: string | ButtonOption): ButtonOption {
  if (typeof btn === 'string') return { label: btn, value: btn };
  return { label: btn.label || btn.value, value: btn.value || btn.label, nextNodeId: btn.nextNodeId };
}

interface ChatbotNode {
  id: string;
  type: 'message' | 'question' | 'condition' | 'action' | 'delay';
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

const MESSAGE_TYPES: { value: MessageType; label: string; icon: any; description: string }[] = [
  { value: 'text', label: 'Text', icon: MessageSquare, description: 'Plain text message' },
  { value: 'image', label: 'Image', icon: Image, description: 'Send an image with optional caption' },
  { value: 'video', label: 'Video', icon: Video, description: 'Send a video with optional caption' },
  { value: 'file', label: 'File', icon: FileText, description: 'Send a document or PDF' },
  { value: 'buttons', label: 'Buttons', icon: ListOrdered, description: 'Message with quick reply buttons' },
];

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

const NODE_TYPES = [
  { type: 'message', label: 'Send Message', icon: MessageSquare, description: 'Send a message to the customer' },
  { type: 'question', label: 'Ask Question', icon: GitBranch, description: 'Ask a question with multiple choices' },
  { type: 'delay', label: 'Wait', icon: Clock, description: 'Wait before sending the next message' },
  { type: 'action', label: 'Action', icon: Tag, description: 'Perform an action like tagging' },
];

const ACTION_TYPES = [
  { value: 'set_tag', label: 'Set Tag' },
  { value: 'set_status', label: 'Set Status' },
  { value: 'assign', label: 'Assign to Team' },
  { value: 'set_pipeline', label: 'Set Pipeline Stage' },
];

function FileUploadButton({ 
  onUploaded, 
  accept, 
  nodeId,
  label = "Upload"
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
          if (file) {
            uploadFile(file);
            e.target.value = '';
          }
        }}
        data-testid={`file-input-${nodeId}`}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border transition-colors",
          isUploading
            ? "bg-gray-100 text-gray-400 border-gray-200 cursor-wait"
            : "bg-white text-brand-green border-brand-green/30 hover:bg-brand-green/5 hover:border-brand-green/50"
        )}
        data-testid={`upload-btn-${nodeId}`}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {progress > 0 && progress < 100 ? `${progress}%` : 'Uploading...'}
          </>
        ) : (
          <>
            <Upload className="h-3.5 w-3.5" />
            {label}
          </>
        )}
      </button>
    </div>
  );
}

export function ChatbotBuilder() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFlow, setSelectedFlow] = useState<ChatbotFlow | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<ChatbotNode | null>(null);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDescription, setNewFlowDescription] = useState("");
  const [triggerKeywords, setTriggerKeywords] = useState("");
  const [triggerOnNewChat, setTriggerOnNewChat] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);

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
      toast({ title: "Flow created successfully" });
      setSelectedFlow(flow);
      setKeywordsRaw(flow.triggerKeywords?.join(', ') || '');
      setIsCreateDialogOpen(false);
      setNewFlowName("");
      setNewFlowDescription("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateFlowMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/chatbot-flows/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      toast({ title: "Flow saved successfully" });
      setUnsavedChanges(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
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
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleFlowMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/chatbot-flows/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateFlow = () => {
    if (!newFlowName.trim()) return;
    
    const startNode: ChatbotNode = {
      id: 'start',
      type: 'message',
      position: { x: 250, y: 50 },
      data: {
        label: 'Welcome Message',
        content: 'Hello! How can I help you today?',
      },
    };

    createFlowMutation.mutate({
      name: newFlowName,
      description: newFlowDescription || null,
      nodes: [startNode],
      edges: [],
      triggerKeywords: triggerKeywords.split(',').map(k => k.trim()).filter(k => k),
      triggerOnNewChat,
    });
  };

  const handleSaveFlow = () => {
    if (!selectedFlow) return;
    updateFlowMutation.mutate({
      id: selectedFlow.id,
      nodes: selectedFlow.nodes,
      edges: selectedFlow.edges,
      triggerKeywords: selectedFlow.triggerKeywords,
      triggerOnNewChat: selectedFlow.triggerOnNewChat,
    });
  };

  const addNode = (type: ChatbotNode['type']) => {
    if (!selectedFlow) return;
    
    const newNode: ChatbotNode = {
      id: `node_${Date.now()}`,
      type,
      position: { x: 250, y: (selectedFlow.nodes.length + 1) * 120 },
      data: {
        label: NODE_TYPES.find(n => n.type === type)?.label || type,
        content: type === 'message' ? 'Enter your message here...' : undefined,
        messageType: type === 'message' ? 'text' as MessageType : undefined,
        options: type === 'question' ? [{ label: 'Option 1', nextNodeId: '' }] : undefined,
        delayMinutes: type === 'delay' ? 5 : undefined,
        action: type === 'action' ? { type: 'set_tag', value: '' } : undefined,
      },
    };

    const lastNode = selectedFlow.nodes[selectedFlow.nodes.length - 1];
    const newEdge: ChatbotEdge | null = lastNode ? {
      id: `edge_${Date.now()}`,
      source: lastNode.id,
      target: newNode.id,
    } : null;

    setSelectedFlow({
      ...selectedFlow,
      nodes: [...selectedFlow.nodes, newNode],
      edges: newEdge ? [...selectedFlow.edges, newEdge] : selectedFlow.edges,
    });
    setUnsavedChanges(true);
  };

  const updateNode = (nodeId: string, updates: Partial<ChatbotNode['data']>) => {
    if (!selectedFlow) return;
    
    setSelectedFlow({
      ...selectedFlow,
      nodes: selectedFlow.nodes.map(node =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...updates } } : node
      ),
    });
    setUnsavedChanges(true);
  };

  const deleteNode = (nodeId: string) => {
    if (!selectedFlow) return;
    
    setSelectedFlow({
      ...selectedFlow,
      nodes: selectedFlow.nodes.filter(node => node.id !== nodeId),
      edges: selectedFlow.edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId),
    });
    setUnsavedChanges(true);
  };

  const moveNode = (nodeId: string, direction: 'up' | 'down') => {
    if (!selectedFlow) return;
    
    const nodeIndex = selectedFlow.nodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) return;
    
    const newIndex = direction === 'up' ? nodeIndex - 1 : nodeIndex + 1;
    if (newIndex < 0 || newIndex >= selectedFlow.nodes.length) return;
    
    const newNodes = [...selectedFlow.nodes];
    [newNodes[nodeIndex], newNodes[newIndex]] = [newNodes[newIndex], newNodes[nodeIndex]];
    
    setSelectedFlow({ ...selectedFlow, nodes: newNodes });
    setUnsavedChanges(true);
  };

  if (error) {
    const errorMessage = (error as any)?.message || "";
    const isPlanRestriction = errorMessage.includes("paid plan") || 
                              (error as any)?.status === 403;
    
    if (isPlanRestriction) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <Helmet>
            <title>Chatbot Builder - Upgrade Required | ChatCRM</title>
          </Helmet>
          <div className="text-center max-w-md">
            <div className="mx-auto h-16 w-16 bg-gradient-to-r from-brand-green to-brand-teal rounded-2xl flex items-center justify-center mb-6">
              <Bot className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Visual Chatbot Builder
            </h2>
            <p className="text-gray-600 mb-6">
              Create automated conversation flows to handle customer inquiries 24/7. 
              Upgrade to Starter or Pro to access this feature.
            </p>
            <Link href="/pricing">
              <Button className="bg-brand-green hover:bg-brand-green/90" data-testid="button-upgrade">
                <Crown className="h-4 w-4 mr-2" />
                View Plans
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
        <Loader2 className="h-8 w-8 animate-spin text-brand-green" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Helmet>
        <title>Chatbot Builder | ChatCRM</title>
        <meta name="description" content="Create visual chatbot flows for WhatsApp automation" />
      </Helmet>

      <div className="border-b border-gray-200 bg-white">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-gradient-to-r from-brand-green to-brand-teal rounded-lg flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Chatbot Builder</h1>
              <p className="text-sm text-gray-500">Create automated conversation flows</p>
            </div>
          </div>
          <Button 
            onClick={() => setIsCreateDialogOpen(true)}
            className="bg-brand-green hover:bg-brand-green/90"
            data-testid="button-create-flow"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Flow
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Flows List - Hidden on mobile when a flow is selected */}
        <div className={cn(
          "w-full md:w-64 border-r bg-gray-50 overflow-y-auto",
          selectedFlow ? "hidden md:block" : "block"
        )}>
          <div className="p-3">
            <div className="text-xs font-medium text-gray-500 uppercase mb-2">Your Flows</div>
            {flows.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-8">
                No flows yet. Create your first chatbot!
              </div>
            ) : (
              <div className="space-y-2">
                {flows.map((flow) => (
                  <div
                    key={flow.id}
                    onClick={() => {
                      setSelectedFlow(flow);
                      setKeywordsRaw(flow.triggerKeywords?.join(', ') || '');
                      setUnsavedChanges(false);
                    }}
                    className={cn(
                      "p-3 rounded-lg cursor-pointer transition-colors",
                      selectedFlow?.id === flow.id
                        ? "bg-white border-2 border-brand-green"
                        : "bg-white border border-gray-200 hover:border-brand-green/50"
                    )}
                    data-testid={`flow-item-${flow.id}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 text-sm truncate">
                        {flow.name}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFlowMutation.mutate({ id: flow.id, isActive: !flow.isActive });
                        }}
                        className="text-gray-400 hover:text-brand-green"
                        data-testid={`toggle-flow-${flow.id}`}
                      >
                        {flow.isActive ? (
                          <ToggleRight className="h-5 w-5 text-brand-green" />
                        ) : (
                          <ToggleLeft className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{flow.nodes?.length || 0} nodes</span>
                      <span>|</span>
                      <span>{flow.executionCount || 0} runs</span>
                    </div>
                    {flow.isActive && (
                      <Badge variant="outline" className="mt-2 text-xs text-brand-green border-brand-green">
                        Active
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Flow Editor - Full width on mobile */}
        {selectedFlow ? (
          <div className={cn(
            "flex-1 flex flex-col overflow-hidden min-w-0",
            selectedFlow ? "flex" : "hidden md:flex"
          )}>
            <div className="p-3 border-b bg-white flex items-center gap-2">
              {/* Back button for mobile */}
              <button
                onClick={() => setSelectedFlow(null)}
                className="md:hidden p-1.5 -ml-1 text-gray-600 hover:bg-gray-100 rounded"
                data-testid="button-back-flows"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">{selectedFlow.name}</h2>
                {unsavedChanges && (
                  <span className="text-xs text-amber-600">Unsaved changes</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => deleteFlowMutation.mutate(selectedFlow.id)}
                  className="text-red-600 hover:bg-red-50 h-8 w-8"
                  data-testid="button-delete-flow"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveFlow}
                  disabled={!unsavedChanges || updateFlowMutation.isPending}
                  className="bg-brand-green hover:bg-brand-green/90 h-8"
                  data-testid="button-save-flow"
                >
                  {updateFlowMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="h-4 w-4 md:mr-1" />
                      <span className="hidden md:inline">Save</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="p-2 md:p-3 border-b bg-gray-50 overflow-x-auto">
              <div className="text-xs font-medium text-gray-500 mb-1.5 md:mb-2">Add Node</div>
              <div className="flex gap-1.5 md:gap-2 md:flex-wrap">
                {NODE_TYPES.map((nodeType) => (
                  <Button
                    key={nodeType.type}
                    variant="outline"
                    size="sm"
                    onClick={() => addNode(nodeType.type as ChatbotNode['type'])}
                    className="text-xs whitespace-nowrap flex-shrink-0 h-8"
                    data-testid={`add-node-${nodeType.type}`}
                  >
                    <nodeType.icon className="h-3 w-3 mr-1" />
                    <span className="hidden sm:inline">{nodeType.label}</span>
                    <span className="sm:hidden">{nodeType.label.split(' ')[0]}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4 bg-gray-100" ref={canvasRef}>
              <div className="space-y-3 max-w-2xl mx-auto w-full">
                {selectedFlow.nodes.map((node, index) => (
                  <div
                    key={node.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                    data-testid={`node-${node.id}`}
                  >
                    <div className="flex items-center gap-1.5 px-2 md:px-4 py-2 bg-gray-50 border-b">
                      <div className="flex items-center">
                        <button
                          onClick={() => moveNode(node.id, 'up')}
                          disabled={index === 0}
                          className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => moveNode(node.id, 'down')}
                          disabled={index === selectedFlow.nodes.length - 1}
                          className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                      
                      {node.type === 'message' && <MessageSquare className="h-4 w-4 text-blue-500 flex-shrink-0" />}
                      {node.type === 'question' && <GitBranch className="h-4 w-4 text-purple-500 flex-shrink-0" />}
                      {node.type === 'delay' && <Clock className="h-4 w-4 text-orange-500 flex-shrink-0" />}
                      {node.type === 'action' && <Tag className="h-4 w-4 text-green-500 flex-shrink-0" />}
                      
                      <span className="text-sm font-medium text-gray-700 flex-1 truncate min-w-0">
                        {node.data.label}
                      </span>
                      
                      <button
                        onClick={() => deleteNode(node.id)}
                        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 flex-shrink-0"
                        data-testid={`delete-node-${node.id}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="p-3 md:p-4">
                      {node.type === 'message' && (
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs text-gray-500 mb-1 block">Message Type</Label>
                            <div className="flex flex-wrap gap-1.5">
                              {MESSAGE_TYPES.map((mt) => {
                                const Icon = mt.icon;
                                const isActive = (node.data.messageType || 'text') === mt.value;
                                return (
                                  <button
                                    key={mt.value}
                                    onClick={() => updateNode(node.id, { 
                                      messageType: mt.value,
                                      ...(mt.value === 'text' ? { mediaUrl: undefined, mediaCaption: undefined, fileName: undefined, buttons: undefined } : {}),
                                      ...(mt.value === 'buttons' && !node.data.buttons ? { buttons: [{ label: 'Option 1', value: 'option_1' }] as ButtonOption[] } : {}),
                                    })}
                                    className={cn(
                                      "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                                      isActive 
                                        ? "bg-brand-green text-white" 
                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    )}
                                    data-testid={`msg-type-${mt.value}-${node.id}`}
                                  >
                                    <Icon className="h-3.5 w-3.5" />
                                    {mt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {(node.data.messageType || 'text') === 'text' && (
                            <div>
                              <Label className="text-xs text-gray-500 mb-1 block">Message</Label>
                              <Textarea
                                value={node.data.content || ''}
                                onChange={(e) => updateNode(node.id, { content: e.target.value })}
                                placeholder="Enter your message..."
                                className="min-h-[80px] text-sm"
                                data-testid={`input-message-${node.id}`}
                              />
                            </div>
                          )}

                          {((node.data.messageType) === 'image' || (node.data.messageType) === 'video') && (
                            <div className="space-y-2">
                              <div>
                                <Label className="text-xs text-gray-500 mb-1 block">
                                  {node.data.messageType === 'image' ? 'Image' : 'Video'}
                                </Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={node.data.mediaUrl || ''}
                                    onChange={(e) => updateNode(node.id, { mediaUrl: e.target.value })}
                                    placeholder={`Paste URL or upload a ${node.data.messageType}...`}
                                    className="text-sm flex-1"
                                    data-testid={`input-media-url-${node.id}`}
                                  />
                                  <FileUploadButton
                                    nodeId={`media-${node.id}`}
                                    accept={node.data.messageType === 'image' ? 'image/*' : 'video/*'}
                                    label={node.data.mediaUrl ? 'Replace' : 'Upload'}
                                    onUploaded={(url, fileName) => {
                                      updateNode(node.id, { mediaUrl: url });
                                    }}
                                  />
                                </div>
                                {node.data.mediaUrl && node.data.messageType === 'image' && (
                                  <div className="mt-2 rounded-md overflow-hidden border border-gray-200 max-h-32">
                                    <img 
                                      src={node.data.mediaUrl} 
                                      alt="Preview" 
                                      className="w-full h-full object-cover max-h-32"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                  </div>
                                )}
                              </div>
                              <div>
                                <Label className="text-xs text-gray-500 mb-1 block">Caption (optional)</Label>
                                <Textarea
                                  value={node.data.mediaCaption || ''}
                                  onChange={(e) => updateNode(node.id, { mediaCaption: e.target.value })}
                                  placeholder="Add a caption to your media..."
                                  className="min-h-[50px] text-sm"
                                  data-testid={`input-media-caption-${node.id}`}
                                />
                              </div>
                            </div>
                          )}

                          {(node.data.messageType) === 'file' && (
                            <div className="space-y-2">
                              <div>
                                <Label className="text-xs text-gray-500 mb-1 block">File</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={node.data.mediaUrl || ''}
                                    onChange={(e) => updateNode(node.id, { mediaUrl: e.target.value })}
                                    placeholder="Paste URL or upload a file..."
                                    className="text-sm flex-1"
                                    data-testid={`input-file-url-${node.id}`}
                                  />
                                  <FileUploadButton
                                    nodeId={`file-${node.id}`}
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                                    label={node.data.mediaUrl ? 'Replace' : 'Upload'}
                                    onUploaded={(url, fileName) => {
                                      updateNode(node.id, { mediaUrl: url, fileName: fileName });
                                    }}
                                  />
                                </div>
                                {node.data.mediaUrl && (
                                  <div className="mt-1.5 flex items-center gap-2 p-2 bg-gray-50 rounded-md border border-gray-200">
                                    <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
                                    <span className="text-xs text-gray-600 truncate">{node.data.fileName || 'Uploaded file'}</span>
                                  </div>
                                )}
                              </div>
                              <div>
                                <Label className="text-xs text-gray-500 mb-1 block">File Name (optional)</Label>
                                <Input
                                  value={node.data.fileName || ''}
                                  onChange={(e) => updateNode(node.id, { fileName: e.target.value })}
                                  placeholder="e.g., Price List.pdf"
                                  className="text-sm"
                                  data-testid={`input-file-name-${node.id}`}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-500 mb-1 block">Message (optional)</Label>
                                <Textarea
                                  value={node.data.content || ''}
                                  onChange={(e) => updateNode(node.id, { content: e.target.value })}
                                  placeholder="Here's the file you requested..."
                                  className="min-h-[50px] text-sm"
                                  data-testid={`input-file-message-${node.id}`}
                                />
                              </div>
                            </div>
                          )}

                          {(node.data.messageType) === 'buttons' && (() => {
                            // Normalize: handle legacy string[] from old saved flows
                            const rawBtns = node.data.buttons || [];
                            const buttons: ButtonOption[] = rawBtns.map(b => resolveButton(b as any));
                            // Other nodes for nextNodeId selector (exclude current)
                            const otherNodes = (selectedFlow?.nodes || []).filter(n => n.id !== node.id);

                            return (
                            <div className="space-y-3">
                              {/* Channel support notice */}
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs space-y-2">
                                <p className="font-semibold text-slate-700">Interactive Buttons — Channel Support</p>
                                <div className="space-y-1">
                                  <div className="flex gap-2">
                                    <span className="text-green-600 font-medium w-4">✅</span>
                                    <span className="text-slate-700"><span className="font-medium">Full support:</span> WhatsApp (Meta Cloud API), WebChat widget</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <span className="text-amber-500 font-medium w-4">〜</span>
                                    <span className="text-slate-700"><span className="font-medium">Partial / fallback:</span> WhatsApp (Twilio) — buttons sent as a numbered text list. Full interactive buttons require Twilio Content API templates.</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <span className="text-slate-400 font-medium w-4">✖</span>
                                    <span className="text-slate-500"><span className="font-medium">Text only:</span> Instagram, Facebook, Telegram, SMS — always sent as a numbered list.</span>
                                  </div>
                                </div>
                              </div>

                              {buttons.length > 3 && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                                  ⚠️ WhatsApp supports max 3 buttons. Only the first 3 will be sent as interactive buttons.
                                </div>
                              )}

                              <div>
                                <Label className="text-xs text-gray-500 mb-1 block">Prompt Message</Label>
                                <Textarea
                                  value={node.data.content || ''}
                                  onChange={(e) => updateNode(node.id, { content: e.target.value })}
                                  placeholder="Choose an option below:"
                                  className="min-h-[60px] text-sm"
                                  data-testid={`input-buttons-message-${node.id}`}
                                />
                              </div>

                              <div>
                                <Label className="text-xs text-gray-500 mb-1 block">Button Options (max 3 for WhatsApp)</Label>
                                <div className="space-y-2.5">
                                  {buttons.map((btn, btnIndex) => (
                                    <div key={btnIndex} className="border border-gray-200 rounded-lg p-2.5 space-y-2 bg-gray-50">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium text-gray-500">Button {btnIndex + 1}</span>
                                        <button
                                          onClick={() => {
                                            const newButtons = buttons.filter((_, i) => i !== btnIndex);
                                            updateNode(node.id, { buttons: newButtons });
                                          }}
                                          className="p-0.5 text-gray-300 hover:text-red-500 transition-colors"
                                          data-testid={`delete-button-${node.id}-${btnIndex}`}
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>

                                      {/* Label */}
                                      <div>
                                        <Label className="text-xs text-gray-400 mb-0.5 block">Label (shown to user, max 20 chars)</Label>
                                        <Input
                                          value={btn.label}
                                          onChange={(e) => {
                                            const newBtns = [...buttons];
                                            const label = e.target.value;
                                            // Auto-derive value from label if not manually set
                                            const autoValue = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').substring(0, 64);
                                            newBtns[btnIndex] = {
                                              ...newBtns[btnIndex],
                                              label,
                                              value: newBtns[btnIndex].value === resolveButton(rawBtns[btnIndex] as any).value
                                                ? autoValue || label
                                                : newBtns[btnIndex].value,
                                            };
                                            updateNode(node.id, { buttons: newBtns });
                                          }}
                                          placeholder={`Button ${btnIndex + 1} label`}
                                          className="text-sm h-8"
                                          maxLength={20}
                                          data-testid={`input-button-label-${node.id}-${btnIndex}`}
                                        />
                                      </div>

                                      {/* Next step */}
                                      {otherNodes.length > 0 && (
                                        <div>
                                          <Label className="text-xs text-gray-400 mb-0.5 block">Next step (optional)</Label>
                                          <Select
                                            value={btn.nextNodeId || '__none__'}
                                            onValueChange={(val) => {
                                              const newBtns = [...buttons];
                                              newBtns[btnIndex] = {
                                                ...newBtns[btnIndex],
                                                nextNodeId: val === '__none__' ? undefined : val,
                                              };
                                              updateNode(node.id, { buttons: newBtns });
                                            }}
                                          >
                                            <SelectTrigger className="h-8 text-xs" data-testid={`select-nextstep-${node.id}-${btnIndex}`}>
                                              <SelectValue placeholder="Continue flow or stop" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="__none__">— No branch (end flow) —</SelectItem>
                                              {otherNodes.map(n => (
                                                <SelectItem key={n.id} value={n.id}>
                                                  {n.data.label || n.id}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      )}
                                    </div>
                                  ))}

                                  {buttons.length < 3 && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const idx = buttons.length + 1;
                                        const newBtns: ButtonOption[] = [
                                          ...buttons,
                                          { label: `Option ${idx}`, value: `option_${idx}` },
                                        ];
                                        updateNode(node.id, { buttons: newBtns });
                                      }}
                                      className="w-full text-xs"
                                      data-testid={`add-button-${node.id}`}
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      Add Button
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                            );
                          })()}
                        </div>
                      )}

                      {node.type === 'question' && (
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs text-gray-500 mb-1 block">Question</Label>
                            <Textarea
                              value={node.data.content || ''}
                              onChange={(e) => updateNode(node.id, { content: e.target.value })}
                              placeholder="Enter your question..."
                              className="min-h-[60px] text-sm"
                              data-testid={`input-question-${node.id}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500 mb-1 block">Save Answer As</Label>
                            <Input
                              value={node.data.variableName || ''}
                              onChange={(e) => updateNode(node.id, { variableName: e.target.value })}
                              placeholder="e.g., customer_name"
                              className="text-sm"
                              data-testid={`input-variable-${node.id}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500 mb-1 block">Quick Reply Options</Label>
                            <div className="space-y-2">
                              {(node.data.options || []).map((option, optIndex) => (
                                <div key={optIndex} className="flex items-center gap-2">
                                  <Input
                                    value={option.label}
                                    onChange={(e) => {
                                      const newOptions = [...(node.data.options || [])];
                                      newOptions[optIndex].label = e.target.value;
                                      updateNode(node.id, { options: newOptions });
                                    }}
                                    placeholder={`Option ${optIndex + 1}`}
                                    className="text-sm flex-1"
                                    data-testid={`input-option-${node.id}-${optIndex}`}
                                  />
                                  <button
                                    onClick={() => {
                                      const newOptions = (node.data.options || []).filter((_, i) => i !== optIndex);
                                      updateNode(node.id, { options: newOptions });
                                    }}
                                    className="p-1 text-gray-400 hover:text-red-500"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newOptions = [...(node.data.options || []), { label: '', nextNodeId: '' }];
                                  updateNode(node.id, { options: newOptions });
                                }}
                                className="w-full text-xs"
                                data-testid={`add-option-${node.id}`}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Add Option
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {node.type === 'delay' && (
                        <div>
                          <Label className="text-xs text-gray-500 mb-1 block">Wait Time (minutes)</Label>
                          <Input
                            type="number"
                            value={node.data.delayMinutes || 0}
                            onChange={(e) => updateNode(node.id, { delayMinutes: parseInt(e.target.value) || 0 })}
                            min={0}
                            className="text-sm w-32"
                            data-testid={`input-delay-${node.id}`}
                          />
                        </div>
                      )}

                      {node.type === 'action' && (
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs text-gray-500 mb-1 block">Action Type</Label>
                            <Select
                              value={node.data.action?.type || 'set_tag'}
                              onValueChange={(value) => updateNode(node.id, { 
                                action: { type: value, value: node.data.action?.value || '' } 
                              })}
                            >
                              <SelectTrigger className="text-sm" data-testid={`select-action-type-${node.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ACTION_TYPES.map((action) => (
                                  <SelectItem key={action.value} value={action.value}>
                                    {action.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500 mb-1 block">Value</Label>
                            <Input
                              value={node.data.action?.value || ''}
                              onChange={(e) => updateNode(node.id, { 
                                action: { type: node.data.action?.type || 'set_tag', value: e.target.value } 
                              })}
                              placeholder="Enter value..."
                              className="text-sm"
                              data-testid={`input-action-value-${node.id}`}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {index < selectedFlow.nodes.length - 1 && (
                      <div className="flex justify-center py-2 bg-gray-50 border-t">
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </div>
                    )}
                  </div>
                ))}

                {selectedFlow.nodes.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Bot className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="font-medium">No nodes yet</p>
                    <p className="text-sm">Add nodes using the buttons above to build your flow</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 border-t bg-white space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <Label className="text-xs text-gray-500 mb-1 block">Trigger Keywords (comma-separated)</Label>
                  <Input
                    value={keywordsRaw}
                    onChange={(e) => {
                      setKeywordsRaw(e.target.value);
                      setSelectedFlow({
                        ...selectedFlow,
                        triggerKeywords: e.target.value.split(',').map(k => k.trim()).filter(k => k),
                      });
                      setUnsavedChanges(true);
                    }}
                    placeholder="e.g., help, info"
                    className="text-sm"
                    data-testid="input-trigger-keywords"
                  />
                  <p className="text-xs text-gray-400 mt-1">Bot fires when a message contains one of these words (case-insensitive, any conversation)</p>
                </div>
                <div className="flex flex-col gap-1 sm:pt-0.5">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={selectedFlow.triggerOnNewChat}
                      onCheckedChange={(checked) => {
                        setSelectedFlow({ ...selectedFlow, triggerOnNewChat: checked });
                        setUnsavedChanges(true);
                      }}
                      data-testid="switch-trigger-new-chat"
                    />
                    <Label className="text-sm text-gray-700 font-medium">Auto-reply on new conversations</Label>
                  </div>
                  <p className="text-xs text-gray-400 ml-11">
                    {selectedFlow.triggerOnNewChat
                      ? "ON — bot fires on any first message, even without a keyword"
                      : "OFF — bot only fires when a keyword matches"}
                  </p>
                </div>
              </div>

              {(() => {
                const hasKeywords = (selectedFlow.triggerKeywords?.length ?? 0) > 0;
                const newChat = selectedFlow.triggerOnNewChat;
                if (!hasKeywords && !newChat) {
                  return (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700" data-testid="trigger-summary-warning">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span><strong>No trigger set</strong> — this flow will never fire. Add a keyword or enable auto-reply on new conversations.</span>
                    </div>
                  );
                }
                if (hasKeywords && newChat) {
                  return (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-blue-50 border border-blue-200 text-xs text-blue-700" data-testid="trigger-summary-both">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span><strong>Both conditions active:</strong> bot fires on a keyword match <em>or</em> on any new conversation — whichever comes first.</span>
                    </div>
                  );
                }
                if (newChat && !hasKeywords) {
                  return (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-green-50 border border-green-200 text-xs text-green-700" data-testid="trigger-summary-newchat">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>Bot fires on <strong>every new conversation</strong> (no keywords set).</span>
                    </div>
                  );
                }
                return (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-green-50 border border-green-200 text-xs text-green-700" data-testid="trigger-summary-keywords">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Bot fires on <strong>keyword match only</strong> — it won't reply to messages that don't contain a trigger word.</span>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50">
            <div className="text-center max-w-sm p-4">
              <Bot className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="font-semibold text-gray-900 mb-2">Select or Create a Flow</h3>
              <p className="text-sm text-gray-500 mb-4">
                Choose a flow from the sidebar or create a new one to start building your chatbot.
              </p>
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                className="bg-brand-green hover:bg-brand-green/90"
                data-testid="button-create-first-flow"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Flow
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Chatbot Flow</DialogTitle>
            <DialogDescription>
              Give your chatbot flow a name and optional description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Flow Name</Label>
              <Input
                value={newFlowName}
                onChange={(e) => setNewFlowName(e.target.value)}
                placeholder="e.g., Welcome Flow, FAQ Bot"
                data-testid="input-new-flow-name"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={newFlowDescription}
                onChange={(e) => setNewFlowDescription(e.target.value)}
                placeholder="Describe what this flow does..."
                data-testid="input-new-flow-description"
              />
            </div>
            <div>
              <Label>Trigger Keywords (comma-separated)</Label>
              <Input
                value={triggerKeywords}
                onChange={(e) => setTriggerKeywords(e.target.value)}
                placeholder="e.g., help, info, pricing"
                data-testid="input-new-flow-keywords"
              />
              <p className="text-xs text-gray-400 mt-1">Bot fires when a message contains one of these words (case-insensitive, any conversation)</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={triggerOnNewChat}
                  onCheckedChange={setTriggerOnNewChat}
                  data-testid="switch-new-flow-new-chat"
                />
                <Label className="font-medium">Auto-reply on new conversations</Label>
              </div>
              <p className="text-xs text-gray-400 ml-11">
                {triggerOnNewChat
                  ? "ON — bot fires on any first message, even without a keyword"
                  : "OFF — bot only fires when a keyword matches"}
              </p>
            </div>
            {(() => {
              const hasKeywords = triggerKeywords.trim().length > 0;
              if (!hasKeywords && !triggerOnNewChat) {
                return (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span><strong>No trigger set</strong> — add a keyword or enable auto-reply so the flow can fire.</span>
                  </div>
                );
              }
              if (hasKeywords && triggerOnNewChat) {
                return (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-blue-50 border border-blue-200 text-xs text-blue-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span><strong>Both conditions active:</strong> bot fires on a keyword match <em>or</em> on any new conversation — whichever comes first.</span>
                  </div>
                );
              }
              return null;
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateFlow}
              disabled={!newFlowName.trim() || createFlowMutation.isPending}
              className="bg-brand-green hover:bg-brand-green/90"
              data-testid="button-confirm-create-flow"
            >
              {createFlowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Flow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
