import { aiProvider } from "./aiProvider";
import { storage } from "./storage";
import { 
  LEAD_INTENT_KEYWORDS, 
  LEAD_SCORE_THRESHOLDS,
  type AiBusinessKnowledge,
  type AiSettings,
} from "@shared/schema";

export type SupportedAiLanguage = "en" | "he" | "es" | "ar";

const LANGUAGE_PROMPTS: Record<SupportedAiLanguage, { instruction: string; name: string }> = {
  en: { instruction: "Respond in English.", name: "English" },
  he: { instruction: "השב בעברית. Respond in Hebrew using natural, conversational Hebrew.", name: "Hebrew" },
  es: { instruction: "Responde en español. Respond in Spanish using neutral, Latin American Spanish.", name: "Spanish" },
  ar: { instruction: "الرد باللغة العربية. Respond in Arabic using Modern Standard Arabic.", name: "Arabic" },
};

export class AIService {
  
  async detectMessageLanguage(message: string): Promise<SupportedAiLanguage> {
    const hebrewPattern = /[\u0590-\u05FF]/;
    const arabicPattern = /[\u0600-\u06FF]/;
    const spanishPattern = /[áéíóúüñ¿¡]/i;
    
    if (hebrewPattern.test(message)) return "he";
    if (arabicPattern.test(message)) return "ar";
    if (spanishPattern.test(message)) return "es";
    
    return "en";
  }
  
