"use client";

import { cn } from "@/lib/utils";

type AgentTypingIndicatorProps = {
  className?: string;
};

/** Facebook Messenger-style typing bubble */
export function AgentTypingIndicator({ className }: AgentTypingIndicatorProps) {
  return (
    <div className={cn("flex gap-3 mb-4", className)}>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-line-green to-emerald-500 shrink-0" />
      <div
        className="inline-flex items-center gap-1 px-4 py-3 rounded-2xl rounded-bl-md bg-bg-tertiary dark:bg-white/10"
        aria-label="กำลังพิมพ์"
      >
        <span className="agent-typing-dot" />
        <span className="agent-typing-dot [animation-delay:0.15s]" />
        <span className="agent-typing-dot [animation-delay:0.3s]" />
      </div>
    </div>
  );
}
