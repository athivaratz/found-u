"use client";

import { RotateCcw } from "lucide-react";
import { ModeSwitcher } from "@/components/agent/mode-switcher";
import { cn } from "@/lib/utils";
import { thaiCopy } from "@/lib/copy/thai-student";

type AgentTopBarProps = {
  isThinking?: boolean;
  onNewChat?: () => void;
  className?: string;
};

export function AgentTopBar({ isThinking, onNewChat, className }: AgentTopBarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3",
        "agent-glass bg-bg-primary/80 dark:bg-bg-primary/60 border-b border-border-light/60 dark:border-white/10",
        className
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-line-green to-emerald-500" />
          {isThinking ? (
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-line-green border-2 border-bg-primary animate-pulse" />
          ) : null}
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-text-primary truncate">Found-U Agent</h1>
          <p className="text-[10px] text-text-tertiary truncate">
            {isThinking ? thaiCopy.agent.thinking : "ผู้ช่วย Lost & Found"}
          </p>
        </div>
      </div>

      <ModeSwitcher variant="compact" className="hidden sm:inline-flex" />

      {onNewChat ? (
        <button
          type="button"
          onClick={onNewChat}
          className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors shrink-0"
          aria-label={thaiCopy.agent.newChat}
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      ) : (
        <div className="w-9 shrink-0 sm:hidden" />
      )}
    </header>
  );
}
