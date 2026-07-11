"use client";

import { useEffect, useRef } from "react";
import { m, AnimatePresence, useReducedMotion } from "framer-motion";
import type { UIMessage } from "ai";
import { AgentMessageBubble } from "@/components/agent/agent-message-bubble";
import { AgentTypingIndicator } from "@/components/agent/agent-typing-indicator";

type AgentMessageListProps = {
  messages: UIMessage[];
  status: string;
};

function getAssistantText(message: UIMessage): string {
  return (message.parts || [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

function shouldShowTyping(messages: UIMessage[], status: string): boolean {
  if (status === "submitted") return true;
  if (status !== "streaming") return false;

  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return true;
  return getAssistantText(last).length === 0;
}

export function AgentMessageList({ messages, status }: AgentMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const isStreaming = status === "streaming" || status === "submitted";
  const showTyping = shouldShowTyping(messages, status);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [messages, status, showTyping, reduceMotion]);

  return (
    <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 md:px-6">
      <AnimatePresence initial={false}>
        {messages.map((message, index) => (
          <m.div
            key={`${message.id}-${index}`}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.25, 1, 0.5, 1] }}
          >
            <AgentMessageBubble
              message={message}
              isStreaming={
                isStreaming &&
                index === messages.length - 1 &&
                message.role === "assistant"
              }
              showThinkingLog
            />
          </m.div>
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {showTyping ? (
          <m.div
            key="typing"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
            transition={{ duration: reduceMotion ? 0 : 0.15, ease: [0.25, 1, 0.5, 1] }}
          >
            <AgentTypingIndicator />
          </m.div>
        ) : null}
      </AnimatePresence>

      <div ref={bottomRef} />
    </div>
  );
}
