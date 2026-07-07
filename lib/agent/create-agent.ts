import { ToolLoopAgent, isStepCount, type InferAgentUIMessage } from "ai";
import type { LanguageModel } from "ai";
import type { MemoryFact } from "@/lib/chat/types";
import { buildAgentSystemPrompt } from "@/lib/agent/system-prompt";
import { createAgentTools } from "@/lib/agent/tools";
import { normalizeAgentSettings } from "@/lib/agent/normalize-agent-settings";
import type { AgentStepLog } from "@/lib/agent/agent-step-log";
import {
  AGENT_DEFAULT_MAX_OUTPUT_TOKENS,
  type AppSettings,
} from "@/lib/types";

const POST_TOOL_SYNTHESIS_HINT =
  "You have tool results. Reply in complete Thai only — no more tool calls. Finish every sentence and list item; do not stop mid-word.";

export function createFoundUAgent(options: {
  model: LanguageModel;
  settings: AppSettings;
  userId: string | null;
  isAdmin?: boolean;
  memoryFacts?: MemoryFact[];
  onStepLog?: (step: AgentStepLog) => void;
}) {
  const settings = normalizeAgentSettings(options.settings);
  const tools = createAgentTools({
    userId: options.userId,
    isAdmin: options.isAdmin ?? false,
    settings,
  });

  const maxSteps = settings.agentMaxSteps ?? 4;
  const maxFacts = settings.agentMemoryMaxFacts ?? 5;
  const facts = (options.memoryFacts ?? []).slice(0, maxFacts);
  const baseInstructions = buildAgentSystemPrompt({
    userLoggedIn: Boolean(options.userId),
    memoryFacts: facts.length > 0 ? facts : undefined,
  });

  return new ToolLoopAgent({
    model: options.model,
    instructions: baseInstructions,
    tools,
    stopWhen: isStepCount(maxSteps),
    temperature: settings.agentTemperature ?? 0.3,
    maxOutputTokens:
      settings.agentMaxOutputTokens ?? AGENT_DEFAULT_MAX_OUTPUT_TOKENS,
    prepareStep: ({ steps, instructions }) => {
      const priorToolCalls = steps.some(
        (step) => (step.toolCalls?.length ?? 0) > 0
      );
      if (!priorToolCalls) return undefined;

      const synthesisInstructions = instructions
        ? `${instructions}\n\n${POST_TOOL_SYNTHESIS_HINT}`
        : `${baseInstructions}\n\n${POST_TOOL_SYNTHESIS_HINT}`;

      return {
        toolChoice: "none" as const,
        activeTools: [],
        instructions: synthesisInstructions,
      };
    },
    onStepEnd: ({ stepNumber, finishReason, usage, toolCalls }) => {
      const log: AgentStepLog = {
        stepNumber,
        finishReason,
        outputTokens: usage?.outputTokens,
        toolCalls: toolCalls?.map((call) => call.toolName),
      };
      options.onStepLog?.(log);
      console.info("[agent/step]", log);
    },
  });
}

export type FoundUAgent = ReturnType<typeof createFoundUAgent>;
export type FoundUAgentUIMessage = InferAgentUIMessage<FoundUAgent>;
