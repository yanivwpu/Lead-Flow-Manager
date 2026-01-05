import { storage } from "./storage";
import { type Chat, type Workflow } from "@shared/schema";

export interface WorkflowAction {
  type: "assign" | "tag" | "set_status" | "set_pipeline" | "add_note" | "set_followup";
  value: string;
}

export interface WorkflowCondition {
  keywords?: string[];
  tags?: string[];
  assignmentRoundRobin?: boolean;
  noReplyMinutes?: number;
}

export async function executeWorkflowActions(
  workflow: Workflow,
  chat: Chat,
  triggerData: any = {}
): Promise<{ success: boolean; actionsExecuted: WorkflowAction[] }> {
  const actions = workflow.actions as WorkflowAction[];
  const executedActions: WorkflowAction[] = [];
  
  try {
    for (const action of actions) {
      switch (action.type) {
        case "assign":
          if (action.value === "round_robin") {
            const teamMembers = await storage.getTeamMembers(workflow.userId);
            const activeMembers = teamMembers.filter(m => m.status === "active" && m.memberId);
            if (activeMembers.length > 0) {
              const randomIndex = Math.floor(Math.random() * activeMembers.length);
              const assignee = activeMembers[randomIndex];
              await storage.updateChat(chat.id, { assignedTo: assignee.memberId });
              executedActions.push({ type: "assign", value: assignee.memberId || "unassigned" });
            }
          } else if (action.value) {
            await storage.updateChat(chat.id, { assignedTo: action.value });
            executedActions.push(action);
          }
          break;
          
        case "tag":
          if (action.value) {
            await storage.updateChat(chat.id, { tag: action.value });
            executedActions.push(action);
          }
          break;
          
        case "set_status":
          if (action.value) {
            await storage.updateChat(chat.id, { status: action.value });
            executedActions.push(action);
          }
          break;
          
        case "set_pipeline":
          if (action.value) {
            await storage.updateChat(chat.id, { pipelineStage: action.value });
            executedActions.push(action);
          }
          break;
          
        case "add_note":
          if (action.value) {
            const currentNotes = chat.notes || "";
            const timestamp = new Date().toLocaleString();
            const newNote = currentNotes 
              ? `${currentNotes}\n\n[${timestamp}] ${action.value}`
              : `[${timestamp}] ${action.value}`;
            await storage.updateChat(chat.id, { notes: newNote });
            executedActions.push(action);
          }
          break;
          
        case "set_followup":
          if (action.value) {
            const days = parseInt(action.value) || 1;
            const followUpDate = new Date();
            followUpDate.setDate(followUpDate.getDate() + days);
            await storage.updateChat(chat.id, { 
              followUpDate,
              followUp: `${days} day${days > 1 ? 's' : ''}`
            });
            executedActions.push(action);
          }
          break;
      }
    }
    
    await storage.incrementWorkflowExecution(workflow.id);
    await storage.logWorkflowExecution({
      workflowId: workflow.id,
      chatId: chat.id,
      triggerData,
      actionsExecuted: executedActions,
      status: "success",
    });
    
    return { success: true, actionsExecuted: executedActions };
  } catch (error: any) {
    console.error("Workflow execution error:", error);
    await storage.logWorkflowExecution({
      workflowId: workflow.id,
      chatId: chat.id,
      triggerData,
      actionsExecuted: executedActions,
      status: "failed",
      errorMessage: error.message,
    });
    return { success: false, actionsExecuted: executedActions };
  }
}

export async function triggerNewChatWorkflows(userId: string, chat: Chat): Promise<void> {
  try {
    const workflows = await storage.getActiveWorkflowsByTrigger(userId, "new_chat");
    for (const workflow of workflows) {
      await executeWorkflowActions(workflow, chat, { trigger: "new_chat" });
    }
  } catch (error) {
    console.error("Error triggering new chat workflows:", error);
  }
}

export async function triggerKeywordWorkflows(userId: string, chat: Chat, message: string): Promise<void> {
  try {
    const workflows = await storage.getActiveWorkflowsByTrigger(userId, "keyword");
    for (const workflow of workflows) {
      const conditions = workflow.triggerConditions as WorkflowCondition;
      const keywords = conditions?.keywords || [];
      const messageLower = message.toLowerCase();
      
      const keywordMatched = keywords.some(keyword => 
        messageLower.includes(keyword.toLowerCase())
      );
      
      if (keywordMatched) {
        await executeWorkflowActions(workflow, chat, { 
          trigger: "keyword", 
          message,
          matchedKeywords: keywords.filter(k => messageLower.includes(k.toLowerCase()))
        });
      }
    }
  } catch (error) {
    console.error("Error triggering keyword workflows:", error);
  }
}

export async function triggerTagChangeWorkflows(userId: string, chat: Chat, oldTag: string, newTag: string): Promise<void> {
  try {
    const workflows = await storage.getActiveWorkflowsByTrigger(userId, "tag_change");
    for (const workflow of workflows) {
      const conditions = workflow.triggerConditions as WorkflowCondition;
      const targetTags = conditions?.tags || [];
      
      if (targetTags.length === 0 || targetTags.includes(newTag)) {
        await executeWorkflowActions(workflow, chat, { 
          trigger: "tag_change", 
          oldTag,
          newTag 
        });
      }
    }
  } catch (error) {
    console.error("Error triggering tag change workflows:", error);
  }
}
