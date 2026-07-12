import type { UIMessage } from "ai";
import type { AppSettings } from "@/lib/types";
import { buildAgentRequestContext } from "@/lib/chat/context/window-builder";

export { buildAgentRequestContext } from "@/lib/chat/context/window-builder";
export { pruneConversationMessages } from "@/lib/agent/context-pruner-legacy";

/** Prune messages for the agent model using hybrid token/message strategy. */
export function pruneUiMessages(
  messages: UIMessage[],
  maxMessages?: number,
  settings?: Pick<
    AppSettings,
    "agentContextMaxTokens" | "agentContextStrategy"
  >
): UIMessage[] {
  const result = buildAgentRequestContext(messages, {
    agentContextMaxMessages: maxMessages ?? 8,
    agentContextMaxTokens: settings?.agentContextMaxTokens ?? 6000,
    agentContextStrategy: settings?.agentContextStrategy ?? "hybrid",
  });

  if (result.droppedCount > 0) {
    console.info("[chat/context]", {
      dropped: result.droppedCount,
      strategy: settings?.agentContextStrategy ?? "hybrid",
      estimatedTokens: result.estimatedTokens,
    });
  }

  return result.modelMessages;
}
