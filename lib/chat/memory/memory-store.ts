import type { MemoryFact } from "@/lib/chat/types";
import { DEFAULT_MEMORY_MAX_FACTS, MEMORY_FACT_TTL_DAYS } from "@/lib/chat/constants";
import { getChatDB } from "@/lib/chat/storage/db";

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `fact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function listMemoryFactsForUser(
  userId: string,
  limit = DEFAULT_MEMORY_MAX_FACTS
): Promise<MemoryFact[]> {
  const db = getChatDB();
  const now = new Date().toISOString();
  const rows = await db.memory_facts.where("userId").equals(userId).toArray();
  return rows
    .filter((f) => !f.expiresAt || f.expiresAt > now)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export async function saveMemoryFact(
  fact: Omit<MemoryFact, "id" | "createdAt" | "expiresAt"> & {
    id?: string;
    createdAt?: string;
    expiresAt?: string;
  }
): Promise<MemoryFact> {
  const db = getChatDB();
  const createdAt = fact.createdAt ?? new Date().toISOString();
  const expiresAt =
    fact.expiresAt ??
    new Date(Date.now() + MEMORY_FACT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const record: MemoryFact = {
    id: fact.id ?? generateId(),
    userId: fact.userId,
    sessionId: fact.sessionId,
    type: fact.type,
    content: fact.content,
    trackingCode: fact.trackingCode,
    createdAt,
    expiresAt,
  };

  await db.memory_facts.put(record);
  return record;
}

export async function clearMemoryFactsForUser(userId: string): Promise<void> {
  await getChatDB().memory_facts.where("userId").equals(userId).delete();
}
