import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { createOpenRouterInjectingFetch } from "@/lib/agent/openrouter-routing";
import { normalizeAgentSettings } from "@/lib/agent/normalize-agent-settings";
import {
  getGeminiApiKey,
  getOpenRouterApiKey,
  getOpenRouterModel,
  type ResolvedAiCredentials,
} from "@/lib/ai/credentials-resolver";
import {
  AGENT_DEFAULT_MAX_OUTPUT_TOKENS,
  type AppSettings,
} from "@/lib/types";

export type AgentProviderName = "gemini" | "openrouter";

export interface AgentModelConfig {
  provider: AgentProviderName;
  model: string;
  maxSteps: number;
  maxOutputTokens: number;
  temperature: number;
}

const DEFAULT_AGENT_MODEL = "gemini-2.0-flash";

function resolveAgentSettings(raw: AppSettings, credentials?: ResolvedAiCredentials): {
  primary: AgentProviderName;
  fallback: AgentProviderName;
  model: string;
  openRouterModel: string;
  maxSteps: number;
  maxOutputTokens: number;
  temperature: number;
} {
  const settings = normalizeAgentSettings(raw);
  const mode = settings.agentProvider || "auto";
  const primary: AgentProviderName =
    mode === "openrouter" ? "openrouter" : "gemini";
  const fallback: AgentProviderName =
    settings.agentFallbackProvider === "openrouter" ? "openrouter" : "gemini";

  const defaultOpenRouterModel = credentials
    ? getOpenRouterModel(credentials)
    : process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free";

  return {
    primary: mode === "auto" ? "gemini" : primary,
    fallback: mode === "auto" ? "openrouter" : fallback === primary ? (primary === "gemini" ? "openrouter" : "gemini") : fallback,
    model: settings.agentModel || DEFAULT_AGENT_MODEL,
    openRouterModel: settings.agentOpenRouterModel || defaultOpenRouterModel,
    maxSteps: settings.agentMaxSteps ?? 4,
    maxOutputTokens:
      settings.agentMaxOutputTokens ?? AGENT_DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: settings.agentTemperature ?? 0.3,
  };
}

function createGeminiModel(modelId: string, apiKey: string): LanguageModel {
  const google = createGoogleGenerativeAI({ apiKey });
  return google(modelId.replace(/^models\//, ""));
}

function createOpenRouterModel(
  modelId: string,
  settings: AppSettings,
  apiKey: string
): LanguageModel {
  const openrouter = createOpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Found-U Agent",
    },
    fetch: createOpenRouterInjectingFetch(settings),
  });
  return openrouter.chat(modelId);
}

export function getAgentModel(
  provider: AgentProviderName,
  settings: AppSettings,
  credentials?: ResolvedAiCredentials
): LanguageModel {
  const normalized = normalizeAgentSettings(settings);
  const resolved = resolveAgentSettings(normalized, credentials);
  if (provider === "openrouter") {
    const apiKey = credentials ? getOpenRouterApiKey(credentials) : process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
    return createOpenRouterModel(resolved.openRouterModel, normalized, apiKey);
  }
  const apiKey = credentials ? getGeminiApiKey(credentials) : process.env.GEMMA_API_KEY;
  if (!apiKey) throw new Error("GEMMA_API_KEY is not configured");
  return createGeminiModel(resolved.model, apiKey);
}

export function getAgentConfig(
  settings: AppSettings,
  credentials?: ResolvedAiCredentials
): AgentModelConfig & {
  primaryProvider: AgentProviderName;
  fallbackProvider: AgentProviderName;
} {
  const resolved = resolveAgentSettings(settings, credentials);
  return {
    provider: resolved.primary,
    primaryProvider: resolved.primary,
    fallbackProvider: resolved.fallback,
    model:
      resolved.primary === "openrouter" ? resolved.openRouterModel : resolved.model,
    maxSteps: resolved.maxSteps,
    maxOutputTokens: resolved.maxOutputTokens,
    temperature: resolved.temperature,
  };
}

export async function withProviderFallback<T>(
  settings: AppSettings,
  run: (provider: AgentProviderName, model: LanguageModel) => Promise<T>,
  credentials?: ResolvedAiCredentials
): Promise<{ result: T; providerUsed: AgentProviderName }> {
  const config = getAgentConfig(settings, credentials);
  const providers: AgentProviderName[] = [
    config.primaryProvider,
    config.fallbackProvider,
  ];
  const unique = [...new Set(providers)];

  let lastError: unknown;
  for (const provider of unique) {
    try {
      if (!isProviderConfigured(provider, credentials)) continue;
      const model = getAgentModel(provider, settings, credentials);
      const result = await run(provider, model);
      return { result, providerUsed: provider };
    } catch (error) {
      lastError = error;
      console.warn(`[agent] provider ${provider} failed:`, error);
    }
  }
  throw lastError;
}

export function isProviderConfigured(
  provider: AgentProviderName,
  credentials?: ResolvedAiCredentials
): boolean {
  if (provider === "gemini") {
    return Boolean(credentials ? getGeminiApiKey(credentials) : process.env.GEMMA_API_KEY);
  }
  return Boolean(credentials ? getOpenRouterApiKey(credentials) : process.env.OPENROUTER_API_KEY);
}
