import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type Agent,
  type InferUIMessageChunk,
  type UIMessage,
} from "ai";
import type { FoundUAgent } from "@/lib/agent/create-agent";
import type { AgentStepLog } from "@/lib/agent/agent-step-log";
import {
  extractTextFromUIMessageParts,
  looksTruncatedThai,
} from "@/lib/agent/text-completeness";
import {
  needsSynthesisRecovery,
  runSynthesisRecovery,
} from "@/lib/agent/synthesis-recovery";
import { persistAgentChatLog } from "@/lib/agent/agent-chat-log";
import { filterAgentOutputText } from "@/lib/agent/output-language-filter";
import type { AppSettings } from "@/lib/types";
import type { LanguageModel } from "ai";

export type { AgentStepLog } from "@/lib/agent/agent-step-log";

export type AgentStreamCollector = {
  steps: AgentStepLog[];
  requestMessages: unknown[];
  settingsSnapshot: AppSettings;
  routing?: Record<string, unknown>;
  provider: string;
  modelId: string;
  sessionId?: string;
  userId: string;
  startedAt: number;
  responseParts?: unknown;
  truncated?: boolean;
  finishReason?: string;
  durationMs?: number;
};

export async function createFoundUAgentUIStreamResponse(options: {
  agent: FoundUAgent;
  uiMessages: UIMessage[];
  originalMessages?: UIMessage[];
  model: LanguageModel;
  settings: AppSettings;
  headers?: Record<string, string>;
  collector: AgentStreamCollector;
}): Promise<Response> {
  const {
    agent,
    uiMessages,
    originalMessages,
    model,
    settings,
    headers,
    collector,
  } = options;

  const modelMessages = await (async () => {
    const { convertToModelMessages } = await import("ai");
    return convertToModelMessages(uiMessages);
  })();

  let accumulatedText = "";
  let hadToolOutput = false;
  let lastFinishReason: string | undefined;

  const stream = createUIMessageStream({
    originalMessages: originalMessages ?? uiMessages,
    execute: async ({ writer }) => {
      const agentStream = await createAgentUIStream({
        agent: agent as unknown as Agent,
        uiMessages,
      });

      let pendingFinish: InferUIMessageChunk<UIMessage> | null = null;

      for await (const part of agentStream) {
        if (part.type === "text-delta") {
          const filtered = filterAgentOutputText(part.delta);
          accumulatedText += filtered;
          if (filtered) {
            writer.write({ ...part, delta: filtered });
          }
          continue;
        }
        if (part.type.startsWith("tool-")) {
          hadToolOutput = true;
        }
        if (part.type === "finish") {
          lastFinishReason = part.finishReason;
          pendingFinish = part;
          continue;
        }
        writer.write(part);
      }

      if (
        needsSynthesisRecovery(
          accumulatedText,
          lastFinishReason,
          hadToolOutput
        )
      ) {
        const recovery = await runSynthesisRecovery({
          model,
          messages: modelMessages,
          partialText: accumulatedText,
          settings,
        });
        if (recovery) {
          const filteredRecovery = filterAgentOutputText(recovery);
          if (filteredRecovery) {
            const recoveryTextId = `recovery-${Date.now()}`;
            writer.write({
              type: "text-start",
              id: recoveryTextId,
            } as InferUIMessageChunk<UIMessage>);
            writer.write({
              type: "text-delta",
              id: recoveryTextId,
              delta: `\n${filteredRecovery}`,
            } as InferUIMessageChunk<UIMessage>);
            writer.write({
              type: "text-end",
              id: recoveryTextId,
            } as InferUIMessageChunk<UIMessage>);
            accumulatedText += `\n${filteredRecovery}`;
          }
        }
      }

      if (pendingFinish) {
        writer.write(pendingFinish);
      }
    },
    onEnd: async ({ messages }) => {
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") {
        collector.responseParts = last.parts;
        const text = extractTextFromUIMessageParts(
          last.parts as Array<{ type: string; text?: string }>
        );
        collector.truncated = looksTruncatedThai(text, lastFinishReason);
        collector.finishReason = lastFinishReason;
      }
      collector.durationMs = Date.now() - collector.startedAt;
      try {
        await persistAgentChatLog(collector);
      } catch (err) {
        console.warn("[agent/chat] log persist failed:", err);
      }
    },
  });

  const responseHeaders = {
    ...headers,
    "X-Agent-Stream-Version": "2",
  };

  return createUIMessageStreamResponse({
    stream,
    headers: responseHeaders,
  });
}
