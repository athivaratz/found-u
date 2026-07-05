"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useAuth } from "@/contexts/auth-context";
import type { AgentFallbackPayload } from "@/lib/agent/fallback";
import type { ChatSession, MemoryFact } from "@/lib/chat/types";
import {
  MESSAGE_SAVE_DEBOUNCE_MS,
  SESSION_SIZE_WARN_BYTES,
} from "@/lib/chat/constants";
import {
  createSessionRecord,
  deleteSessionRecord,
  listSessionsForUser,
  updateSessionRecord,
} from "@/lib/chat/storage/session-store";
import {
  estimateSessionSizeBytes,
  loadMessagesForSession,
  saveMessagesForSession,
} from "@/lib/chat/storage/message-store";
import { migrateLegacyLocalStorage } from "@/lib/chat/storage/migrate-local-storage";
import {
  clearMemoryFactsForUser,
  listMemoryFactsForUser,
  saveMemoryFact,
} from "@/lib/chat/memory/memory-store";
import { dedupeFacts, extractFactsFromMessages } from "@/lib/chat/memory/extract-facts";
import { buildTitleFromMessages } from "@/lib/chat/titles";
import { buildAgentRequestContext } from "@/lib/chat/context/short-term";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import { thaiCopy } from "@/lib/copy/thai-student";

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptySession(userId: string): ChatSession {
  const now = new Date().toISOString();
  return {
    id: generateSessionId(),
    userId,
    title: "แชทใหม่",
    preview: "",
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

type ChatContextValue = {
  sessions: ChatSession[];
  activeSessionId: string | null;
  messages: UIMessage[];
  status: string;
  error: Error | undefined;
  fallback: AgentFallbackPayload | null;
  droppedCount: number;
  storageWarning: string | null;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  createSession: () => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  pinSession: (sessionId: string, pinned: boolean) => Promise<void>;
  sendPrompt: (text: string) => void;
  handleSubmit: (text: string) => void;
  clearFallback: () => void;
  clearAgentMemory: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  isThinking: boolean;
  loading: boolean;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [fallback, setFallback] = useState<AgentFallbackPayload | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [droppedCount, setDroppedCount] = useState(0);

  const memoryFactsRef = useRef<MemoryFact[]>([]);
  const switchingRef = useRef(false);
  const initRef = useRef(false);

  const refreshSessions = useCallback(async () => {
    if (!user) {
      setSessions([]);
      return;
    }
    const list = await listSessionsForUser(user.id);
    setSessions(list);
  }, [user]);

  const { messages, sendMessage, setMessages, status, error } = useChat({
    id: activeSessionId ?? "pending",
    transport: new DefaultChatTransport({
      api: "/api/agent/chat",
      prepareSendMessagesRequest: ({ messages: msgs, id }) => {
        const ctx = buildAgentRequestContext(msgs, DEFAULT_APP_SETTINGS);
        setDroppedCount(ctx.droppedCount);
        return {
          body: {
            messages: msgs,
            sessionId: id,
            memoryFacts: memoryFactsRef.current,
            contextMeta: {
              sessionId: id,
              totalMessages: msgs.length,
              droppedCount: ctx.droppedCount,
              estimatedTokens: ctx.estimatedTokens,
            },
          },
        };
      },
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        if (!res.ok) {
          try {
            const data = (await res.clone().json()) as AgentFallbackPayload;
            if (data.fallback) setFallback(data);
          } catch {
            // ignore
          }
        }
        return res;
      },
    }),
    messages: [],
  });

  useEffect(() => {
    if (!user || initRef.current) return;
    initRef.current = true;

    (async () => {
      setLoading(true);
      try {
        const migratedId = await migrateLegacyLocalStorage(user.id);
        const list = await listSessionsForUser(user.id);
        memoryFactsRef.current = await listMemoryFactsForUser(user.id);

        let sessionId: string;
        if (migratedId) {
          sessionId = migratedId;
        } else if (list.length > 0) {
          sessionId = list[0].id;
        } else {
          const session = createEmptySession(user.id);
          await createSessionRecord(session);
          sessionId = session.id;
        }

        setSessions(await listSessionsForUser(user.id));
        setActiveSessionId(sessionId);
        const loaded = await loadMessagesForSession(sessionId);
        setMessages(loaded);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, setMessages]);

  useEffect(() => {
    if (!user) {
      initRef.current = false;
      setActiveSessionId(null);
      setSessions([]);
      setMessages([]);
    }
  }, [user, setMessages]);

  useEffect(() => {
    if (!activeSessionId || switchingRef.current || loading) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const size = estimateSessionSizeBytes(messages);
          if (size > SESSION_SIZE_WARN_BYTES) {
            setStorageWarning("แชทนี้มีขนาดใหญ่ ลองลบแชทเก่าเพื่อประหยัดพื้นที่");
          } else {
            setStorageWarning(null);
          }

          await saveMessagesForSession(activeSessionId, messages);

          if (user && messages.length > 0) {
            const newFacts = dedupeFacts(
              extractFactsFromMessages(messages, {
                userId: user.id,
                sessionId: activeSessionId,
              })
            );
            for (const fact of newFacts) {
              await saveMemoryFact(fact);
            }
            memoryFactsRef.current = await listMemoryFactsForUser(user.id);
          }

          await refreshSessions();
        } catch (err) {
          console.error("[chat/session] save failed", err);
        }
      })();
    }, MESSAGE_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [messages, activeSessionId, user, loading, refreshSessions]);

  useEffect(() => {
    if (!error) return;
    if (error.message) {
      try {
        const parsed = JSON.parse(error.message) as AgentFallbackPayload;
        if (parsed.fallback) {
          setFallback(parsed);
          return;
        }
      } catch {
        // not json
      }
    }
    setFallback({
      fallback: true,
      reason: "unknown",
      message: thaiCopy.agent.aiBusy,
      suggestedRoutes: [
        { href: "/list", labelKey: "list" },
        { href: "/tracking", labelKey: "tracking" },
        { href: "/lost", labelKey: "lost" },
        { href: "/found", labelKey: "found" },
      ],
    });
  }, [error]);

  const createSession = useCallback(async () => {
    if (!user) return;
    const session = createEmptySession(user.id);
    await createSessionRecord(session);
    switchingRef.current = true;
    setActiveSessionId(session.id);
    setMessages([]);
    setFallback(null);
    setDroppedCount(0);
    switchingRef.current = false;
    await refreshSessions();
  }, [user, setMessages, refreshSessions]);

  const switchSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      switchingRef.current = true;
      const loaded = await loadMessagesForSession(sessionId);
      setActiveSessionId(sessionId);
      setMessages(loaded);
      setFallback(null);
      const ctx = buildAgentRequestContext(loaded, DEFAULT_APP_SETTINGS);
      setDroppedCount(ctx.droppedCount);
      switchingRef.current = false;
      setSidebarOpen(false);
    },
    [activeSessionId, setMessages]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await deleteSessionRecord(sessionId);
      const list = await listSessionsForUser(user!.id);
      setSessions(list);

      if (activeSessionId === sessionId) {
        if (list.length > 0) {
          await switchSession(list[0].id);
        } else {
          await createSession();
        }
      }
    },
    [activeSessionId, user, switchSession, createSession]
  );

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      await updateSessionRecord(sessionId, { title: title.trim() || "แชทใหม่" });
      await refreshSessions();
    },
    [refreshSessions]
  );

  const pinSession = useCallback(
    async (sessionId: string, pinned: boolean) => {
      await updateSessionRecord(sessionId, { pinned });
      await refreshSessions();
    },
    [refreshSessions]
  );

  const sendPrompt = useCallback(
    (text: string) => {
      if (!user || status === "streaming" || status === "submitted") return;
      setFallback(null);
      sendMessage({ text });
    },
    [user, status, sendMessage]
  );

  const handleSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !user) return;
      sendPrompt(trimmed);
    },
    [user, sendPrompt]
  );

  const clearAgentMemory = useCallback(async () => {
    if (!user) return;
    await clearMemoryFactsForUser(user.id);
    memoryFactsRef.current = [];
  }, [user]);

  const value = useMemo<ChatContextValue>(
    () => ({
      sessions,
      activeSessionId,
      messages,
      status,
      error,
      fallback,
      droppedCount,
      storageWarning,
      sidebarOpen,
      setSidebarOpen,
      createSession,
      switchSession,
      deleteSession,
      renameSession,
      pinSession,
      sendPrompt,
      handleSubmit,
      clearFallback: () => setFallback(null),
      clearAgentMemory,
      refreshSessions,
      isThinking: status === "streaming" || status === "submitted",
      loading,
    }),
    [
      sessions,
      activeSessionId,
      messages,
      status,
      error,
      fallback,
      droppedCount,
      storageWarning,
      sidebarOpen,
      createSession,
      switchSession,
      deleteSession,
      renameSession,
      pinSession,
      sendPrompt,
      handleSubmit,
      clearAgentMemory,
      refreshSessions,
      loading,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return ctx;
}

/** Update session title from first user message when still default */
export function useAutoTitle(messages: UIMessage[], activeSessionId: string | null) {
  useEffect(() => {
    if (!activeSessionId || messages.length === 0) return;
    void (async () => {
      const session = await import("@/lib/chat/storage/session-store").then((m) =>
        m.getSession(activeSessionId)
      );
      if (!session || session.title !== "แชทใหม่") return;
      const title = buildTitleFromMessages(messages);
      if (title && title !== "แชทใหม่") {
        await updateSessionRecord(activeSessionId, { title });
      }
    })();
  }, [messages.length, activeSessionId]);
}
