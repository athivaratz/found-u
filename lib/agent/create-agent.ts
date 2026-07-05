import { ToolLoopAgent, isStepCount, type InferAgentUIMessage } from "ai";
import type { LanguageModel } from "ai";
import type { MemoryFact } from "@/lib/chat/types";
import { buildAgentSystemPrompt } from "@/lib/agent/system-prompt";
import { createAgentTools } from "@/lib/agent/tools";
import type { AppSettings } from "@/lib/types";

export function createFoundUAgent(options: {
  model: LanguageModel;
  settings: AppSettings;
  userId: string | null;
  isAdmin?: boolean;
  memoryFacts?: MemoryFact[];
}) {
  const tools = createAgentTools({
    userId: options.userId,
    isAdmin: options.isAdmin ?? false,
    settings: options.settings,
  });

  const maxSteps = options.settings.agentMaxSteps ?? 4;
  const maxFacts = options.settings.agentMemoryMaxFacts ?? 5;
  const facts = (options.memoryFacts ?? []).slice(0, maxFacts);

  return new ToolLoopAgent({
    model: options.model,
    instructions: buildAgentSystemPrompt({
      userLoggedIn: Boolean(options.userId),
      memoryFacts: facts.length > 0 ? facts : undefined,
    }),
    tools,
    stopWhen: isStepCount(maxSteps),
    temperature: options.settings.agentTemperature ?? 0.3,
    maxOutputTokens: options.settings.agentMaxOutputTokens ?? 512,
  });
}

export type FoundUAgent = ReturnType<typeof createFoundUAgent>;
export type FoundUAgentUIMessage = InferAgentUIMessage<FoundUAgent>;
