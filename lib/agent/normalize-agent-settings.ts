import { normalizeOpenRouterAgentSettings } from "@/lib/agent/openrouter-routing";
import {
  AGENT_DEFAULT_MAX_OUTPUT_TOKENS,
  type AppSettings,
} from "@/lib/types";

const MIN_AGENT_OUTPUT_TOKENS = 1024;
const OPENROUTER_AUTO_MIN_OUTPUT_TOKENS = 4096;
/** Tool call + synthesis needs at least two LLM steps. */
const MIN_AGENT_STEPS_WITH_TOOLS = 3;

function usesOpenRouterPath(settings: AppSettings): boolean {
  const mode = settings.agentProvider ?? "auto";
  return (
    mode === "openrouter" ||
    mode === "auto" ||
    settings.agentFallbackProvider === "openrouter"
  );
}

/**
 * Normalize agent settings for production regardless of provider.
 * OpenRouter-specific fixes are applied when that provider may be used.
 */
export function normalizeAgentSettings(settings: AppSettings): AppSettings {
  const next: AppSettings = { ...settings };

  const minOutput = usesOpenRouterPath(next)
    ? OPENROUTER_AUTO_MIN_OUTPUT_TOKENS
    : MIN_AGENT_OUTPUT_TOKENS;

  if (next.agentMaxOutputTokens == null || next.agentMaxOutputTokens < minOutput) {
    next.agentMaxOutputTokens = usesOpenRouterPath(next)
      ? OPENROUTER_AUTO_MIN_OUTPUT_TOKENS
      : AGENT_DEFAULT_MAX_OUTPUT_TOKENS;
  }

  const maxSteps = next.agentMaxSteps ?? 4;
  if (maxSteps < MIN_AGENT_STEPS_WITH_TOOLS) {
    next.agentMaxSteps = MIN_AGENT_STEPS_WITH_TOOLS;
  }

  if (usesOpenRouterPath(next)) {
    return normalizeOpenRouterAgentSettings({
      ...next,
      agentProvider: "openrouter",
    });
  }

  return next;
}