import { aiProvider } from "./aiProvider";
import { extractWebsiteKnowledgeSummaryText } from "./websiteKnowledgeSummaryNormalize";
import { storage } from "./storage";
import { 
  LEAD_INTENT_KEYWORDS, 
  LEAD_SCORE_THRESHOLDS,
  type AiBusinessKnowledge,
  type AiSettings,
} from "@shared/schema";
import type { AiRoutingResult } from "@shared/aiRouting";
import { resolveAiRouting, routingShouldTriggerHandoff } from "@shared/aiRouting";
import { sanitizeRoboticBuyerReply } from "@shared/buyerQualification";

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
      buyerPreferences?: string;
      buyerQualificationContext?: string;
      inventoryMatchSummary?: string;
      listingFollowUp?: string;
    },
    routing?: AiRoutingResult,
  ): Promise<{ suggestion: string; confidence: number }> {
    const lastMessage = conversationHistory[conversationHistory.length - 1]?.content || "";

    // Don't suggest when there is no real conversational context yet.
    // Trivial openers ("test", "hi", "hey", "hello") give the AI no signal —
    // it will hallucinate qualification questions out of thin air.
    // We suppress suggestions when ALL messages in a short conversation (≤4 messages)
    // are trivial openers, not just when there is one message.
    const TRIVIAL_OPENERS = /^(test|hi|hey|hello|yo|sup|hola|ping|check|checking|ola|shalom|ahlan|مرحبا|שלום|buenos dias|good morning|good afternoon|good evening|gm|gn)[\s!?.]*$/i;
    const inboundMessages = conversationHistory.filter(m => m.role === 'user');
    const allTrivial = inboundMessages.length > 0 && inboundMessages.every(m => TRIVIAL_OPENERS.test((m.content || "").trim()));
    if (allTrivial && conversationHistory.length <= 4) {
      return { suggestion: "", confidence: 0 };
    }

    const detectedLanguage = language || await this.detectMessageLanguage(lastMessage);
    const isFirstMessage = conversationHistory.length <= 2;
    const systemPrompt = this.buildSystemPrompt(businessKnowledge, settings, tone, detectedLanguage, contactContext, isFirstMessage, routing);
    
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
      
      const rawReply = result.reply || "";
      return {
        suggestion: sanitizeRoboticBuyerReply(rawReply),
        confidence: result.confidence || 0.7,
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
    
    const extractionPrompt = `You are a lead data extraction system. Extract ONLY information that is explicitly stated in the conversation.
Do not infer, guess, or fill in missing details. If a field is not clearly stated, return null.

Business context: ${businessKnowledge?.businessName || "Unknown business"} - ${businessKnowledge?.industry || "General"}
${(businessKnowledge as any)?.websiteKnowledgeSummary ? `\nPublic website context (may be incomplete): ${String((businessKnowledge as any).websiteKnowledgeSummary).slice(0, 2000)}` : ""}

Conversation:
${limitedHistory.map(m => `${m.role}: ${m.content}`).join("\n")}

Extract and return a JSON object with these fields (use null for unknown):
- name: Customer's name
- email: Email address
- phone: Phone number
- budget: Budget mentioned
- timeline: Timeline/urgency
- location: Location mentioned
- intent: Primary intent, using the customer's words when possible (e.g. "pricing", "availability", "quote", "booking"). If unclear, null.
- score: Lead quality score 0-100 based ONLY on explicit signals present (do not inflate). If unclear, 25.
- status: Lead status (new, warm, hot, unqualified) based ONLY on explicit signals present. If unclear, "new".

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
${(businessKnowledge as any)?.websiteKnowledgeSummary ? `\nWebsite context (may be incomplete): ${String((businessKnowledge as any).websiteKnowledgeSummary).slice(0, 2000)}` : ""}

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

  async generateAIMemory(
    messages: Array<{ direction: 'inbound' | 'outbound'; content: string }>,
    intel: {
      intent: string;
      budget: string | null;
      timeline: string | null;
      financing: string | null;
    }
  ): Promise<string> {
    if (!messages || messages.length === 0) return '';

    // Use last 10 messages for context
    const recent = messages.slice(-10);
    const conversation = recent
      .map(m => `${m.direction === 'inbound' ? 'Lead' : 'Agent'}: ${m.content}`)
      .join('\n');

    const intelLines = [
      intel.intent    ? `Detected intent: ${intel.intent}` : null,
      intel.budget    ? `Budget: ${intel.budget}`           : null,
      intel.timeline  ? `Timeline: ${intel.timeline}`       : null,
      intel.financing ? `Financing: ${intel.financing}`     : null,
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are a CRM assistant helping businesses understand customer conversations and decide clear next steps.
Write a short, natural 1–2 sentence summary of what this customer wants, based on the conversation.

Rules:
- Write like a human note an agent would read at a glance
- Be specific about what the lead asked or mentioned
- Do NOT use labels like "Intent:", "Budget:", "Buyer:", "Investor:"
- Do NOT say "Interested in Investor" or "Interested in Seller" — those are awkward
- If they are an investor, say "Investor looking for..." 
- If they asked about a listing, say "Inquired about..."
- If they want to buy, say "Looking to buy..."
- Mention budget or timeline naturally if known (e.g. "around $500k", "within 2 months")
- Keep it under 2 sentences
- Return ONLY the summary text, no JSON, no labels`;

    const userPrompt = `Conversation:
${conversation}

${intelLines ? `Extracted signals:\n${intelLines}` : ''}

Write a short natural summary of what this lead wants.`;

    try {
      const response = await aiProvider.complete("summarization", [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ]);

      const text = (response || '').trim();
      // Strip any JSON wrappers if model returns them anyway
      if (text.startsWith('{')) {
        try {
          const parsed = JSON.parse(text);
          return parsed.summary || parsed.memory || 'Customer inquiring about details.';
        } catch { /* not JSON */ }
      }
      return text || 'Customer inquiring about details.';
    } catch (error) {
      console.error('[AI] Error generating AI memory:', error);
      return 'Customer inquiring about details.';
    }
  }

  async checkHandoffNeeded(
    message: string,
    settings?: AiSettings
  ): Promise<{ shouldHandoff: boolean; reason?: string }> {
    const routing = resolveAiRouting({
      inbound: message,
      handoffKeywords: settings?.handoffKeywords ?? undefined,
    });

    if (routingShouldTriggerHandoff(routing)) {
      return { shouldHandoff: true, reason: routing.reason };
    }

    return { shouldHandoff: false };
  }

  /** Turn noisy extracted site text into a bounded summary for CRM / Copilot context. */
  async summarizeWebsiteKnowledgeForBrain(combinedPlainText: string): Promise<string> {
    const body = combinedPlainText.trim().slice(0, 88_000);
    if (!body) return "No readable content was extracted from the provided pages.";

    const prompt = `You are building a concise CRM knowledge note from text extracted from a business website (HTML removed; may contain navigation noise).

Output requirements:
- Use short paragraphs or bullet lists.
- Include concrete facts about products, services, pricing cues, FAQs, shipping, returns, contact methods — only if supported by the text.
- Do NOT invent policies, prices, or guarantees not explicitly supported by the text.
- If the content is mostly marketing fluff with few facts, say that briefly.
- Maximum length 4000 characters.
- Use the same dominant language as the source when obvious; otherwise English.

Return JSON only: { "summary": "..." }`;

    try {
      const response = await aiProvider.complete(
        "summarization",
        [
          { role: "system", content: "You return only valid JSON." },
          { role: "user", content: `${prompt}\n\n--- EXTRACTED TEXT ---\n${body}` },
        ],
        { jsonMode: true, maxTokens: 2000 },
      );
      const trimmed = (response || "").trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed || "{}");
      } catch {
        return (
          extractWebsiteKnowledgeSummaryText(trimmed).slice(0, 4000) ||
          trimmed.slice(0, 4000) ||
          "Unable to summarize this website content."
        );
      }
      const s = extractWebsiteKnowledgeSummaryText(parsed).trim();
      return (
        s.slice(0, 4000) ||
        extractWebsiteKnowledgeSummaryText(trimmed).slice(0, 4000) ||
        trimmed.slice(0, 4000) ||
        "Unable to summarize this website content."
      );
    } catch (e) {
      console.error("[AI] website knowledge summarize failed", e);
      return body.slice(0, 4000);
    }
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
      buyerPreferences?: string;
      buyerQualificationContext?: string;
      inventoryMatchSummary?: string;
      listingFollowUp?: string;
    },
    isFirstMessage?: boolean,
    routing?: AiRoutingResult,
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

    const bookingUrl = String(businessKnowledge?.bookingLink || "").trim();
    const bookingContextLine = bookingUrl
      ? `\n- Self-scheduling (Calendly): ${bookingUrl}`
      : "\n- Self-scheduling: not configured (no public booking URL for this workspace).";

    const isInfoSeekingRouting =
      routing?.reason === "info_seeking_qualify" ||
      routing?.signals?.includes("info_seeking") === true;

    let prompt = isRealEstate
      ? `You are an experienced buyer's agent replying on behalf of ${businessKnowledge?.businessName || "the team"} (${businessKnowledge?.industry || "real estate"}).

LANGUAGE: ${langInstruction}
TONE: ${toneDesc} — like a confident local agent texting a client: warm, direct, human. Never sound like a call center, chatbot, or virtual assistant.`
      : `You are a conversion-focused sales assistant replying on behalf of the agent at ${businessKnowledge?.businessName || "a business"} (${businessKnowledge?.industry || "general industry"}).

LANGUAGE: ${langInstruction}
TONE: Be ${toneDesc} — concise, human, and commercially sharp.`;

    prompt += `

YOUR GOAL: ${businessKnowledge?.salesGoals || "Move the lead forward toward qualification or a next action."}

BUSINESS CONTEXT:
- Services/Products: ${businessKnowledge?.servicesProducts || "Not specified"}
- Location: ${businessKnowledge?.locations || "Available online"}
- Hours: ${businessKnowledge?.businessHours || "Standard hours"}${bookingContextLine}
${(() => {
  const wk = (businessKnowledge as any)?.websiteKnowledgeSummary as string | undefined | null;
  if (!wk || !String(wk).trim()) return "";
  const cap = String(wk).trim().slice(0, 3500);
  return `

