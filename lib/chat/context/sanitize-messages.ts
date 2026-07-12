import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";

function hasToolParts(message: UIMessage): boolean {
  return (message.parts || []).some((part) => isToolUIPart(part));
}

function stripToolParts(message: UIMessage): UIMessage {
  const parts = (message.parts || []).filter((part) => !isToolUIPart(part));
  return { ...message, parts };
}

function stripIncompleteToolParts(message: UIMessage): UIMessage {
  const parts = (message.parts || []).filter((part) => {
    if (!isToolUIPart(part)) return true;
    return part.state === "output-available" || part.state === "output-error";
  });
  return { ...message, parts };
}

function isEffectivelyEmpty(message: UIMessage): boolean {
  const parts = message.parts || [];
  if (parts.length === 0) return true;
  return parts.every(
    (part) => part.type === "text" && !(part as { text?: string }).text?.trim()
  );
}

/**
 * Gemini requires tool/function turns to follow a user turn or a function response.
 * Pruned UI history can orphan assistant tool messages — strip or trim them here.
 */
export function sanitizeUiMessagesForAgent(messages: UIMessage[]): UIMessage[] {
  if (messages.length === 0) return [];

  let result = [...messages];

  while (result.length > 0 && result[0].role !== "user") {
    result = result.slice(1);
  }

  if (result.length === 0) return [];

  result = result.map((message, index) => {
    if (message.role !== "assistant" || !hasToolParts(message)) {
      return message;
    }

    const prev = result[index - 1];
    const isLast = index === result.length - 1;

    if (prev?.role === "user") {
      return isLast ? message : stripIncompleteToolParts(message);
    }

    return stripToolParts(message);
  });

  result = result.filter((message, index) => {
    if (index === result.length - 1) return !isEffectivelyEmpty(message);
    return !isEffectivelyEmpty(message);
  });

  while (result.length > 0 && result[0].role !== "user") {
    result = result.slice(1);
  }

  return result;
}

/** Slice recent messages but start on a user turn when possible. */
export function sliceFromUserBoundary(
  messages: UIMessage[],
  maxCount: number
): UIMessage[] {
  if (messages.length <= maxCount) return messages;

  let start = messages.length - maxCount;
  while (start < messages.length && messages[start].role !== "user") {
    start += 1;
  }

  if (start >= messages.length) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        return messages.slice(i);
      }
    }
    return messages.slice(-Math.min(maxCount, messages.length));
  }

  return messages.slice(start);
}
