"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type AgentTypingIndicatorProps = {
  className?: string;
};

export function AgentTypingIndicator({ className }: AgentTypingIndicatorProps) {
  return (
    <div className={cn("flex gap-3 mb-4", className)}>
      <div className="agent-avatar w-8 h-8" aria-hidden>
        <Search className="w-4 h-4" strokeWidth={2.25} />
      </div>
      <div
        className="inline-flex items-center gap-1 px-4 py-3 rounded-2xl rounded-bl-md bg-bg-tertiary"
        aria-label="กำลังพิมพ์"
      >
        <span className="agent-typing-dot" />
        <span className="agent-typing-dot [animation-delay:0.15s]" />
        <span className="agent-typing-dot [animation-delay:0.3s]" />
      </div>
    </div>
  );
}
