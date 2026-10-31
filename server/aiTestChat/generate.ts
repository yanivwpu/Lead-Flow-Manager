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
import { privateTestShoppingSettings } from "./shoppingAllowance";
import { shoppingLocale } from "@shared/shoppingAssistant";
import { explicitStoreProductQuestion } from "@shared/shopperProductGuard";
/** Product queries must never inherit unrelated business-plan answers in private Test Chat. */
const privateProductFallback = {
  en: "I couldn't verify a Shopify product match and its current price and availability. Check the catalog and try another product search. I won't provide unverified prices or stock.",
  es: "No pude verificar un producto de Shopify con su precio y disponibilidad actuales. Comprueba el catálogo y vuelve a buscar. No daré precios ni existencias sin verificar.",
  he: "לא הצלחתי לאמת מוצר ב-Shopify ואת המחיר והזמינות העדכניים. בדקו את הקטלוג ונסו חיפוש נוסף. לא אציג מחיר או מלאי שלא אומתו.",
} as const;
/** Same AI Brain method, router and shopping action; only the inbound/state adapter differs. */
export function createTestChatGenerator(deps: {
  ai: Pick<typeof aiService, "suggestReply">;
  commerce: CommerceShoppingProvider;
  settings: (id: string) => Promise<ShoppingSettings>;
  entitled: (id: string) => Promise<boolean>;
  privateShoppingAllowed?: (id: string) => Promise<boolean>;
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
    const privateShopping = await deps.privateShoppingAllowed?.(input.userId) ?? false;
    const settings = async (id: string) => privateTestShoppingSettings(
      await deps.settings(id), privateShopping && id === input.userId,
    );
    const shopping = createShoppingService({
      commerce: deps.commerce,
      sessions: input.sessions,
      settings: async id => ({...await settings(id),checkoutEnabled:!privateShopping}),
      entitled: deps.entitled,
      catalogTitleDiscovery: privateShopping,
      // Pure preview: this generator has no provider/cart capability or customer-message sender.
      ...(privateShopping ? {} : {
        checkout: async () => ({status:"ready" as const}),
        checkoutPreview: true,
      }),
    });
    const suggestion = createShoppingSuggestion({
      settings,
      latestInbound: async (userId, conversationId) =>
        userId === input.userId && conversationId === input.sessionId
          ? { id: latest.id, content: latest.content }
          : undefined,
      turn: (turn) => shopping.turn(turn),
    });
    // Private transport only: enforce catalog-first, never generic-company-pricing
    // fallback for an explicit shopper product question (including when AI mode is off).
    if (explicitStoreProductQuestion(latest.content)) {
      const product = await suggestion({
        userId: input.userId, conversationId: input.sessionId,
        text: latest.content, channel: "webchat", locale,
      });
      if (product) return product.reply;
      return privateProductFallback[shoppingLocale(locale)];
    }
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
