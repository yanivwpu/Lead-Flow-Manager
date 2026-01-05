import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { 
  Zap, Plus, Trash2, Edit2, ToggleLeft, ToggleRight, 
  ArrowRight, User, Tag, Clock, FileText, ChevronDown,
  Loader2, AlertCircle, Crown, Play, History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const TRIGGER_TYPES = [
  { value: "new_chat", label: "New Chat Created", icon: Plus, description: "Triggers when a new conversation starts" },
  { value: "keyword", label: "Keyword Detected", icon: Tag, description: "Triggers when a message contains specific keywords" },
  { value: "tag_change", label: "Tag Changed", icon: Tag, description: "Triggers when a chat's tag is changed" },
];

const ACTION_TYPES = [
  { value: "assign", label: "Assign to Team Member", icon: User },
  { value: "tag", label: "Set Tag", icon: Tag },
  { value: "set_status", label: "Set Status", icon: FileText },
  { value: "set_pipeline", label: "Set Pipeline Stage", icon: ArrowRight },
  { value: "add_note", label: "Add Note", icon: FileText },
  { value: "set_followup", label: "Set Follow-up", icon: Clock },
];

const TAGS = ["New", "Hot", "Quoted", "Paid", "Waiting", "Lost"];
const STATUSES = ["open", "pending", "resolved", "closed"];
const PIPELINE_STAGES = ["Lead", "Contacted", "Proposal", "Negotiation", "Closed"];
const FOLLOWUP_DAYS = ["1", "3", "7", "14", "30"];

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  triggerType: string;
  triggerConditions: any;
  actions: any[];
  executionCount: number;
  lastExecutedAt: string | null;
  createdAt: string;
}

interface WorkflowAction {
  type: string;
  value: string;
}

