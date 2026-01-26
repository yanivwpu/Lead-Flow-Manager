import { aiProvider } from "./aiProvider";
import { storage } from "./storage";
import { 
  LEAD_INTENT_KEYWORDS, 
  LEAD_SCORE_THRESHOLDS,
  type AiBusinessKnowledge,
  type AiSettings,
} from "@shared/schema";

export class AIService {
  
  async suggestReply(
    userId: string,
    chatId: string,
    conversationHistory: Array<{ role: string; content: string }>,
    businessKnowledge?: AiBusinessKnowledge,
    settings?: AiSettings,
    tone?: "neutral" | "friendly" | "professional" | "sales"
  ): Promise<{ suggestion: string; confidence: number }> {
    const systemPrompt = this.buildSystemPrompt(businessKnowledge, settings, tone);
    
    try {
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content
        }))
      ];

      const response = await aiProvider.complete("reply", messages, { jsonMode: true });
      const result = JSON.parse(response || "{}");
      
      return {
        suggestion: result.reply || "I'll be happy to help you with that.",
        confidence: result.confidence || 0.7
      };
    } catch (error) {
      console.error("[AI] Error generating suggestion:", error);
      return { suggestion: "", confidence: 0 };
    }
  }

  async extractLeadData(
    conversationHistory: Array<{ role: string; content: string }>,
    businessKnowledge?: AiBusinessKnowledge
  ): Promise<{
    name?: string;
    email?: string;
    phone?: string;
    budget?: string;
    timeline?: string;
    location?: string;
    intent?: string;
    score: number;
    status: string;
  }> {
    const extractionPrompt = `You are a lead data extraction AI. Analyze this conversation and extract any customer information.

Business context: ${businessKnowledge?.businessName || "Unknown business"} - ${businessKnowledge?.industry || "General"}

Conversation:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join("\n")}

Extract and return a JSON object with these fields (use null for unknown):
- name: Customer's name
- email: Email address
- phone: Phone number
- budget: Budget mentioned
- timeline: Timeline/urgency
- location: Location mentioned
- intent: Primary intent (price, availability, quote, book, interested)
- score: Lead quality score 0-100
- status: Lead status (new, warm, hot, unqualified)

Return only valid JSON.`;

    try {
      const response = await aiProvider.complete("extraction", [
        { role: "user", content: extractionPrompt }
      ], { jsonMode: true });

      const result = JSON.parse(response || "{}");
      return {
        name: result.name || undefined,
        email: result.email || undefined,
        phone: result.phone || undefined,
        budget: result.budget || undefined,
        timeline: result.timeline || undefined,
        location: result.location || undefined,
        intent: result.intent || undefined,
        score: result.score || 25,
        status: result.status || "new"
      };
    } catch (error) {
      console.error("[AI] Error extracting lead data:", error);
      return { score: 25, status: "new" };
    }
  }

  async generateQualifyingQuestion(
    industry: string,
    collectedData: Record<string, any>,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<string | null> {
    const questionPrompt = `You are a lead qualification AI for a ${industry} business.

Already collected information:
${JSON.stringify(collectedData, null, 2)}

Recent conversation:
${conversationHistory.slice(-4).map(m => `${m.role}: ${m.content}`).join("\n")}

If there's important qualifying information still missing, generate ONE natural follow-up question to ask.
If enough information is collected, return null.

Return JSON: { "question": "your question" } or { "question": null }`;

    try {
      const response = await aiProvider.complete("extraction", [
        { role: "user", content: questionPrompt }
      ], { jsonMode: true });

      const result = JSON.parse(response || "{}");
      return result.question || null;
    } catch (error) {
      console.error("[AI] Error generating qualifying question:", error);
      return null;
    }
  }

  async generateAutomation(
    plainEnglishInput: string,
    businessKnowledge?: AiBusinessKnowledge
  ): Promise<{
    triggers: Array<{ type: string; conditions: Record<string, any> }>;
    actions: Array<{ type: string; config: Record<string, any> }>;
    description: string;
  }> {
    const automationPrompt = `You are an automation builder AI. Convert this plain English request into a workflow automation.

Business: ${businessKnowledge?.businessName || "Unknown"} (${businessKnowledge?.industry || "General"})

User request: "${plainEnglishInput}"

Available triggers:
- new_chat: When a new conversation starts
- keyword_detected: When message contains specific keywords
- tag_changed: When a chat's tag is updated

Available actions:
- send_message: Send a message (config: { message: string })
- ask_question: Ask a qualifying question (config: { question: string })
- apply_tag: Apply a tag (config: { tag: string })
- move_pipeline: Move to pipeline stage (config: { stage: string })
- notify_salesperson: Notify team member (config: { message: string })
- trigger_webhook: Call external URL (config: { url: string })
- schedule_followup: Schedule follow-up (config: { delay: string })

Return JSON with:
- triggers: Array of {type, conditions}
- actions: Array of {type, config}
- description: Human-readable description of the workflow`;

    try {
      const response = await aiProvider.complete("automation", [
        { role: "user", content: automationPrompt }
      ], { jsonMode: true });

      const result = JSON.parse(response || "{}");
      return {
        triggers: result.triggers || [],
        actions: result.actions || [],
        description: result.description || plainEnglishInput
      };
    } catch (error) {
      console.error("[AI] Error generating automation:", error);
      return {
        triggers: [],
        actions: [],
        description: plainEnglishInput
      };
    }
  }

  async summarizeConversation(
    conversationHistory: Array<{ role: string; content: string }>,
    businessKnowledge?: AiBusinessKnowledge
  ): Promise<string> {
    const summaryPrompt = `Summarize this customer conversation in 2-3 sentences. Focus on:
- What the customer wants
- Key information shared
- Current status/next steps

Business: ${businessKnowledge?.businessName || "Unknown"}

Conversation:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join("\n")}

Return JSON: { "summary": "your summary" }`;

    try {
      const response = await aiProvider.complete("summarization", [
        { role: "user", content: summaryPrompt }
      ], { jsonMode: true });

      const result = JSON.parse(response || "{}");
      return result.summary || "Unable to generate summary.";
    } catch (error) {
      console.error("[AI] Error summarizing conversation:", error);
      return "Unable to generate summary.";
    }
  }

  async checkHandoffNeeded(
    message: string,
    settings?: AiSettings
  ): Promise<{ shouldHandoff: boolean; reason?: string }> {
    const keywords = settings?.handoffKeywords || ["call me", "human", "agent", "speak to someone"];
    const lowerMessage = message.toLowerCase();
    
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return { shouldHandoff: true, reason: `Customer requested: "${keyword}"` };
      }
    }
    
    return { shouldHandoff: false };
  }

  private buildSystemPrompt(
    businessKnowledge?: AiBusinessKnowledge, 
    settings?: AiSettings,
    tone?: "neutral" | "friendly" | "professional" | "sales"
  ): string {
    const toneGuide = {
      neutral: "balanced and helpful, neither too formal nor too casual",
      friendly: "warm, personable, and conversational with a touch of enthusiasm",
      professional: "formal, courteous, and business-like with clear communication",
      sales: "persuasive and solution-focused, highlighting value and benefits while being consultative"
    };
    
    const toneDesc = tone ? toneGuide[tone] : null;
    
    const persona = settings?.aiPersona || "professional";
    const personaDesc = {
      professional: "professional and courteous",
      friendly: "warm and friendly",
      casual: "casual and approachable",
      formal: "formal and business-like"
    }[persona] || "professional and courteous";
    
    let prompt = `You are an AI assistant for ${businessKnowledge?.businessName || "a business"}. 
Be ${toneDesc || personaDesc} in your responses.

Your goal: ${businessKnowledge?.salesGoals || "Help customers with their inquiries"}

Business details:
- Industry: ${businessKnowledge?.industry || "General"}
- Products/Services: ${businessKnowledge?.servicesProducts || "Various products and services"}
- Business Hours: ${businessKnowledge?.businessHours || "Standard business hours"}
- Location: ${businessKnowledge?.locations || "Available online"}`;

    if (businessKnowledge?.bookingLink) {
      prompt += `\n- Booking Link: ${businessKnowledge.bookingLink}`;
    }

    if (businessKnowledge?.customInstructions) {
      prompt += `\n\nSpecial instructions: ${businessKnowledge.customInstructions}`;
    }

    prompt += `\n\nRespond with JSON: { "reply": "your response", "confidence": 0.0-1.0 }
Keep responses concise (under 200 words). Be helpful but don't make promises you can't keep.`;

    return prompt;
  }
}

export const aiService = new AIService();
