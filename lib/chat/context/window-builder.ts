import type { UIMessage } from "ai";
import type { AppSettings } from "@/lib/types";
import type { AgentContextStrategy } from "@/lib/chat/types";
import {
  sanitizeUiMessagesForAgent,
  sliceFromUserBoundary,
} from "./sanitize-messages";

export function estimateMessageTokens(message: UIMessage): number {
  const text = (message.parts || [])
    .map((part) => {
      if (part.type === "text") return part.text;
      return JSON.stringify(part);
    })
    .join(" ");
  // Thai + mixed text heuristic: ~1.5 chars per token
  return Math.ceil(text.length / 1.5) + 4;
}

export function estimateMessagesTokens(messages: UIMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

export type AgentRequestContextResult = {
  modelMessages: UIMessage[];
  droppedCount: number;
  summaryInjected: boolean;
  estimatedTokens: number;
};

function selectByMessageCount(
  messages: UIMessage[],
  maxMessages: number
): UIMessage[] {
  return sliceFromUserBoundary(messages, maxMessages);
}

function selectByTokenBudget(
  messages: UIMessage[],
  maxTokens: number
): UIMessage[] {
  const picked: UIMessage[] = [];
  let tokens = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const t = estimateMessageTokens(messages[i]);
    if (picked.length > 0 && tokens + t > maxTokens) break;
    picked.unshift(messages[i]);
    tokens += t;
  }

  return sanitizeUiMessagesForAgent(sliceFromUserBoundary(picked, picked.length));
}

function selectHybrid(
  messages: UIMessage[],
  maxMessages: number,
  maxTokens: number
): UIMessage[] {
  let picked = sliceFromUserBoundary(messages, maxMessages);
  while (picked.length > 1 && estimateMessagesTokens(picked) > maxTokens) {
    const nextStart = messages.indexOf(picked[1]);
    if (nextStart < 0) {
      picked = picked.slice(1);
      continue;
    }
    picked = messages.slice(nextStart);
    picked = sliceFromUserBoundary(picked, picked.length);
    if (picked.length <= 1) break;
  }
  return picked;
}

export function buildAgentRequestContext(
  messages: UIMessage[],
  settings: Pick<
    AppSettings,
    "agentContextMaxMessages" | "agentContextMaxTokens" | "agentContextStrategy"
  >
): AgentRequestContextResult {
  const maxMessages = settings.agentContextMaxMessages ?? 8;
  const maxTokens = settings.agentContextMaxTokens ?? 6000;
  const strategy: AgentContextStrategy = settings.agentContextStrategy ?? "hybrid";

  if (messages.length === 0) {
    return { modelMessages: [], droppedCount: 0, summaryInjected: false, estimatedTokens: 0 };
  }

  let selected: UIMessage[];
  if (strategy === "messages") {
    selected = selectByMessageCount(messages, maxMessages);
  } else if (strategy === "tokens") {
    selected = selectByTokenBudget(messages, maxTokens);
  } else {
    selected = selectHybrid(messages, maxMessages, maxTokens);
  }

  const modelMessages = sanitizeUiMessagesForAgent(selected);
  const droppedCount = Math.max(0, messages.length - modelMessages.length);
  const estimatedTokens = estimateMessagesTokens(modelMessages);

  return {
    modelMessages,
    droppedCount,
    summaryInjected: false,
    estimatedTokens,
  };
}
