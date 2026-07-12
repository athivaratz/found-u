export const AGENT_MESSAGES_KEY_PREFIX = "foundu-agent-messages";

export function agentMessagesKey(userId: string): string {
  return `${AGENT_MESSAGES_KEY_PREFIX}:${userId}`;
}

export function clearAgentMessagesForUser(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(agentMessagesKey(userId));
  } catch {
    // ignore
  }
}
