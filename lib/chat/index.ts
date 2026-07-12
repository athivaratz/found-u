export type {
  ChatSession,
  StoredChatMessage,
  MemoryFact,
  MemoryFactType,
  AgentContextStrategy,
  AgentRequestContextMeta,
} from "./types";

export {
  MAX_SESSIONS_PER_USER,
  SESSION_SIZE_WARN_BYTES,
  MESSAGE_SAVE_DEBOUNCE_MS,
  DEFAULT_MEMORY_MAX_FACTS,
} from "./constants";

export { buildPreviewFromMessages, buildTitleFromMessages } from "./titles";
export { buildAgentRequestContext } from "./context/short-term";
export {
  sanitizeUiMessagesForAgent,
  sliceFromUserBoundary,
} from "./context/sanitize-messages";

export {
  listSessionsForUser,
  createSessionRecord,
  updateSessionRecord,
  deleteSessionRecord,
  getSession,
} from "./storage/session-store";

export {
  loadMessagesForSession,
  saveMessagesForSession,
  estimateSessionSizeBytes,
} from "./storage/message-store";

export { migrateLegacyLocalStorage } from "./storage/migrate-local-storage";

export { listMemoryFactsForUser, saveMemoryFact, clearMemoryFactsForUser } from "./memory/memory-store";
export { extractFactsFromMessages, dedupeFacts } from "./memory/extract-facts";
