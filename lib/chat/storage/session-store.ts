import type { ChatSession } from "@/lib/chat/types";
import { MAX_SESSIONS_PER_USER } from "@/lib/chat/constants";
import { getChatDB } from "@/lib/chat/storage/db";

export async function listSessionsForUser(userId: string): Promise<ChatSession[]> {
  const db = getChatDB();
  const sessions = await db.sessions.where("userId").equals(userId).toArray();
  return sessions.sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function getSession(sessionId: string): Promise<ChatSession | undefined> {
  return getChatDB().sessions.get(sessionId);
}

export async function createSessionRecord(
  session: ChatSession
): Promise<ChatSession> {
  const db = getChatDB();
  await db.sessions.put(session);
  await enforceSessionLimit(session.userId);
  return session;
}

export async function updateSessionRecord(
  sessionId: string,
  patch: Partial<ChatSession>
): Promise<void> {
  const db = getChatDB();
  const existing = await db.sessions.get(sessionId);
  if (!existing) return;
  await db.sessions.put({
    ...existing,
    ...patch,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  });
}

export async function deleteSessionRecord(sessionId: string): Promise<void> {
  const db = getChatDB();
  await db.transaction("rw", db.sessions, db.messages, async () => {
    await db.messages.where("sessionId").equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

export async function enforceSessionLimit(userId: string): Promise<void> {
  const sessions = await listSessionsForUser(userId);
  if (sessions.length <= MAX_SESSIONS_PER_USER) return;

  const unpinned = sessions.filter((s) => !s.pinned);
  const toRemove = sessions.length - MAX_SESSIONS_PER_USER;
  const victims = unpinned.slice(-toRemove);
  for (const session of victims) {
    await deleteSessionRecord(session.id);
  }
}
