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
import { getAppSettings } from "@/lib/database";
import { DEFAULT_APP_SETTINGS, type AppSettings, type LocationCoords } from "@/lib/types";
import { thaiCopy } from "@/lib/copy/thai-student";
import {
  extractTextFromUIMessageParts,
  looksTruncatedThai,
  messageHadToolOutput,
} from "@/lib/agent/text-completeness";

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

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
  /** Client GPS for found-item geofence — set by Assistant shell. */
  setClientLocation: (coords: LocationCoords | null) => void;
  clientLocation: LocationCoords | null;
  /** Explicit admin GPS bypass (UI button only). */
  setAdminLocationBypass: (bypass: boolean) => void;
  adminLocationBypass: boolean;
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
  const agentSettingsRef = useRef<AppSettings>(DEFAULT_APP_SETTINGS);
  const messagesRef = useRef<UIMessage[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const prevStatusRef = useRef<string>("ready");
  const repairedMessageIdsRef = useRef<Set<string>>(new Set());
  const clientLocationRef = useRef<LocationCoords | null>(null);
  const [clientLocation, setClientLocationState] = useState<LocationCoords | null>(
    null
  );
  const adminLocationBypassRef = useRef(false);
  const [adminLocationBypass, setAdminLocationBypassState] = useState(false);

  const setClientLocation = useCallback((coords: LocationCoords | null) => {
    clientLocationRef.current = coords;
    setClientLocationState(coords);
  }, []);

  const setAdminLocationBypass = useCallback((bypass: boolean) => {
    adminLocationBypassRef.current = bypass;
    setAdminLocationBypassState(bypass);
  }, []);

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
        const ctx = buildAgentRequestContext(msgs, agentSettingsRef.current);
        setDroppedCount(ctx.droppedCount);
        return {
          body: {
            messages: msgs,
            sessionId: id,
            memoryFacts: memoryFactsRef.current,
            clientLocation: clientLocationRef.current,
            adminLocationBypass: adminLocationBypassRef.current,
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

  messagesRef.current = messages;
  activeSessionIdRef.current = activeSessionId;

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    getAppSettings()
      .then((settings) => {
        if (mounted) agentSettingsRef.current = settings;
      })
      .catch(() => {
        agentSettingsRef.current = DEFAULT_APP_SETTINGS;
      });
    return () => {
      mounted = false;
    };
  }, [user]);

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
    if (status === "streaming" || status === "submitted") return;

    const timer = setTimeout(() => {
      void (async () => {
        if (switchingRef.current) return;
        const sessionId = activeSessionIdRef.current;
        if (!sessionId) return;
        const currentMessages = messagesRef.current;
        try {
          const size = estimateSessionSizeBytes(currentMessages);
          if (size > SESSION_SIZE_WARN_BYTES) {
            setStorageWarning("แชทนี้มีขนาดใหญ่ ลองลบแชทเก่าเพื่อประหยัดพื้นที่");
          } else {
            setStorageWarning(null);
          }

          await saveMessagesForSession(sessionId, currentMessages);

          if (user && currentMessages.length > 0) {
            const newFacts = dedupeFacts(
              extractFactsFromMessages(currentMessages, {
                userId: user.id,
                sessionId,
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
  }, [messages, activeSessionId, user, loading, refreshSessions, status]);

  useEffect(() => {
    const wasStreaming =
      prevStatusRef.current === "streaming" ||
      prevStatusRef.current === "submitted";
    prevStatusRef.current = status;

    if (!wasStreaming || status === "streaming" || status === "submitted") {
      return;
    }
    if (!activeSessionId || switchingRef.current || loading) return;

    const sessionId = activeSessionId;
    const last = messagesRef.current[messagesRef.current.length - 1];

    const flushSave = () => {
      void saveMessagesForSession(sessionId, messagesRef.current).catch(
        (err) => {
          console.error("[chat/session] flush after stream failed", err);
        }
      );
    };

    if (
      !user ||
      last?.role !== "assistant" ||
      repairedMessageIdsRef.current.has(last.id)
    ) {
      flushSave();
      return;
    }

    const clientText = extractTextFromUIMessageParts(
      last.parts as Array<{ type: string; text?: string }>
    );
    const hadTools = messageHadToolOutput(
      last.parts as Array<{ type: string; state?: string }>
    );
    const shouldRepair = looksTruncatedThai(clientText) || hadTools;

    if (!shouldRepair) {
      flushSave();
      return;
    }

    void (async () => {
      const messageId = last.id;
      const delays = [400, 900, 1800];

      for (let attempt = 0; attempt < delays.length; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        if (activeSessionIdRef.current !== sessionId) return;

        try {
          const res = await fetch(
            `/api/agent/chat/sync?sessionId=${encodeURIComponent(sessionId)}`
          );
          if (!res.ok) continue;
          const data = (await res.json()) as { parts?: UIMessage["parts"] };
          if (!data.parts?.length) continue;

          const serverText = extractTextFromUIMessageParts(
            data.parts as Array<{ type: string; text?: string }>
          );
          if (serverText.length <= clientText.length + 8) continue;

          repairedMessageIdsRef.current.add(messageId);
          setMessages((prev) => {
            const idx = prev.length - 1;
            if (
              idx < 0 ||
              prev[idx]?.role !== "assistant" ||
              prev[idx]?.id !== messageId
            ) {
              return prev;
            }
            const next = [...prev];
            next[idx] = {
              ...prev[idx],
              parts: data.parts as UIMessage["parts"],
            };
            return next;
          });
          flushSave();
          return;
        } catch (err) {
          console.warn("[chat/repair] sync failed", err);
        }
      }

      flushSave();
    })();
  }, [status, activeSessionId, loading, user, setMessages]);

  useEffect(() => {
    if (!error) return;

    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      const hasText = (last.parts || []).some(
        (part) => part.type === "text" && "text" in part && part.text.trim().length > 0
      );
      const hasToolOutput = (last.parts || []).some(
        (part) =>
          part.type.startsWith("tool-") &&
          "state" in part &&
          part.state === "output-available"
      );
      if (hasText || hasToolOutput) {
        return;
      }
    }

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
  }, [error, messages]);

  const createSession = useCallback(async () => {
    if (!user) return;
    const outgoingId = activeSessionIdRef.current;
    const outgoingMessages = messagesRef.current;
    if (
      outgoingId &&
      outgoingMessages.length > 0 &&
      status !== "streaming" &&
      status !== "submitted"
    ) {
      await saveMessagesForSession(outgoingId, outgoingMessages);
    }
    const session = createEmptySession(user.id);
    await createSessionRecord(session);
    switchingRef.current = true;
    setActiveSessionId(session.id);
    await waitForNextFrame();
    setMessages([]);
    setFallback(null);
    setDroppedCount(0);
    switchingRef.current = false;
    await refreshSessions();
  }, [user, setMessages, refreshSessions, status]);

  const switchSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      const outgoingId = activeSessionIdRef.current;
      const outgoingMessages = messagesRef.current;
      if (outgoingId && outgoingMessages.length > 0) {
        if (status !== "streaming" && status !== "submitted") {
          await saveMessagesForSession(outgoingId, outgoingMessages);
        }
      }
      switchingRef.current = true;
      setActiveSessionId(sessionId);
      await waitForNextFrame();
      const loaded = await loadMessagesForSession(sessionId);
      setMessages(loaded);
      setFallback(null);
      const ctx = buildAgentRequestContext(loaded, agentSettingsRef.current);
      setDroppedCount(ctx.droppedCount);
      switchingRef.current = false;
      setSidebarOpen(false);
    },
    [activeSessionId, setMessages, status]
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
      setClientLocation,
      clientLocation,
      setAdminLocationBypass,
      adminLocationBypass,
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
      setClientLocation,
      clientLocation,
      setAdminLocationBypass,
      adminLocationBypass,
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
    // Title sync is keyed on message count, not full messages array reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, activeSessionId]);
}
