import type { UIMessage } from "ai";
import { agentMessagesKey } from "@/lib/agent/storage-keys";
import { chatMigratedKey } from "@/lib/chat/constants";
import type { ChatSession } from "@/lib/chat/types";
import { createSessionRecord } from "@/lib/chat/storage/session-store";
import { saveMessagesForSession } from "@/lib/chat/storage/message-store";
import { buildPreviewFromMessages, buildTitleFromMessages } from "@/lib/chat/titles";

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function hasMigratedLocalStorage(userId: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(chatMigratedKey(userId)) === "1";
}

export function markLocalStorageMigrated(userId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(chatMigratedKey(userId), "1");
}

export async function migrateLegacyLocalStorage(userId: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (hasMigratedLocalStorage(userId)) return null;

  markLocalStorageMigrated(userId);

  let messages: UIMessage[] = [];
  try {
    const raw = localStorage.getItem(agentMessagesKey(userId));
    if (!raw) return null;
    messages = JSON.parse(raw) as UIMessage[];
  } catch {
    localStorage.removeItem(agentMessagesKey(userId));
    return null;
  }

  if (messages.length === 0) {
    localStorage.removeItem(agentMessagesKey(userId));
    return null;
  }

  const now = new Date().toISOString();
  const sessionId = generateId();
  const session: ChatSession = {
    id: sessionId,
    userId,
    title: buildTitleFromMessages(messages) || "แชทเก่า",
    preview: buildPreviewFromMessages(messages),
    messageCount: messages.length,
    createdAt: now,
    updatedAt: now,
  };

  await createSessionRecord(session);
  await saveMessagesForSession(sessionId, messages);
  localStorage.removeItem(agentMessagesKey(userId));

  console.info("[chat/migrate] migrated legacy localStorage session", {
    userId,
    sessionId,
    messageCount: messages.length,
  });

  return sessionId;
}
