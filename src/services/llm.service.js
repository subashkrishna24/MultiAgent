import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";

export function getllmModel(model, apikey) {
  const provider = detectProvider(apikey);
  console.log(`[LLM Factory] Provider: ${provider} | Model: ${model}`);

  // Anthropic
  if (provider === "anthropic") {
    return new ChatAnthropic({
      modelName: model,
      anthropicApiKey: apikey,
      temperature: 0.7,
      maxTokens: 1000,
    });
  }

  // HuggingFace Router
  if (provider === "huggingface") {
    return new ChatOpenAI({
      modelName: model,
      apiKey: apikey,
      temperature: 0.7,
      maxTokens: 1000,
      configuration: {
        baseURL: "https://router.huggingface.co/v1",
        timeout: 120000,
      },
    });
  }

  const providerConfigs = {
    openai: "https://api.openai.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
    groq: "https://api.groq.com/openai/v1",
    mistral: "https://api.mistral.ai/v1",
    together: "https://api.together.xyz/v1",
    deepseek: "https://api.deepseek.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta/openai",
    ollama: "http://localhost:11434/v1",
  };

  const baseURL = providerConfigs[provider] || providerConfigs.openai;

  const config = {
    modelName: model,
    apiKey: apikey,
    temperature: 0.7,
    maxTokens: 1000,
    configuration: {
      baseURL,
      timeout: 120000,
    },
  };

  if (provider === "openrouter") {
    config.configuration.defaultHeaders = {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Plumb5 AI Copilot",
    };
  }

  return new ChatOpenAI(config);
}

function detectProvider(apikey) {
  if (!apikey) return "openai";

  // HuggingFace
  if (apikey.startsWith("hf_")) return "huggingface";

  // Anthropic
  if (apikey.startsWith("sk-ant-")) return "anthropic";

  // OpenRouter
  if (apikey.startsWith("sk-or-") || apikey.startsWith("sk-or-v1-")) {
    return "openrouter";
  }

  // Groq
  if (apikey.startsWith("gsk_")) return "groq";

  // Together AI
  if (apikey.startsWith("together_")) return "together";

  // Google Gemini
  if (apikey.startsWith("AIzaSy")) return "google";

  // DeepSeek
  if (apikey.startsWith("deepseek-")) return "deepseek";

  // Ollama
  if (apikey === "ollama") return "ollama";

  // Mistral
  if (/^[a-zA-Z0-9]{32}$/.test(apikey)) return "mistral";

  // Cohere
  if (apikey.startsWith("co-")) return "cohere";

  // OpenAI
  if (apikey.startsWith("sk-")) return "openai";

  return "openai";
}
