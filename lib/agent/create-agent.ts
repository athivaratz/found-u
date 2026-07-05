import { ToolLoopAgent, isStepCount, type InferAgentUIMessage } from "ai";
import type { LanguageModel } from "ai";
import { buildAgentSystemPrompt } from "@/lib/agent/system-prompt";
import { createAgentTools } from "@/lib/agent/tools";
import type { AppSettings } from "@/lib/types";

export function createFoundUAgent(options: {
  model: LanguageModel;
  settings: AppSettings;
  userId: string | null;
}) {
  const tools = createAgentTools({
    userId: options.userId,
    settings: options.settings,
  });

  const maxSteps = options.settings.agentMaxSteps ?? 4;

  return new ToolLoopAgent({
    model: options.model,
    instructions: buildAgentSystemPrompt(),
    tools,
    stopWhen: isStepCount(maxSteps),
    temperature: options.settings.agentTemperature ?? 0.3,
    maxOutputTokens: options.settings.agentMaxOutputTokens ?? 512,
  });
}

export type FoundUAgent = ReturnType<typeof createFoundUAgent>;
export type FoundUAgentUIMessage = InferAgentUIMessage<FoundUAgent>;
