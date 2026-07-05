export const MAX_SESSIONS_PER_USER = 50;
export const SESSION_SIZE_WARN_BYTES = 2 * 1024 * 1024;
export const MESSAGE_SAVE_DEBOUNCE_MS = 300;
export const PREVIEW_MAX_LENGTH = 80;
export const TITLE_MAX_LENGTH = 40;
export const MEMORY_FACT_TTL_DAYS = 90;
export const DEFAULT_MEMORY_MAX_FACTS = 5;

export const CHAT_MIGRATED_KEY_PREFIX = "foundu-chat-migrated";

export function chatMigratedKey(userId: string): string {
  return `${CHAT_MIGRATED_KEY_PREFIX}:${userId}`;
}
