import { storage } from "./storage";
import { type Chat, type Workflow } from "@shared/schema";
import { subscriptionService } from "./subscriptionService";

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

async function isTemplateWorkflowAllowed(workflow: Workflow): Promise<boolean> {
  const conditions = workflow.triggerConditions as any;
  if (!conditions?.templateKey) return true;

  const user = await storage.getUser(workflow.userId);
  if (!user) return false;

  const plan = (user.subscriptionPlan || "free").toLowerCase();
  const hasPro = plan === "pro" || plan === "scale";
  if (!hasPro) return false;

  const limits = await subscriptionService.getUserLimits(workflow.userId);
  return limits?.hasAIBrainAddon || false;
}

export async function getTemplatePreferences(userId: string): Promise<Record<string, any>> {
  try {
    const prefs = await storage.getUserTemplateDataByKey(
      userId, "realtor-growth-engine", "preferences", "realtor_growth_engine_preferences"
    );
    return (prefs?.definition as Record<string, any>) || {};
  } catch {
    return {};
  }
}

export async function executeWorkflowActions(
  workflow: Workflow,
  chat: Chat,
  triggerData: any = {}
): Promise<{ success: boolean; actionsExecuted: WorkflowAction[] }> {
  const actions = workflow.actions as WorkflowAction[];
  const executedActions: WorkflowAction[] = [];
  
  try {
    if (!(await isTemplateWorkflowAllowed(workflow))) {
      console.log(`[Workflow] Skipping template workflow "${workflow.name}" — Pro+AI subscription inactive for user ${workflow.userId}`);
      return { success: false, actionsExecuted: [] };
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// W2 Buyer Readiness / Financial Qualification Engine
// ─────────────────────────────────────────────────────────────────────────────

function splitKeywords(raw: string): string[] {
  return raw.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some(k => text.includes(k));
}

interface W2Result {
  scoreAdjustment: number;
  qualificationQuestion: string | null;
  fieldUpdates: Record<string, any>;
  signalsDetected: string[];
}

export async function runW2QualificationEngine(
  userId: string,
  chat: Chat,
  message: string
): Promise<W2Result> {
  const prefs = await getTemplatePreferences(userId);
  const def = {
    financialKeywords: "pre approved, preapproved, mortgage, lender, financing, loan, down payment, credit score, cash buyer, cash, fha, va, conventional",
    budgetKeywords: "budget, price range, max price, up to, around, afford, under, over, million",
    timelineKeywords: "asap, immediately, this month, next month, 30 days, 60 days, 90 days, 3 months, soon, just browsing, researching",
    bookingKeywords: "tour, showing, visit, schedule, appointment, call, see property, viewing",
    buyerKeywords: "buy, purchase, looking for, apartment, house, condo",
    askFinancingFollowUp: true,
    askBudgetFollowUp: true,
    askTimelineFollowUp: true,
    limitOneQuestion: true,
    financingQuestion: "Are you currently pre-approved, working with a lender, or still exploring financing options?",
    budgetQuestion: "Do you have a budget or price range in mind?",
    timelineQuestion: "Are you planning to move soon, or are you still exploring options?",
    lenderQuestion: "If helpful, I can also connect you with a lender for pre-approval guidance.",
  };

  const get = (field: string) => prefs[`W2_${field}`] !== undefined ? prefs[`W2_${field}`] : (def as any)[field];

  const msgLower = message.toLowerCase();
  const financialKw = splitKeywords(get("financialKeywords"));
  const budgetKw = splitKeywords(get("budgetKeywords"));
  const timelineKw = splitKeywords(get("timelineKeywords"));
  const bookingKw = splitKeywords(get("bookingKeywords"));
  const buyerKw = splitKeywords(get("buyerKeywords"));

  const signals: string[] = [];
  let score = 0;
  const fieldUpdates: Record<string, any> = {};
  const existingCustomFields = (chat.customFields as Record<string, any>) || {};

  // Lead type detection
  const isBuyer = matchesAny(msgLower, buyerKw);
  if (isBuyer && !existingCustomFields.leadType) {
    fieldUpdates.leadType = "Buyer";
  }

  // Financial / pre-approval signals
  const isPreApproved = /pre.?approv|already approv/i.test(message);
  const isCashBuyer = /cash buyer|paying cash|all cash|no mortgage/i.test(message);
  const isWorkingWithLender = /working with (a |my )?lender|have (a |my )?lender|with (a |my )?realtor/i.test(message) || (matchesAny(msgLower, financialKw) && !isPreApproved && !isCashBuyer);
  const isBrowsing = /just browsing|only browsing|still researching|not ready|not sure yet/i.test(message);

  if (isPreApproved) {
    signals.push("PREAPPROVED_YES");
    score += 30;
    fieldUpdates.preApproved = "yes";
    fieldUpdates.financingType = "mortgage";
  } else if (isCashBuyer) {
    signals.push("CASH_BUYER");
    score += 40;
    fieldUpdates.preApproved = "yes";
    fieldUpdates.financingType = "cash";
  } else if (isWorkingWithLender) {
    signals.push("WORKING_WITH_LENDER");
    score += 20;
    fieldUpdates.lenderConnected = "yes";
    fieldUpdates.financingType = "mortgage";
  } else if (matchesAny(msgLower, financialKw)) {
    signals.push("NEEDS_FINANCING");
    score += 5;
    if (!existingCustomFields.financingType) fieldUpdates.financingType = "unknown";
  }

  // Budget detection
  const budgetMatch = message.match(/\b(\$[\d,]+k?|\d+[\d,]*\s*k\b|\d+[\d,]*\s*million\b)/i);
  if (budgetMatch) {
    signals.push("BUDGET_MENTIONED");
    score += 20;
    fieldUpdates.budgetRange = budgetMatch[0].trim();
  } else if (matchesAny(msgLower, budgetKw)) {
    signals.push("BUDGET_KEYWORD");
    score += 10;
  }

  // Timeline detection
  const isAsap = /asap|immediately|right away|this month|next month|30 days|in a month/i.test(message);
  const is60to90 = /60 days|90 days|3 months|few months/i.test(message);
  if (isAsap) {
    signals.push("TIMELINE_30_DAYS_OR_LESS");
    score += 30;
    fieldUpdates.timeline = "asap";
  } else if (is60to90) {
    signals.push("TIMELINE_60_TO_90_DAYS");
    score += 15;
    fieldUpdates.timeline = "60-90d";
  } else if (isBrowsing) {
    signals.push("JUST_BROWSING");
    score += 5;
    fieldUpdates.timeline = "browsing";
  } else if (matchesAny(msgLower, timelineKw)) {
    signals.push("TIMELINE_KEYWORD");
    score += 8;
  }

  // Booking / high-intent
  const hasBookingIntent = matchesAny(msgLower, bookingKw);
  if (hasBookingIntent) {
    signals.push("BOOKING_INTENT");
  }

  // Cap per-message positive score
  score = Math.min(score, 60);

  // Apply field updates to chat
  if (Object.keys(fieldUpdates).length > 0) {
    const merged = { ...existingCustomFields, ...fieldUpdates };
    try {
      await storage.updateChat(chat.id, { customFields: merged });
    } catch (e) {
      // non-critical — continue
    }
  }

  // Qualification follow-up logic — only for buyers with missing info
  let qualificationQuestion: string | null = null;
  const cf = { ...existingCustomFields, ...fieldUpdates };
  const isQualifiedLead = isBuyer || existingCustomFields.leadType === "Buyer";
  const alreadyUnqualified = chat.pipelineStage === "Unqualified" || chat.tag === "Do Not Contact";

  if (isQualifiedLead && !alreadyUnqualified && !hasBookingIntent) {
    const lastAsked = existingCustomFields._lastQualificationAskedAt;
    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
    const cooldownOk = !lastAsked || new Date(lastAsked).getTime() < twelveHoursAgo;

    if (cooldownOk) {
      const askFinancing = get("askFinancingFollowUp") !== false;
      const askBudget = get("askBudgetFollowUp") !== false;
      const askTimeline = get("askTimelineFollowUp") !== false;
      const limitOne = get("limitOneQuestion") !== false;

      const missingFinancing = !cf.preApproved && !cf.financingType && !isPreApproved && !isCashBuyer && !isWorkingWithLender;
      const missingBudget = !cf.budgetRange && !budgetMatch;
      const missingTimeline = !cf.timeline && !isAsap && !is60to90 && !isBrowsing;

      if (askFinancing && missingFinancing) {
        qualificationQuestion = get("financingQuestion");
      } else if (askBudget && missingBudget && (!limitOne || !missingFinancing || !askFinancing)) {
        qualificationQuestion = get("budgetQuestion");
      } else if (askTimeline && missingTimeline && (!limitOne || (!missingFinancing && !missingBudget))) {
        qualificationQuestion = get("timelineQuestion");
      }

      if (qualificationQuestion) {
        try {
          await storage.updateChat(chat.id, {
            customFields: { ...cf, _lastQualificationAskedAt: new Date().toISOString() }
          });
        } catch (e) { /* non-critical */ }
      }
    }
  }

  return { scoreAdjustment: score, qualificationQuestion, fieldUpdates, signalsDetected: signals };
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
