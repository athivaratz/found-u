import Dexie, { type Table } from "dexie";
import type { ChatSession, MemoryFact, StoredChatMessage } from "@/lib/chat/types";

export class FoundUChatDB extends Dexie {
  sessions!: Table<ChatSession, string>;
  messages!: Table<StoredChatMessage, string>;
  memory_facts!: Table<MemoryFact, string>;

  constructor() {
    super("foundu-chat");
    this.version(1).stores({
      sessions: "id, userId, updatedAt, pinned",
      messages: "id, sessionId, createdAt",
      memory_facts: "id, userId, createdAt, sessionId",
    });
  }
}

let dbInstance: FoundUChatDB | null = null;

export function getChatDB(): FoundUChatDB {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!dbInstance) {
    dbInstance = new FoundUChatDB();
  }
  return dbInstance;
}
