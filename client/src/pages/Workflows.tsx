import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { 
  Zap, Plus, Trash2, Edit2, ToggleLeft, ToggleRight, 
  ArrowRight, User, Tag, Clock, FileText, ChevronDown,
  Loader2, AlertCircle, Crown, Play, History, Mail, Send,
  MessageSquare, Users, Pause, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface DripCampaign {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  triggerType: string;
  triggerConfig: any;
  createdAt: string;
  updatedAt: string;
  steps?: DripStep[];
  enrollments?: DripEnrollment[];
}

interface DripStep {
  id: string;
  campaignId: string;
  stepOrder: number;
  delayMinutes: number;
  messageContent: string;
  messageType: string;
  templateId: string | null;
  createdAt: string;
}

interface DripEnrollment {
  id: string;
  campaignId: string;
  chatId: string;
  currentStepOrder: number;
  status: string;
  enrolledAt: string;
  nextSendAt: string | null;
  completedAt: string | null;
}

export function Workflows() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("workflows");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);
  
  // Workflow form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("new_chat");
  const [keywords, setKeywords] = useState("");
  const [actions, setActions] = useState<WorkflowAction[]>([{ type: "assign", value: "round_robin" }]);

  // Drip campaign state
  const [isDripDialogOpen, setIsDripDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<DripCampaign | null>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignSteps, setCampaignSteps] = useState<Array<{ delayMinutes: number; messageContent: string }>>([
    { delayMinutes: 0, messageContent: "" }
  ]);

  // Enroll chat dialog
  const [isEnrollDialogOpen, setIsEnrollDialogOpen] = useState(false);
  const [enrollCampaignId, setEnrollCampaignId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState("");

  const { data: workflows = [], isLoading, error } = useQuery<Workflow[]>({
    queryKey: ["/api/workflows"],
    retry: false,
  });

  const { data: dripCampaigns = [], isLoading: isLoadingCampaigns, error: campaignsError } = useQuery<DripCampaign[]>({
    queryKey: ["/api/drip-campaigns"],
    retry: false,
  });

  const { data: chats = [] } = useQuery<any[]>({
    queryKey: ["/api/chats"],
    retry: false,
  });

  const { data: teamMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/team/members"],
    retry: false,
  });

  // Workflow mutations
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

  // Drip campaign mutations
  const createCampaignMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/drip-campaigns", data);
      return res.json();
    },
    onSuccess: async (campaign) => {
      // Add steps to the campaign
      for (let i = 0; i < campaignSteps.length; i++) {
        const step = campaignSteps[i];
        if (step.messageContent.trim()) {
          await apiRequest("POST", `/api/drip-campaigns/${campaign.id}/steps`, {
            stepOrder: i + 1,
            delayMinutes: step.delayMinutes,
            messageContent: step.messageContent,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      toast({ title: "Campaign created successfully" });
      resetCampaignForm();
      setIsDripDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateCampaignMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/drip-campaigns/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      toast({ title: "Campaign updated successfully" });
      resetCampaignForm();
      setIsDripDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/drip-campaigns/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      toast({ title: "Campaign deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleCampaignMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/drip-campaigns/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const enrollChatMutation = useMutation({
    mutationFn: async ({ campaignId, chatId }: { campaignId: string; chatId: string }) => {
      const res = await apiRequest("POST", `/api/drip-campaigns/${campaignId}/enroll`, { chatId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      toast({ title: "Contact enrolled in campaign" });
      setIsEnrollDialogOpen(false);
      setSelectedChatId("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelEnrollmentMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const res = await apiRequest("POST", `/api/drip-enrollments/${enrollmentId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      toast({ title: "Enrollment cancelled" });
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

  const resetCampaignForm = () => {
    setCampaignName("");
    setCampaignDescription("");
    setCampaignSteps([{ delayMinutes: 0, messageContent: "" }]);
    setEditingCampaign(null);
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

  const openEditCampaignDialog = async (campaign: DripCampaign) => {
    // Fetch full campaign details with steps
    try {
      const res = await apiRequest("GET", `/api/drip-campaigns/${campaign.id}`);
      const fullCampaign = await res.json();
      setEditingCampaign(fullCampaign);
      setCampaignName(fullCampaign.name);
      setCampaignDescription(fullCampaign.description || "");
      if (fullCampaign.steps && fullCampaign.steps.length > 0) {
        setCampaignSteps(fullCampaign.steps.map((s: DripStep) => ({
          delayMinutes: s.delayMinutes,
          messageContent: s.messageContent,
        })));
      }
      setIsDripDialogOpen(true);
    } catch (error) {
      toast({ title: "Error loading campaign", variant: "destructive" });
    }
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

  const handleCampaignSubmit = () => {
    if (!campaignName.trim()) {
      toast({ title: "Please enter a campaign name", variant: "destructive" });
      return;
    }

    const validSteps = campaignSteps.filter(s => s.messageContent.trim());
    if (validSteps.length === 0) {
      toast({ title: "Please add at least one message step", variant: "destructive" });
      return;
    }

    const data = {
      name: campaignName,
      description: campaignDescription || null,
      triggerType: "manual",
    };

    if (editingCampaign) {
      updateCampaignMutation.mutate({ id: editingCampaign.id, ...data });
    } else {
      createCampaignMutation.mutate(data);
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

  const addCampaignStep = () => {
    setCampaignSteps([...campaignSteps, { delayMinutes: 60, messageContent: "" }]);
  };

  const updateCampaignStep = (index: number, field: "delayMinutes" | "messageContent", value: any) => {
    const newSteps = [...campaignSteps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setCampaignSteps(newSteps);
  };

  const removeCampaignStep = (index: number) => {
    if (campaignSteps.length > 1) {
      setCampaignSteps(campaignSteps.filter((_, i) => i !== index));
    }
  };

  const formatDelay = (minutes: number) => {
    if (minutes === 0) return "Immediately";
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} hr`;
    return `${Math.round(minutes / 1440)} day${Math.round(minutes / 1440) > 1 ? "s" : ""}`;
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
            <h1 className="text-xl sm:text-2xl font-display font-bold text-gray-900">Automation</h1>
            <p className="text-sm text-gray-500 mt-1">Workflows & message sequences</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b border-gray-200 px-4 sm:px-6">
          <TabsList className="h-12 bg-transparent border-0 p-0 gap-6">
            <TabsTrigger 
              value="workflows" 
              className="h-12 px-0 border-b-2 border-transparent data-[state=active]:border-brand-green data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none"
            >
              <Zap className="h-4 w-4 mr-2" />
              Workflows
            </TabsTrigger>
            <TabsTrigger 
              value="drip" 
              className="h-12 px-0 border-b-2 border-transparent data-[state=active]:border-brand-green data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none"
            >
              <Mail className="h-4 w-4 mr-2" />
              Drip Sequences
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="workflows" className="flex-1 overflow-auto m-0">
          <div className="p-4 sm:p-6">
            <div className="flex justify-end mb-4">
              <Button 
                onClick={() => { resetForm(); setIsDialogOpen(true); }}
                className="bg-brand-green hover:bg-brand-green/90"
                data-testid="button-create-workflow"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Workflow
              </Button>
            </div>

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
                        <div className="px-4 pb-4 pt-0 border-t border-gray-100">
                          <div className="mt-4 space-y-3">
                            <div>
                              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Actions</h4>
                              <div className="space-y-2">
                                {(workflow.actions as WorkflowAction[])?.map((action, i) => {
                                  const actionType = ACTION_TYPES.find(a => a.value === action.type);
                                  return (
                                    <div key={i} className="flex items-center gap-2 text-sm">
                                      {actionType && <actionType.icon className="h-4 w-4 text-gray-400" />}
                                      <span>{actionType?.label}</span>
                                      <span className="text-gray-500">→ {action.value}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            {workflow.lastExecutedAt && (
                              <div className="text-xs text-gray-400">
                                Last run: {new Date(workflow.lastExecutedAt).toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="drip" className="flex-1 overflow-auto m-0">
          <div className="p-4 sm:p-6">
            <div className="flex justify-end mb-4">
              <Button 
                onClick={() => { resetCampaignForm(); setIsDripDialogOpen(true); }}
                className="bg-brand-green hover:bg-brand-green/90"
                data-testid="button-create-campaign"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Sequence
              </Button>
            </div>

            {isLoadingCampaigns ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : dripCampaigns.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Mail className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No sequences yet</h3>
                <p className="text-gray-500 mb-4 max-w-sm mx-auto">
                  Create automated message sequences to nurture leads over time with scheduled follow-ups.
                </p>
                <Button 
                  onClick={() => { resetCampaignForm(); setIsDripDialogOpen(true); }}
                  className="bg-brand-green hover:bg-brand-green/90"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Sequence
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {dripCampaigns.map((campaign) => (
                  <Collapsible 
                    key={campaign.id}
                    open={expandedCampaign === campaign.id}
                    onOpenChange={(open) => setExpandedCampaign(open ? campaign.id : null)}
                  >
                    <div className={cn(
                      "border rounded-lg transition-colors",
                      campaign.isActive ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50"
                    )}>
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-10 w-10 rounded-lg flex items-center justify-center",
                            campaign.isActive ? "bg-blue-50" : "bg-gray-100"
                          )}>
                            <Mail className={cn(
                              "h-5 w-5",
                              campaign.isActive ? "text-blue-600" : "text-gray-400"
                            )} />
                          </div>
                          <div>
                            <h3 className={cn(
                              "font-semibold",
                              campaign.isActive ? "text-gray-900" : "text-gray-500"
                            )}>{campaign.name}</h3>
                            <p className="text-sm text-gray-500">
                              {campaign.steps?.length || 0} steps
                              {campaign.enrollments && campaign.enrollments.length > 0 && (
                                <span className="ml-2">
                                  • {campaign.enrollments.filter(e => e.status === "active").length} active
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEnrollCampaignId(campaign.id);
                              setIsEnrollDialogOpen(true);
                            }}
                            disabled={!campaign.isActive}
                            className="h-8"
                          >
                            <Users className="h-3 w-3 mr-1" />
                            Enroll
                          </Button>
                          <button
                            onClick={() => toggleCampaignMutation.mutate({ 
                              id: campaign.id, 
                              isActive: !campaign.isActive 
                            })}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            data-testid={`button-toggle-campaign-${campaign.id}`}
                          >
                            {campaign.isActive ? (
                              <ToggleRight className="h-6 w-6 text-brand-green" />
                            ) : (
                              <ToggleLeft className="h-6 w-6 text-gray-400" />
                            )}
                          </button>
                          <button
                            onClick={() => openEditCampaignDialog(campaign)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            data-testid={`button-edit-campaign-${campaign.id}`}
                          >
                            <Edit2 className="h-4 w-4 text-gray-500" />
                          </button>
                          <button
                            onClick={() => deleteCampaignMutation.mutate(campaign.id)}
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                            data-testid={`button-delete-campaign-${campaign.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                          <CollapsibleTrigger asChild>
                            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                              <ChevronDown className={cn(
                                "h-4 w-4 text-gray-500 transition-transform",
                                expandedCampaign === campaign.id && "rotate-180"
                              )} />
                            </button>
                          </CollapsibleTrigger>
                        </div>
                      </div>
                      <CollapsibleContent>
                        <div className="px-4 pb-4 pt-0 border-t border-gray-100">
                          <div className="mt-4 space-y-4">
                            {campaign.steps && campaign.steps.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Message Steps</h4>
                                <div className="space-y-2">
                                  {campaign.steps.map((step, i) => (
                                    <div key={step.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                                      <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium shrink-0">
                                        {i + 1}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-700 line-clamp-2">{step.messageContent}</p>
                                        <p className="text-xs text-gray-400 mt-1">
                                          <Clock className="h-3 w-3 inline mr-1" />
                                          {formatDelay(step.delayMinutes)} after previous
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {campaign.enrollments && campaign.enrollments.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Enrolled Contacts</h4>
                                <div className="space-y-2">
                                  {campaign.enrollments.map((enrollment) => {
                                    const chat = chats.find(c => c.id === enrollment.chatId);
                                    return (
                                      <div key={enrollment.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                        <div className="flex items-center gap-2">
                                          <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                                            <User className="h-4 w-4 text-gray-500" />
                                          </div>
                                          <div>
                                            <p className="text-sm font-medium">{chat?.name || "Unknown"}</p>
                                            <p className="text-xs text-gray-500">
                                              Step {enrollment.currentStepOrder} • {enrollment.status}
                                            </p>
                                          </div>
                                        </div>
                                        {enrollment.status === "active" && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => cancelEnrollmentMutation.mutate(enrollment.id)}
                                            className="h-7 text-xs text-red-500 hover:text-red-600"
                                          >
                                            <X className="h-3 w-3 mr-1" />
                                            Cancel
                                          </Button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Workflow Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingWorkflow ? "Edit Workflow" : "Create Workflow"}</DialogTitle>
            <DialogDescription>
              Set up automated actions when specific events occur
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <div>
              <Label className="text-xs sm:text-sm">Name</Label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="e.g., Auto-assign new leads"
                className="mt-1"
                data-testid="input-workflow-name"
              />
            </div>

            <div>
              <Label className="text-xs sm:text-sm">Description (optional)</Label>
              <Input 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                placeholder="What does this workflow do?"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs sm:text-sm">When this happens:</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger className="mt-1" data-testid="select-trigger-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <t.icon className="h-4 w-4" />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {triggerType === "keyword" && (
              <div>
                <Label className="text-xs sm:text-sm">Keywords (comma separated)</Label>
                <Input 
                  value={keywords} 
                  onChange={(e) => setKeywords(e.target.value)} 
                  placeholder="price, quote, order"
                  className="mt-1"
                  data-testid="input-keywords"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs sm:text-sm">Do this:</Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={addAction}
                  className="h-7 text-xs px-2"
                  data-testid="button-add-action"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {actions.map((action, index) => (
                  <div key={index} className="p-2 bg-gray-50 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <Select 
                        value={action.type} 
                        onValueChange={(v) => updateAction(index, "type", v)}
                      >
                        <SelectTrigger className="flex-1 h-8 text-xs">
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
                      {actions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAction(index)}
                          className="h-7 w-7 shrink-0"
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      )}
                    </div>
                    <div className="pl-0">
                      {renderActionValueInput(action, index)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-2 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-9 text-sm">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createWorkflowMutation.isPending || updateWorkflowMutation.isPending}
              className="bg-brand-green hover:bg-brand-green/90 h-9 text-sm"
              data-testid="button-save-workflow"
            >
              {(createWorkflowMutation.isPending || updateWorkflowMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingWorkflow ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drip Campaign Dialog */}
      <Dialog open={isDripDialogOpen} onOpenChange={(open) => { if (!open) resetCampaignForm(); setIsDripDialogOpen(open); }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingCampaign ? "Edit Sequence" : "Create Sequence"}</DialogTitle>
            <DialogDescription>
              Build an automated message sequence to nurture contacts
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <div>
              <Label className="text-xs sm:text-sm">Sequence Name</Label>
              <Input 
                value={campaignName} 
                onChange={(e) => setCampaignName(e.target.value)} 
                placeholder="e.g., Welcome Series"
                className="mt-1"
                data-testid="input-campaign-name"
              />
            </div>

            <div>
              <Label className="text-xs sm:text-sm">Description (optional)</Label>
              <Input 
                value={campaignDescription} 
                onChange={(e) => setCampaignDescription(e.target.value)} 
                placeholder="What's this sequence for?"
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs sm:text-sm">Message Steps</Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={addCampaignStep}
                  className="h-7 text-xs px-2"
                  data-testid="button-add-step"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Step
                </Button>
              </div>
              <div className="space-y-3">
                {campaignSteps.map((step, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
                          {index + 1}
                        </div>
                        <span className="text-sm font-medium">Step {index + 1}</span>
                      </div>
                      {campaignSteps.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCampaignStep(index)}
                          className="h-7 w-7"
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      )}
                    </div>
                    
                    <div>
                      <Label className="text-xs text-gray-500">Delay</Label>
                      <Select 
                        value={String(step.delayMinutes)} 
                        onValueChange={(v) => updateCampaignStep(index, "delayMinutes", parseInt(v))}
                      >
                        <SelectTrigger className="mt-1 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Immediately</SelectItem>
                          <SelectItem value="5">5 minutes</SelectItem>
                          <SelectItem value="30">30 minutes</SelectItem>
                          <SelectItem value="60">1 hour</SelectItem>
                          <SelectItem value="180">3 hours</SelectItem>
                          <SelectItem value="360">6 hours</SelectItem>
                          <SelectItem value="720">12 hours</SelectItem>
                          <SelectItem value="1440">1 day</SelectItem>
                          <SelectItem value="2880">2 days</SelectItem>
                          <SelectItem value="4320">3 days</SelectItem>
                          <SelectItem value="10080">1 week</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs text-gray-500">Message</Label>
                      <Textarea 
                        value={step.messageContent}
                        onChange={(e) => updateCampaignStep(index, "messageContent", e.target.value)}
                        placeholder="Enter your message..."
                        className="mt-1 text-sm"
                        rows={3}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-2 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDripDialogOpen(false)} className="h-9 text-sm">
              Cancel
            </Button>
            <Button 
              onClick={handleCampaignSubmit}
              disabled={createCampaignMutation.isPending || updateCampaignMutation.isPending}
              className="bg-brand-green hover:bg-brand-green/90 h-9 text-sm"
              data-testid="button-save-campaign"
            >
              {(createCampaignMutation.isPending || updateCampaignMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingCampaign ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll Chat Dialog */}
      <Dialog open={isEnrollDialogOpen} onOpenChange={setIsEnrollDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enroll Contact</DialogTitle>
            <DialogDescription>
              Select a contact to add to this message sequence
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label>Select Contact</Label>
            <Select value={selectedChatId} onValueChange={setSelectedChatId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose a contact..." />
              </SelectTrigger>
              <SelectContent>
                {chats.filter(c => c.whatsappPhone).map((chat) => (
                  <SelectItem key={chat.id} value={chat.id}>
                    {chat.name} {chat.whatsappPhone && `(${chat.whatsappPhone})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chats.filter(c => c.whatsappPhone).length === 0 && (
              <p className="text-sm text-gray-500 mt-2">
                No contacts with WhatsApp numbers available.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEnrollDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (enrollCampaignId && selectedChatId) {
                  enrollChatMutation.mutate({ campaignId: enrollCampaignId, chatId: selectedChatId });
                }
              }}
              disabled={!selectedChatId || enrollChatMutation.isPending}
              className="bg-brand-green hover:bg-brand-green/90"
            >
              {enrollChatMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
