export type ChatSession = {
  id: string;
  userId: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
};

export type StoredChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  parts: unknown;
  createdAt: string;
  metadata?: {
    hasReportSuccess?: boolean;
    trackingCodes?: string[];
  };
};

export type MemoryFactType =
  | "report_lost"
  | "report_found"
  | "preference"
  | "search_topic"
  | "lookup_tracking";

export type MemoryFact = {
  id: string;
  userId: string;
  sessionId: string;
  type: MemoryFactType;
  content: string;
  trackingCode?: string;
  createdAt: string;
  expiresAt?: string;
};

export type AgentContextStrategy = "messages" | "tokens" | "hybrid";

export type AgentRequestContextMeta = {
  sessionId?: string;
  totalMessages: number;
  droppedCount: number;
  estimatedTokens?: number;
};
