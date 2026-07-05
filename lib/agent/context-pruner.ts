const DEFAULT_MAX_MESSAGES = 8;

export function pruneConversationMessages<T extends { role: string }>(
  messages: T[],
  maxMessages = DEFAULT_MAX_MESSAGES
): T[] {
  if (messages.length <= maxMessages) return messages;
  return messages.slice(-maxMessages);
}

export function pruneUiMessages<T extends { role: string }>(
  messages: T[],
  maxMessages = DEFAULT_MAX_MESSAGES
): T[] {
  if (messages.length <= maxMessages) return messages;
  return messages.slice(-maxMessages);
}
