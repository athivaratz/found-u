"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useAuth } from "@/contexts/auth-context";
import { AgentTopBar } from "@/components/agent/agent-top-bar";
import { AgentEmptyState } from "@/components/agent/agent-empty-state";
import { AgentMessageList } from "@/components/agent/agent-message-list";
import { AgentComposer } from "@/components/agent/agent-composer";
import { ClassicQuickLinks } from "@/components/agent/classic-quick-links";
import { TraditionalFallbackPanel } from "@/components/agent/traditional-fallback-panel";
import { VoiceSphereOverlay } from "@/components/agent/voice-sphere-overlay";
import type { AgentFallbackPayload } from "@/lib/agent/fallback";
import { agentMessagesKey } from "@/lib/agent/storage-keys";
import { thaiCopy } from "@/lib/copy/thai-student";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/use-mounted";
import Link from "next/link";
import { AUTH_ROUTES } from "@/lib/auth-routes";

function loadStoredMessages(userId: string): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(agentMessagesKey(userId));
    if (!raw) return [];
    return JSON.parse(raw) as UIMessage[];
  } catch {
    return [];
  }
}

export function AgentChatShell() {
  const { user, loading: authLoading } = useAuth();
  const mounted = useMounted();
  const hydratedRef = useRef(false);
  const [input, setInput] = useState("");
  const [fallback, setFallback] = useState<AgentFallbackPayload | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/agent/chat",
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        if (!res.ok) {
          try {
            const data = (await res.clone().json()) as AgentFallbackPayload;
            if (data.fallback) setFallback(data);
          } catch {
            // ignore parse errors
          }
        }
        return res;
      },
    }),
    messages: [],
  });

  useEffect(() => {
    if (!mounted || !user || hydratedRef.current) return;
    const stored = loadStoredMessages(user.id);
    if (stored.length > 0) {
      setMessages(stored);
    }
    hydratedRef.current = true;
  }, [mounted, user, setMessages]);

  useEffect(() => {
    if (!user) return;
    const key = agentMessagesKey(user.id);
    if (messages.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(messages));
    }
  }, [messages, user]);

  useEffect(() => {
    if (!error) return;
    const tryParseFallback = async () => {
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
    };
    void tryParseFallback();
  }, [error]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || !user) return;
    setFallback(null);
    sendMessage({ text });
    setInput("");
  }, [input, user, sendMessage]);

  const handleNewChat = () => {
    setMessages([]);
    if (user) {
      localStorage.removeItem(agentMessagesKey(user.id));
    }
    setFallback(null);
    setInput("");
  };

  const isThinking = status === "streaming" || status === "submitted";
  const composerDisabled = !user || isThinking;

  if (authLoading) {
    return (
      <div className="h-full flex-1 flex items-center justify-center agent-mesh-bg min-h-0">
        <div className="w-8 h-8 rounded-full border-2 border-line-green border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-full flex-1 flex flex-col agent-mesh-bg min-h-0">
        <AgentTopBar />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-text-secondary mb-4">{thaiCopy.agent.loginRequired}</p>
          <Link
            href={AUTH_ROUTES.hub}
            className="px-6 py-2.5 rounded-xl bg-line-green text-white font-medium"
          >
            เข้าสู่ระบบ
          </Link>
          <ClassicQuickLinks className="mt-8" />
        </div>
      </div>
    );
  }

  const sendPrompt = (prompt: string) => {
    if (!user || isThinking) return;
    setFallback(null);
    setInput("");
    sendMessage({ text: prompt });
  };

  return (
    <div
      className={cn(
        "flex flex-col min-h-0 flex-1 agent-mesh-bg",
        "md:rounded-2xl md:border md:border-border-light/70 md:bg-bg-primary/70",
        "md:shadow-sm md:overflow-hidden md:h-full"
      )}
    >
      <AgentTopBar
        status={status}
        onNewChat={handleNewChat}
      />

      {messages.length === 0 && !fallback ? (
        <AgentEmptyState
          className="flex-1 min-h-0"
          onSelectPrompt={sendPrompt}
        />
      ) : (
        <AgentMessageList messages={messages} status={status} />
      )}

      {fallback ? <TraditionalFallbackPanel payload={fallback} className="mx-4 mb-2" /> : null}

      {messages.length > 0 ? (
        <ClassicQuickLinks
          className="px-4 pb-2 shrink-0"
          onAgentPrompt={sendPrompt}
        />
      ) : null}

      <AgentComposer
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        onVoiceClick={() => !isThinking && setVoiceOpen(true)}
        disabled={composerDisabled}
        className="shrink-0"
      />

      <VoiceSphereOverlay
        open={voiceOpen && !isThinking}
        onClose={() => setVoiceOpen(false)}
        onTranscript={(text) => {
          setFallback(null);
          setVoiceOpen(false);
          sendPrompt(text);
        }}
      />
    </div>
  );
}
