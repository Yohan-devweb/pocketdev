import type { AiProvider } from "@pocketdev/shared";
import { AnthropicClient } from "./anthropic";
import { OpenAiCompatibleClient } from "./openai";
import type { LlmClient } from "./types";

export type LlmFactory = (provider: AiProvider, apiKey: string, model: string) => LlmClient;

/** Client du fournisseur choisi, avec la clé de l'utilisateur. */
export const createLlm: LlmFactory = (provider, apiKey, model) => {
  switch (provider) {
    case "anthropic":
      return new AnthropicClient(apiKey, model);
    case "openai":
      return new OpenAiCompatibleClient("ChatGPT (OpenAI)", "https://api.openai.com/v1", apiKey, model);
    case "openrouter":
      return new OpenAiCompatibleClient("OpenRouter", "https://openrouter.ai/api/v1", apiKey, model, undefined, {
        "X-Title": "PocketDev",
      });
  }
};