  async suggestReply(
    userId: string,
    chatId: string,
    conversationHistory: Array<{ role: string; content: string }>,
    businessKnowledge?: AiBusinessKnowledge,
    settings?: AiSettings,
    tone?: "neutral" | "friendly" | "professional" | "sales",
    language?: SupportedAiLanguage,
    contactContext?: {
      name?: string;
      tag?: string;
      pipelineStage?: string;
      notes?: string;
      budget?: string;
      timeline?: string;
      financing?: string;
      intent?: string;
      leadScore?: string;
    }
  ): Promise<{ suggestion: string; confidence: number }> {
    const lastMessage = conversationHistory[conversationHistory.length - 1]?.content || "";
    const detectedLanguage = language || await this.detectMessageLanguage(lastMessage);
    const systemPrompt = this.buildSystemPrompt(businessKnowledge, settings, tone, detectedLanguage, contactContext);
    
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
    // Optimization: Only send the last 8 messages for extraction to save tokens
    const limitedHistory = conversationHistory.slice(-8);
    
    const extractionPrompt = `You are a lead data extraction AI. Analyze this conversation and extract any customer information.

Business context: ${businessKnowledge?.businessName || "Unknown business"} - ${businessKnowledge?.industry || "General"}

Conversation:
${limitedHistory.map(m => `${m.role}: ${m.content}`).join("\n")}

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
    tone?: "neutral" | "friendly" | "professional" | "sales",
    language?: SupportedAiLanguage,
    contactContext?: {
      name?: string;
      tag?: string;
      pipelineStage?: string;
      notes?: string;
      budget?: string;
      timeline?: string;
      financing?: string;
      intent?: string;
      leadScore?: string;
    }
  ): string {
    const langInstruction = language ? LANGUAGE_PROMPTS[language].instruction : LANGUAGE_PROMPTS.en.instruction;
    const industry = (businessKnowledge?.industry || "general").toLowerCase();
    const isRealEstate = industry.includes("real estate") || industry.includes("realestate") || industry.includes("property") || industry.includes("realtor");

    const persona = settings?.aiPersona || "professional";
    const toneGuide: Record<string, string> = {
      neutral: "warm and direct",
      friendly: "warm, natural, and personable",
      professional: "professional and confident",
      sales: "commercially sharp and conversion-focused",
    };
    const personaGuide: Record<string, string> = {
      professional: "confident and professional",
      friendly: "warm and approachable",
      casual: "natural and casual",
      formal: "formal and precise",
    };
    const toneDesc = tone ? (toneGuide[tone] || "warm and direct") : (personaGuide[persona] || "warm and direct");

    let prompt = `You are a conversion-focused sales assistant replying on behalf of the agent at ${businessKnowledge?.businessName || "a business"} (${businessKnowledge?.industry || "general industry"}).

LANGUAGE: ${langInstruction}
TONE: Be ${toneDesc} — concise, human, and commercially sharp.

YOUR GOAL: ${businessKnowledge?.salesGoals || "Move the lead forward toward qualification or a next action."}

BUSINESS CONTEXT:
- Services/Products: ${businessKnowledge?.servicesProducts || "Not specified"}
- Location: ${businessKnowledge?.locations || "Available online"}
- Hours: ${businessKnowledge?.businessHours || "Standard hours"}${businessKnowledge?.bookingLink ? `\n- Booking: ${businessKnowledge.bookingLink}` : ""}

${contactContext ? `LEAD CRM CONTEXT (use this to personalize your reply):
${contactContext.name ? `- Lead name: ${contactContext.name}` : ''}
${contactContext.pipelineStage ? `- Pipeline stage: ${contactContext.pipelineStage}` : ''}
${contactContext.leadScore ? `- Lead score: ${contactContext.leadScore}` : ''}
${contactContext.intent ? `- Detected intent: ${contactContext.intent}` : ''}
${contactContext.budget ? `- Budget (already mentioned): ${contactContext.budget} — DO NOT ask for budget again` : ''}
${contactContext.timeline ? `- Timeline (already mentioned): ${contactContext.timeline} — DO NOT ask for timeline again` : ''}
${contactContext.financing ? `- Financing (already mentioned): ${contactContext.financing} — DO NOT ask about financing again` : ''}
${contactContext.notes ? `- Agent notes: ${contactContext.notes}` : ''}
` : ''}CORE RULES — READ CAREFULLY:

1. READ THE FULL CONVERSATION before replying. Extract what is already known: property interest, intent, budget, timeline, name, location.

2. NEVER ask for information that was already provided in the conversation. Reference it instead.

3. WRITE ONE USEFUL REPLY — not a template, not a form, not a generic opener.
   Structure: [brief acknowledgment of what they said] + [one smart next-step question or action]
   
4. KEEP IT SHORT: 1–2 sentences unless the context demands more. Never exceed 3 sentences.

5. FORBIDDEN phrases — do not use any of these:
   - "Thank you for your inquiry"
   - "How can I assist you today?"
   - "Could you provide more details?"
   - "I'd be happy to help"
   - Repeating the last question the agent already asked

6. ADVANCE THE CONVERSATION — every reply must do one of:
   - Clarify lead intent or interest
   - Move toward a viewing / meeting / booking
   - Uncover budget, timeline, or financing readiness
   - Confirm next step or route them to action

7. ASK ONLY ONE QUESTION — the single most useful next question. Not a list.`;

    if (isRealEstate) {
      prompt += `

REAL ESTATE SPECIFIC:
- Always identify which property/area the lead is interested in and reference it by name if mentioned
- Prioritize moving toward: property viewing > callback > details > qualification
- Qualification order: intent (buy/rent/invest) → budget → timeline → financing
- If viewing intent is shown: "Would you like to book a viewing this week?" / "Weekday or weekend works better for you?"
- If budget unknown: "Do you have a target price range in mind?" 
- If timeline unknown: "What kind of timeline are you working with?"
- If financing unclear: "Are you already pre-approved, or still exploring financing options?"
- Never ask about something already mentioned (e.g., if they named a property, don't ask which property)

EXAMPLE — how to reply to: "The one on 5th Avenue with the garden."
BAD: "Thank you! Could you provide more details about which listing?"  
GOOD: "Got it — the 5th Avenue property with the garden. Are you looking to schedule a viewing, or still comparing options right now?"`;
    }

    if (businessKnowledge?.customInstructions) {
      prompt += `\n\nADDITIONAL INSTRUCTIONS: ${businessKnowledge.customInstructions}`;
    }

    prompt += `\n\nRespond with valid JSON only: { "reply": "your reply in the correct language", "confidence": 0.0-1.0 }`;

    return prompt;
  }
}

export const aiService = new AIService();
