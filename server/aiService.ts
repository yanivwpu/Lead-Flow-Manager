import OpenAI from "openai";
import { storage } from "./storage";
import { 
  LEAD_INTENT_KEYWORDS, 
  LEAD_SCORE_THRESHOLDS,
  AI_USAGE_LIMITS,
  type AiBusinessKnowledge,
  type AiSettings,
  type Chat
} from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// AI Service for WhachatCRM AI Brain
export class AIService {
  
  // Generate a reply suggestion based on conversation context
  async suggestReply(
    userId: string,
    chatId: string,
    conversationHistory: Array<{ role: string; content: string }>,
    businessKnowledge?: AiBusinessKnowledge,
    settings?: AiSettings
  ): Promise<{ suggestion: string; confidence: number }> {
    const systemPrompt = this.buildSystemPrompt(businessKnowledge, settings);
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content
          }))
        ],
        max_completion_tokens: 500,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || "{}");
      
      return {
        suggestion: result.reply || "I'll be happy to help you with that.",
        confidence: result.confidence || 0.7
      };
    } catch (error) {
      console.error("[AI] Error generating suggestion:", error);
      return { suggestion: "", confidence: 0 };
    }
  }

  // Extract lead data from conversation
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
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "user", content: extractionPrompt }],
        max_completion_tokens: 500,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || "{}");
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

  // Generate qualifying questions based on industry and collected data
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
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "user", content: questionPrompt }],
        max_completion_tokens: 200,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || "{}");
      return result.question || null;
    } catch (error) {
      console.error("[AI] Error generating qualifying question:", error);
      return null;
    }
  }

  // Convert plain English to workflow automation
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
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "user", content: automationPrompt }],
        max_completion_tokens: 1000,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || "{}");
      return {
        triggers: result.triggers || [],
        actions: result.actions || [],
        description: result.description || plainEnglishInput
      };
    } catch (error) {
      console.error("[AI] Error generating automation:", error);
      return { triggers: [], actions: [], description: plainEnglishInput };
    }
  }

  // Summarize conversation
  async summarizeConversation(
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          { 
            role: "system", 
            content: "Summarize this customer conversation in 2-3 sentences. Focus on: customer intent, key information shared, and current status." 
          },
          { 
            role: "user", 
            content: conversationHistory.map(m => `${m.role}: ${m.content}`).join("\n") 
          }
        ],
        max_completion_tokens: 200
      });

      return response.choices[0]?.message?.content || "No summary available.";
    } catch (error) {
      console.error("[AI] Error summarizing conversation:", error);
      return "Unable to generate summary.";
    }
  }

  // Check if handoff is needed
  checkForHandoff(
    message: string,
    handoffKeywords: string[] = ["call me", "human", "agent", "speak to someone"]
  ): boolean {
    const lowerMessage = message.toLowerCase();
    return handoffKeywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
  }

  // Detect lead intent from message
  detectIntent(message: string): string | null {
    const lowerMessage = message.toLowerCase();
    
    for (const [intent, keywords] of Object.entries(LEAD_INTENT_KEYWORDS)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        return intent;
      }
    }
    return null;
  }

  // Build system prompt with business knowledge
  private buildSystemPrompt(
    businessKnowledge?: AiBusinessKnowledge,
    settings?: AiSettings
  ): string {
    const persona = settings?.aiPersona || "professional";
    const personaInstructions = {
      professional: "Be professional, helpful, and concise.",
      friendly: "Be warm, friendly, and conversational.",
      casual: "Be casual and relaxed while still being helpful."
    };

    let prompt = `You are an AI assistant for ${businessKnowledge?.businessName || "a business"}.

Persona: ${personaInstructions[persona as keyof typeof personaInstructions] || personaInstructions.professional}

`;

    if (businessKnowledge) {
      if (businessKnowledge.industry) {
        prompt += `Industry: ${businessKnowledge.industry}\n`;
      }
      if (businessKnowledge.servicesProducts) {
        prompt += `Services/Products: ${businessKnowledge.servicesProducts}\n`;
      }
      if (businessKnowledge.businessHours) {
        prompt += `Business Hours: ${businessKnowledge.businessHours}\n`;
      }
      if (businessKnowledge.bookingLink) {
        prompt += `Booking Link: ${businessKnowledge.bookingLink}\n`;
      }
      if (businessKnowledge.salesGoals) {
        prompt += `Goal: ${businessKnowledge.salesGoals}\n`;
      }
      if (businessKnowledge.customInstructions) {
        prompt += `\nSpecial Instructions: ${businessKnowledge.customInstructions}\n`;
      }
    }

    prompt += `
IMPORTANT RULES:
- Never give medical, legal, or financial advice
- Never make misleading offers
- If customer asks to speak to a human, acknowledge and inform them someone will be in touch
- Focus on the business goal: ${businessKnowledge?.salesGoals || "help the customer"}

Return JSON with: { "reply": "your response", "confidence": 0.0-1.0 }`;

    return prompt;
  }
}

// Export singleton instance
export const aiService = new AIService();
