import type { AppSettings } from "@/lib/types";

export const AGENT_SHARED_SETTING_KEYS = [
  "agentProvider",
  "agentFallbackProvider",
  "agentMaxSteps",
  "agentMaxOutputTokens",
  "agentTemperature",
  "agentContextMaxMessages",
  "agentContextMaxTokens",
  "agentContextStrategy",
  "agentMemoryMaxFacts",
] as const satisfies readonly (keyof AppSettings)[];

export const GEMINI_PIPELINE_SETTING_KEYS = [
  "agentModel",
  "aiNerModel",
  "aiNerTemperature",
  "aiNerTopP",
  "aiNerMaxOutputTokens",
  "aiMatchingModel",
  "aiMatchingTemperature",
  "aiMatchingTopP",
  "aiMatchingMaxOutputTokens",
  "aiVisionModel",
  "aiVisionTemperature",
  "aiVisionTopP",
  "aiVisionMaxOutputTokens",
] as const satisfies readonly (keyof AppSettings)[];

export const OPENROUTER_SETTING_KEYS = [
  "agentOpenRouterModel",
  "agentOpenRouterLockProvider",
  "agentOpenRouterProviderOrder",
  "agentOpenRouterAllowFallbacks",
  "agentOpenRouterProviderIgnore",
  "agentOpenRouterReasoningEffort",
  "agentOpenRouterProviderSort",
] as const satisfies readonly (keyof AppSettings)[];

export type AgentSharedSettingKey = (typeof AGENT_SHARED_SETTING_KEYS)[number];
export type GeminiPipelineSettingKey = (typeof GEMINI_PIPELINE_SETTING_KEYS)[number];
export type OpenRouterSettingKey = (typeof OPENROUTER_SETTING_KEYS)[number];

export function pickSettingsKeys<T extends keyof AppSettings>(
  settings: AppSettings,
  keys: readonly T[]
): Pick<AppSettings, T> {
  const picked = {} as Pick<AppSettings, T>;
  for (const key of keys) {
    picked[key] = settings[key];
  }
  return picked;
}
