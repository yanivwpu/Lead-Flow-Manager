import OpenAI from "openai";

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

export class AIProvider {
  private openaiClient: OpenAI;
  private modelRegistry: AIModelRegistry;

  constructor() {
    this.openaiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    this.modelRegistry = { ...DEFAULT_MODEL_REGISTRY };
  }

  getModelConfig(capability: AIModelCapability): AIProviderConfig {
    return this.modelRegistry[capability];
  }

  setModelConfig(capability: AIModelCapability, config: AIProviderConfig): void {
    this.modelRegistry[capability] = config;
  }

  async complete(
    capability: AIModelCapability,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options?: {
      jsonMode?: boolean;
      maxTokens?: number;
    }
  ): Promise<string> {
    const config = this.getModelConfig(capability);
    
    if (config.provider === "openai") {
      return this.openaiComplete(config, messages, options);
    }
    
    throw new Error(`Provider ${config.provider} not yet implemented`);
  }

  private async openaiComplete(
    config: AIProviderConfig,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options?: { jsonMode?: boolean; maxTokens?: number }
  ): Promise<string> {
    try {
      const response = await this.openaiClient.chat.completions.create({
        model: config.model,
        messages,
        max_completion_tokens: options?.maxTokens || config.maxTokens || 500,
        ...(options?.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      console.error(`[AIProvider] Error with ${config.provider}/${config.model}:`, error);
      throw error;
    }
  }
}

export const aiProvider = new AIProvider();