WEBSITE KNOWLEDGE (from the merchant's public site — may be incomplete; verify critical facts with the customer when unsure):
${cap}`;
})()}
${contactContext ? `LEAD CRM CONTEXT (use this to personalize your reply):
${contactContext.name ? `- Lead name: ${contactContext.name}` : ''}
${contactContext.pipelineStage ? `- Pipeline stage: ${contactContext.pipelineStage}` : ''}
${contactContext.leadScore ? `- Lead score: ${contactContext.leadScore}` : ''}
${contactContext.intent ? `- Detected intent: ${contactContext.intent}` : ''}
${contactContext.budget ? `- Budget (already mentioned): ${contactContext.budget} — DO NOT ask for budget again` : ''}
${contactContext.timeline ? `- Timeline (already mentioned): ${contactContext.timeline} — DO NOT ask for timeline again` : ''}
${contactContext.financing ? `- Financing (already mentioned): ${contactContext.financing} — DO NOT ask about financing again` : ''}
${contactContext.notes ? `- Agent notes: ${contactContext.notes}` : ''}
${contactContext.buyerPreferences ? `\n${contactContext.buyerPreferences}\nUse these preferences when relevant. Do not re-ask for details already captured unless the customer contradicts them.` : ''}
${contactContext.buyerQualificationContext ? `\n${contactContext.buyerQualificationContext}` : ''}
${contactContext.inventoryMatchSummary ? `\n${contactContext.inventoryMatchSummary}` : ''}
${contactContext.listingFollowUp ? `\n${contactContext.listingFollowUp}\nThe customer is asking for more details about a listing already shared — continue that listing thread.` : ''}
` : ''}CORE RULES — READ CAREFULLY:

1. READ THE FULL CONVERSATION before replying. Extract what is already known from the customer's messages (goals, constraints, preferences, and what they've already shared).

2. NEVER ask for information that was already provided in the conversation. Reference it instead.

3. WRITE ONE USEFUL REPLY — not a template, not a form, not a generic opener.
   Structure: [brief acknowledgment of what they said] + [one smart next-step question or action]
   
4. KEEP IT SHORT: 1–2 sentences unless the context demands more. Never exceed 3 sentences.

5. FORBIDDEN phrases — do not use any of these:
   - "Thank you for your inquiry"
   - "How can I assist you today?"
   - "Could you provide more details?"
   - "I'd be happy to help"
   - "Let me check" / "Let me verify" / "I'll check" / "I will check"
   - "I'll get back to you shortly" / "follow up shortly" / "send the options shortly"
   - "I'll compile a selection" / "compile options" / "gather options"
   - "selection of homes" / "for your convenience" / "at your convenience"
   - "Waiting for approval" / "I'm waiting for approval"
   - Exact match counts ("I found 10 properties", "I found 5 listings")
   - "I searched our listings" / "searching our listings"
   - Repeating the last question the agent already asked${isRealEstate ? `
   - Anything that sounds like a virtual assistant, concierge, or ticket system` : ""}${isInfoSeekingRouting ? `
   - "Let's discuss during our meeting" / "during our meeting" / "at our meeting"
   - Any mention of scheduling, booking, or meeting unless the customer explicitly asked to book/schedule/call
   - Generic marketing blurbs without a specific qualifying question` : ""}

${isRealEstate ? `5b. PREFERRED phrasing (real estate — use naturally, do not force all in one reply):
   - "A few homes look like a strong fit"
   - "There are a couple good options"
   - "Let me send the best matches"
   - "We may have some strong candidates"
   - "Happy to walk you through the best fits"
   - Never promise timing you cannot control ("shortly", "in a moment")` : ""}

6. ADVANCE THE CONVERSATION — every reply must do one of:
   - Clarify lead intent or interest
   - Move toward the appropriate next step (qualify, human handoff, or booking — see ROUTING below)
   - Clarify the single most important missing detail for the next step (only if it is relevant and not already answered)
   - Confirm next step or route them to action

7. ASK ONLY ONE QUESTION — the single most useful next question. Not a list.${isFirstMessage ? `

FIRST MESSAGE RULE: This is the very start of the conversation. The lead has just made contact.
- DO NOT jump to budget, timeline, or financing questions — there is no relationship yet.
- Respond with a warm, natural acknowledgment of what they said.
- Ask ONE simple, open-ended question to understand why they reached out.
- Example: if they said "hi" or something vague, reply warmly and ask what brings them here today.
- Never cold-open with qualification questions on a first message.` : ""}

${routing?.promptGuidance ? `ROUTING (follow strictly — do not skip to booking unless routing allows it):
${routing.promptGuidance}` : ""}

${bookingUrl && routing?.decision === "BOOK_APPOINTMENT" && !routing.needsRoutingClarification ? `SCHEDULING LINK (Calendly — customer wants to book/schedule):
- You may share the scheduling URL at most once in this conversation when appropriate.
- Use a short intro line, then a blank line, then the URL alone on its own line (no brackets, no placeholder tokens). Example shape:
  Sure — you can pick a time here:

  ${bookingUrl}

  I’ll make sure we have the right details ready.
- Never invent or alter the URL; copy it exactly as given above.` : bookingUrl ? `SCHEDULING / BOOKING:
- A scheduling URL exists but routing does NOT allow sending it in this reply (customer may need human help or clarification first).
- Do NOT paste the booking URL.
- Ask a clarifying or qualifying question, or acknowledge handoff to a team member.` : `SCHEDULING / BOOKING:
- No self-service scheduling URL is configured. Do NOT invent, guess, or paste booking URLs (including Google Calendar links).
- If they want to book, acknowledge and say your team will follow up with times, or ask what times work — do not claim they can self-book online unless a link was already shared earlier in this thread.`}`;

    if (isRealEstate) {
      prompt += `

REAL ESTATE SPECIFIC:
- Always identify which property/area the lead is interested in and reference it by name if mentioned
- Prioritize: answer their question → human callback when they ask to speak with someone → viewing/booking only when they want to schedule
- Do NOT send a booking link when they ask to speak with an advisor/agent unless they confirm they want to schedule${isInfoSeekingRouting ? `
- INFO-SEEKING: qualify interest first (buy/rent/invest, area, goals). Do NOT mention viewings, meetings, or booking yet.` : `
- Qualification order: intent (buy/rent/invest) → budget → timeline → financing → occupancy → motivation
- If viewing intent is shown: "Want to see a few this week?" / "Weekday or weekend work better?"
- If budget unknown: "What price range are you trying to stay in?"
- If timeline unknown: "When are you hoping to move?"
- If financing unclear: "Are you pre-approved, paying cash, or still working on financing?"`}
- Never ask about something already mentioned (e.g., if they named a property, don't ask which property)
- Write like an experienced buyer's agent in the market — conversational, confident, never like a search bot or virtual assistant

BUYER QUALIFICATION (critical — follow Buyer qualification assessment above if present):
- Ask ONLY ONE question per reply — never a form-style list of questions
- LOW tier: do NOT claim matches. Ask the single suggested next question in your own natural words.
- MEDIUM tier: acknowledge known criteria briefly (area, beds, pool, budget if known), then ask ONE confirmation or gap question. Do NOT state exact match counts or say you are compiling/gathering options.
- INVENTORY MODE / HIGH tier: criteria are complete and/or matches exist — EXIT qualification. Offer top matches, property details, a shortlist, or a showing. NEVER widen/broaden the search, reconfirm budget, or reconfirm beds/baths.
- MEDIUM tier: ask ONE gap question only — never widen/broaden or reconfirm criteria already in Known criteria
- If property type changed (e.g. condo → house), only reference the current type — never mention old types
- Prefer confident agent phrasing: "A few homes look strong", "Let me send the best matches", "Happy to walk you through the best fits"
- Avoid: "compile a selection", "gather options", "for your convenience", "shortly", "I'll check"
${contactContext?.inventoryMatchSummary ? `
- Matching inventory context is internal — follow qualification tier rules before mentioning listings` : ""}

EXAMPLE — how to reply to: "The one on 5th Avenue with the garden."
BAD: "Thank you! Could you provide more details about which listing?"  
GOOD: "Got it — the 5th Avenue place with the garden. Want to set up a showing, or still comparing a few options?"

EXAMPLE — buyer asks for 5/4 house with pool in Pompano $1M–$1.5M (HIGH tier, matches exist):
BAD: "Should I keep the search at $1M–$1.5M with these features, or would you like to widen it a bit?"
BAD: "Should I keep the search at $1M–$1.5M with 5-bed/4-bath minimum, or widen it a bit?"
BAD: "I'll compile a selection of homes for your convenience and send the options shortly."
GOOD: "Got it — house with a pool in Pompano, $1M–$1.5M, 5 bed / 4 bath. A few homes look like a strong fit — want me to send the best matches?"
GOOD: "I found several homes that match those criteria. Would you like me to send the top options?"`;
    }

    // Business-defined qualification criteria — override the generic goal when present
    const qualifyingQuestions = (businessKnowledge as any)?.qualifyingQuestions as Array<{
      key?: string; label?: string; question: string; required?: boolean;
    }> | undefined;
    const hasCustomCriteria = Array.isArray(qualifyingQuestions) && qualifyingQuestions.length > 0;
    if (hasCustomCriteria) {
      prompt += `

QUALIFICATION CRITERIA — This business qualifies leads using these specific questions (in priority order):
${qualifyingQuestions!.map((q, i) => `${i + 1}. [${q.label || `Q${i+1}`}] "${q.question}"${q.required ? ' (required)' : ' (optional)'}`).join('\n')}

When replying, work through these qualification questions in order. Ask only ONE at a time. Skip any that have already been answered in the conversation.`;
    }

    if (businessKnowledge?.customInstructions) {
      prompt += `\n\nADDITIONAL INSTRUCTIONS: ${businessKnowledge.customInstructions}`;
    }

    prompt += `\n\nRespond with valid JSON only: { "reply": "your reply in the correct language", "confidence": 0.0-1.0 }`;

    return prompt;
  }
}

export const aiService = new AIService();
