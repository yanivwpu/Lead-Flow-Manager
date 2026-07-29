import OpenAI from "openai";
import { resolveOpenAiApiKey } from "@shared/openaiApiKey";

export type AIProviderType = "openai" | "anthropic" | "google";
export type AIModelCapability = "reply" | "extraction" | "summarization" | "automation";

export interface AIProviderConfig {
  provider: AIProviderType;
  model: string;
  maxTokens?: number;
}

export interface AIModelRegistry {
  reply: AIProviderConfig;
  extraction: AIProviderConfig;
  summarization: AIProviderConfig;
  automation: AIProviderConfig;
}

const DEFAULT_MODEL_REGISTRY: AIModelRegistry = {
  reply: { provider: "openai", model: "gpt-4o", maxTokens: 250 },
  extraction: { provider: "openai", model: "gpt-4o-mini", maxTokens: 400 },
  summarization: { provider: "openai", model: "gpt-4o-mini", maxTokens: 400 },
  automation: { provider: "openai", model: "gpt-4o", maxTokens: 1000 },
};

function buildOpenAiClient(): OpenAI {
  const resolved = resolveOpenAiApiKey();
  if (!resolved.ok) {
    // Construct with a placeholder; complete() will throw the actionable reason.
    return new OpenAI({
      apiKey: "missing-openai-key",
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return new OpenAI({
    apiKey: resolved.apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

export class AIProvider {
  private openaiClient: OpenAI;
  private modelRegistry: AIModelRegistry;

  constructor() {
    this.openaiClient = buildOpenAiClient();
    this.modelRegistry = { ...DEFAULT_MODEL_REGISTRY };
  }

  getModelConfig(capability: AIModelCapability): AIProviderConfig {
    return this.modelRegistry[capability];
  }

  setModelConfig(capability: AIModelCapability, config: AIProviderConfig): void {
    this.modelRegistry[capability] = config;
  }

  private ensureOpenAiKey(): void {
    const resolved = resolveOpenAiApiKey();
    if (!resolved.ok) {
      throw new Error(resolved.reason);
    }
    // Rebuild client if env was corrected after boot (e.g. tests).
    this.openaiClient = new OpenAI({
      apiKey: resolved.apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }

  async complete(
    capability: AIModelCapability,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options?: {
      jsonMode?: boolean;
      maxTokens?: number;
      returnUsage?: boolean;
    }
  ): Promise<string | { content: string; usage?: { promptTokens: number; completionTokens: number } }> {
    const config = this.getModelConfig(capability);
    
    if (config.provider === "openai") {
      this.ensureOpenAiKey();
      return this.openaiComplete(config, messages, options);
    }
    
    throw new Error(`Provider ${config.provider} not yet implemented`);
  }

  private async openaiComplete(
    config: AIProviderConfig,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options?: { jsonMode?: boolean; maxTokens?: number; returnUsage?: boolean }
  ): Promise<string | { content: string; usage?: { promptTokens: number; completionTokens: number } }> {
    try {
      const response = await this.openaiClient.chat.completions.create({
        model: config.model,
        messages,
        max_completion_tokens: options?.maxTokens || config.maxTokens || 500,
        ...(options?.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      });

      const content = response.choices[0]?.message?.content || "";
      if (options?.returnUsage) {
        return {
          content,
          usage: {
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
          },
        };
      }
      return content;
    } catch (error) {
      // Do not log prompt/response bodies (may include Gmail-derived conversation text).
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[AIProvider] Error with ${config.provider}/${config.model}:`,
        errMsg.slice(0, 240),
      );
      throw error;
    }
  }
}

export const aiProvider = new AIProvider();
