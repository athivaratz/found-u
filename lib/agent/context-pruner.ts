import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";

const DEFAULT_MAX_MESSAGES = 8;

function messageHasReportSuccess(message: UIMessage): boolean {
  for (const part of message.parts || []) {
    if (!isToolUIPart(part) || part.state !== "output-available") continue;
    const output = part.output as { resultType?: string; ok?: boolean } | undefined;
    if (output?.resultType === "report" && output.ok === true) return true;
  }
  return false;
}

export function pruneConversationMessages<T extends { role: string }>(
  messages: T[],
  maxMessages = DEFAULT_MAX_MESSAGES
): T[] {
  if (messages.length <= maxMessages) return messages;
  return messages.slice(-maxMessages);
}

export function pruneUiMessages(
  messages: UIMessage[],
  maxMessages = DEFAULT_MAX_MESSAGES
): UIMessage[] {
  if (messages.length <= maxMessages) return messages;

  const reportAnchorIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && messageHasReportSuccess(m)) return i;
    }
    return -1;
  })();

  const tail = messages.slice(-maxMessages);
  if (reportAnchorIndex < 0) return tail;

  const anchor = messages[reportAnchorIndex];
  const anchorInTail = tail.some((m) => m.id === anchor.id);
  if (anchorInTail) return tail;

  return [anchor, ...tail.slice(1 - maxMessages)];
}
