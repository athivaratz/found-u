"use client";

import { Search } from "lucide-react";
import { thaiCopy } from "@/lib/copy/thai-student";
import { cn } from "@/lib/utils";

type AgentEmptyStateProps = {
  onSelectPrompt: (prompt: string) => void;
  className?: string;
};

export function AgentEmptyState({ onSelectPrompt, className }: AgentEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center text-center px-4 py-6 min-h-0 overflow-y-auto",
        className
      )}
    >
      <div className="w-full max-w-lg md:max-w-xl my-auto">
        <div
          className="agent-avatar w-16 h-16 md:w-[4.5rem] md:h-[4.5rem] mx-auto mb-5 md:mb-6"
          aria-hidden
        >
          <Search className="w-7 h-7 md:w-8 md:h-8" strokeWidth={2.25} />
        </div>

        <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-2 text-balance">
          {thaiCopy.agent.welcome}
        </h2>
        <p className="text-sm text-text-secondary mb-6 md:mb-8 max-w-md mx-auto leading-relaxed">
          {thaiCopy.agent.welcomeHint}
        </p>

        <div className="flex flex-col gap-2 w-full">
          {thaiCopy.agent.suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onSelectPrompt(prompt)}
              className="w-full text-left px-4 py-3 rounded-xl bg-bg-card border border-border-light hover:border-line-green/50 hover:bg-line-green-light/40 text-sm text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/30"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
