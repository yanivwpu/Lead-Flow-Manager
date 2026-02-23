import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { 
  Bot, Plus, Trash2, Edit2, ToggleLeft, ToggleRight, 
  Play, Save, ArrowRight, MessageSquare, GitBranch, 
  Clock, Tag, User, Loader2, AlertCircle, Crown,
  GripVertical, X, ChevronDown, ChevronUp, Keyboard,
  Send, MousePointer, CheckCircle2, ChevronLeft
} from "lucide-react";
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

interface ChatbotNode {
  id: string;
  type: 'message' | 'question' | 'condition' | 'action' | 'delay';
  position: { x: number; y: number };
  data: {
    label: string;
    content?: string;
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

            <div className="p-3 border-t bg-white">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
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
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={selectedFlow.triggerOnNewChat}
                    onCheckedChange={(checked) => {
                      setSelectedFlow({ ...selectedFlow, triggerOnNewChat: checked });
                      setUnsavedChanges(true);
                    }}
                    data-testid="switch-trigger-new-chat"
                  />
                  <Label className="text-sm text-gray-600">Trigger on new chat</Label>
                </div>
              </div>
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
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={triggerOnNewChat}
                onCheckedChange={setTriggerOnNewChat}
                data-testid="switch-new-flow-new-chat"
              />
              <Label>Trigger on new chat</Label>
            </div>
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
