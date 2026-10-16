import { resolveChatbotCompletionRouting } from "@shared/chatbotCompletionContext";
import { detectConversationLanguage } from "@shared/conversationLanguage";
import type { AiSettings, AiBusinessKnowledge } from "@shared/schema";
import type { TestChatMessage } from "@shared/aiTestChat";
import {
  createShoppingService,
  type CommerceShoppingProvider,
  type ShoppingSessionStore,
} from "../shopping/service";
import { createShoppingSuggestion } from "../shopping/suggestion";
import type { ShoppingSettings } from "@shared/shoppingAssistant";
import type { aiService } from "../aiService";
/** Same AI Brain method, router and shopping action; only the inbound/state adapter differs. */
export function createTestChatGenerator(deps: {
  ai: Pick<typeof aiService, "suggestReply">;
  commerce: CommerceShoppingProvider;
  settings: (id: string) => Promise<ShoppingSettings>;
  entitled: (id: string) => Promise<boolean>;
  knowledge: (id: string) => Promise<AiBusinessKnowledge | undefined>;
  aiSettings: (id: string) => Promise<AiSettings | undefined>;
  meter: (id: string) => Promise<void>;
}) {
  return async (input: {
    userId: string;
    sessionId: string;
    history: TestChatMessage[];
    sessions: ShoppingSessionStore;
  }) => {
    const latest = input.history.at(-1)!;
    const config = await deps.aiSettings(input.userId);
    const knowledge = await deps.knowledge(input.userId);
    const detected = detectConversationLanguage(latest.content);
    const prior = input.history
      .filter((m) => m.role === "user")
      .slice(0, -1)
      .reverse()
      .map((m) => detectConversationLanguage(m.content))
      .find((d) => d.confident);
    const locale = detected.confident ? detected.code : (prior?.code ?? "en");
    const shopping = createShoppingService({
      commerce: deps.commerce,
      sessions: input.sessions,
      settings: deps.settings,
      entitled: deps.entitled,
    });
    const suggestion = createShoppingSuggestion({
      settings: deps.settings,
      latestInbound: async (userId, conversationId) =>
        userId === input.userId && conversationId === input.sessionId
          ? { id: latest.id, content: latest.content }
          : undefined,
      turn: (turn) => shopping.turn(turn),
    });
    const routing = resolveChatbotCompletionRouting({
      inbound: latest.content,
      history: input.history,
      handoffKeywords: config?.handoffKeywords ?? undefined,
      industry: knowledge?.industry ?? undefined,
    });
    const result = await deps.ai.suggestReply(
      input.userId,
      input.sessionId,
      input.history,
      knowledge,
      config,
      undefined,
      locale,
      { leadSource: "webchat", conversationLanguage: locale },
      routing,
      "webchat",
      { shoppingSuggestion: suggestion },
    );
    if (result.modelGenerationSucceeded && result.suggestion.trim())
      await deps.meter(input.userId);
    return (
      result.suggestion ||
      "No AI response was generated. Check AI Brain configuration and try again."
    );
  };
}