export function Workflows() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("new_chat");
  const [keywords, setKeywords] = useState("");
  const [actions, setActions] = useState<WorkflowAction[]>([{ type: "assign", value: "round_robin" }]);

  const { data: workflows = [], isLoading, error } = useQuery<Workflow[]>({
    queryKey: ["/api/workflows"],
    retry: false,
  });

  const { data: teamMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/team/members"],
    retry: false,
  });

  const createWorkflowMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/workflows", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow created successfully" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/workflows/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow updated successfully" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteWorkflowMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/workflows/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleWorkflowMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/workflows/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setTriggerType("new_chat");
    setKeywords("");
    setActions([{ type: "assign", value: "round_robin" }]);
    setEditingWorkflow(null);
  };

  const openEditDialog = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setName(workflow.name);
    setDescription(workflow.description || "");
    setTriggerType(workflow.triggerType);
    setKeywords(workflow.triggerConditions?.keywords?.join(", ") || "");
    setActions(workflow.actions as WorkflowAction[] || [{ type: "assign", value: "round_robin" }]);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({ title: "Please enter a workflow name", variant: "destructive" });
      return;
    }

    const triggerConditions: any = {};
    if (triggerType === "keyword" && keywords.trim()) {
      triggerConditions.keywords = keywords.split(",").map(k => k.trim()).filter(Boolean);
    }

    const data = {
      name,
      description: description || null,
      triggerType,
      triggerConditions,
      actions: actions.filter(a => a.value),
    };

    if (editingWorkflow) {
      updateWorkflowMutation.mutate({ id: editingWorkflow.id, ...data });
    } else {
      createWorkflowMutation.mutate(data);
    }
  };

  const addAction = () => {
    setActions([...actions, { type: "tag", value: "" }]);
  };

  const updateAction = (index: number, field: "type" | "value", value: string) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], [field]: value };
    if (field === "type") {
      newActions[index].value = "";
    }
    setActions(newActions);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const renderActionValueInput = (action: WorkflowAction, index: number) => {
    switch (action.type) {
      case "assign":
        return (
          <Select value={action.value} onValueChange={(v) => updateAction(index, "value", v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="round_robin">Round Robin</SelectItem>
              {teamMembers.filter((m: any) => m.status === "active").map((m: any) => (
                <SelectItem key={m.id} value={m.memberId || m.id}>
                  {m.name || m.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "tag":
        return (
          <Select value={action.value} onValueChange={(v) => updateAction(index, "value", v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select tag..." />
            </SelectTrigger>
            <SelectContent>
              {TAGS.map(tag => (
                <SelectItem key={tag} value={tag}>{tag}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "set_status":
        return (
          <Select value={action.value} onValueChange={(v) => updateAction(index, "value", v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select status..." />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map(status => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "set_pipeline":
        return (
          <Select value={action.value} onValueChange={(v) => updateAction(index, "value", v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select stage..." />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_STAGES.map(stage => (
                <SelectItem key={stage} value={stage}>{stage}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "add_note":
        return (
          <Input 
            value={action.value} 
            onChange={(e) => updateAction(index, "value", e.target.value)}
            placeholder="Note text..."
            className="w-[180px]"
          />
        );
      case "set_followup":
        return (
          <Select value={action.value} onValueChange={(v) => updateAction(index, "value", v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Days..." />
            </SelectTrigger>
            <SelectContent>
              {FOLLOWUP_DAYS.map(days => (
                <SelectItem key={days} value={days}>{days} day{days !== "1" ? "s" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      default:
        return null;
    }
  };

  const isUpgradeRequired = error && (error as any).message?.includes("Pro plan");

  if (isUpgradeRequired) {
    return (
      <div className="flex flex-col h-full">
        <Helmet>
          <title>Workflows | WhachatCRM</title>
        </Helmet>
        <div className="p-4 sm:p-6 border-b border-gray-200 bg-gray-50">
          <h1 className="text-xl sm:text-2xl font-display font-bold text-gray-900">Workflows</h1>
          <p className="text-sm text-gray-500 mt-1">Automate your chat management</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <Crown className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Pro Feature</h2>
            <p className="text-gray-600 mb-6">
              Workflow automation is available on the Pro plan. Upgrade to automate chat assignments, tagging, and more.
            </p>
            <Link href="/pricing">
              <Button className="bg-brand-green hover:bg-brand-green/90">
                Upgrade to Pro
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Helmet>
        <title>Workflows | WhachatCRM</title>
      </Helmet>
      
      <div className="p-4 sm:p-6 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-gray-900">Workflows</h1>
            <p className="text-sm text-gray-500 mt-1">Automate your chat management with rules</p>
          </div>
          <Button 
            onClick={() => { resetForm(); setIsDialogOpen(true); }}
            className="bg-brand-green hover:bg-brand-green/90"
            data-testid="button-create-workflow"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Workflow
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-12">
            <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Zap className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No workflows yet</h3>
            <p className="text-gray-500 mb-4">Create your first workflow to automate repetitive tasks</p>
            <Button 
              onClick={() => { resetForm(); setIsDialogOpen(true); }}
              className="bg-brand-green hover:bg-brand-green/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Workflow
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {workflows.map((workflow) => (
              <Collapsible 
                key={workflow.id}
                open={expandedWorkflow === workflow.id}
                onOpenChange={(open) => setExpandedWorkflow(open ? workflow.id : null)}
              >
                <div className={cn(
                  "border rounded-lg transition-colors",
                  workflow.isActive ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50"
                )}>
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center",
                        workflow.isActive ? "bg-brand-green/10" : "bg-gray-100"
                      )}>
                        <Zap className={cn(
                          "h-5 w-5",
                          workflow.isActive ? "text-brand-green" : "text-gray-400"
                        )} />
                      </div>
                      <div>
                        <h3 className={cn(
                          "font-semibold",
                          workflow.isActive ? "text-gray-900" : "text-gray-500"
                        )}>{workflow.name}</h3>
                        <p className="text-sm text-gray-500">
                          {TRIGGER_TYPES.find(t => t.value === workflow.triggerType)?.label}
                          {workflow.executionCount > 0 && (
                            <span className="ml-2 text-xs">
                              • {workflow.executionCount} executions
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleWorkflowMutation.mutate({ 
                          id: workflow.id, 
                          isActive: !workflow.isActive 
                        })}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        data-testid={`button-toggle-workflow-${workflow.id}`}
                      >
                        {workflow.isActive ? (
                          <ToggleRight className="h-6 w-6 text-brand-green" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => openEditDialog(workflow)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        data-testid={`button-edit-workflow-${workflow.id}`}
                      >
                        <Edit2 className="h-4 w-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => deleteWorkflowMutation.mutate(workflow.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        data-testid={`button-delete-workflow-${workflow.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                      <CollapsibleTrigger asChild>
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                          <ChevronDown className={cn(
                            "h-4 w-4 text-gray-500 transition-transform",
                            expandedWorkflow === workflow.id && "rotate-180"
                          )} />
                        </button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                      {workflow.description && (
                        <p className="text-sm text-gray-600 mb-3">{workflow.description}</p>
                      )}
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-gray-500 uppercase">Actions</div>
                        {(workflow.actions as WorkflowAction[]).map((action, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <ArrowRight className="h-3 w-3 text-gray-400" />
                            <span className="text-gray-700">
                              {ACTION_TYPES.find(a => a.value === action.type)?.label}: 
                            </span>
                            <span className="font-medium text-gray-900">{action.value}</span>
                          </div>
                        ))}
                      </div>
                      {workflow.triggerType === "keyword" && workflow.triggerConditions?.keywords && (
                        <div className="mt-3">
                          <div className="text-xs font-medium text-gray-500 uppercase mb-1">Keywords</div>
                          <div className="flex flex-wrap gap-1">
                            {workflow.triggerConditions.keywords.map((kw: string, idx: number) => (
                              <span key={idx} className="px-2 py-0.5 bg-gray-100 rounded text-sm">
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingWorkflow ? "Edit Workflow" : "Create Workflow"}</DialogTitle>
            <DialogDescription>
              Set up automation rules to streamline your workflow
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Workflow Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Auto-assign new chats"
                data-testid="input-workflow-name"
              />
            </div>

            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this workflow do?"
                rows={2}
              />
            </div>

            <div>
              <Label>Trigger</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger data-testid="select-trigger-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map(trigger => (
                    <SelectItem key={trigger.value} value={trigger.value}>
                      <div className="flex items-center gap-2">
                        <trigger.icon className="h-4 w-4" />
                        {trigger.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {TRIGGER_TYPES.find(t => t.value === triggerType)?.description}
              </p>
            </div>

            {triggerType === "keyword" && (
              <div>
                <Label htmlFor="keywords">Keywords (comma-separated)</Label>
                <Input
                  id="keywords"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g., pricing, quote, help"
                  data-testid="input-keywords"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Actions</Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={addAction}
                  data-testid="button-add-action"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Action
                </Button>
              </div>
              <div className="space-y-2">
                {actions.map((action, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <Select 
                      value={action.type} 
                      onValueChange={(v) => updateAction(index, "type", v)}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map(at => (
                          <SelectItem key={at.value} value={at.value}>
                            <div className="flex items-center gap-2">
                              <at.icon className="h-3 w-3" />
                              {at.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {renderActionValueInput(action, index)}
                    {actions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAction(index)}
                        className="h-8 w-8"
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createWorkflowMutation.isPending || updateWorkflowMutation.isPending}
              className="bg-brand-green hover:bg-brand-green/90"
              data-testid="button-save-workflow"
            >
              {(createWorkflowMutation.isPending || updateWorkflowMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingWorkflow ? "Save Changes" : "Create Workflow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
