"use client";

import { m } from "framer-motion";
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
        <m.div
          className="relative w-16 h-16 md:w-20 md:h-20 mx-auto mb-5 md:mb-6"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-line-green/30 to-emerald-400/20 blur-md" />
          <div className="relative w-full h-full rounded-full bg-gradient-to-br from-line-green to-emerald-500 shadow-lg" />
        </m.div>

        <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-2">
          {thaiCopy.agent.welcome}
        </h2>
        <p className="text-sm text-text-secondary mb-6 md:mb-8 max-w-md mx-auto">
          ถามได้เลย หรือเลือกคำถามด้านล่าง — ผมจะค้นในฐานข้อมูลให้
        </p>

        <div className="flex flex-col gap-2 w-full">
          {thaiCopy.agent.suggestedPrompts.map((prompt, i) => (
            <m.button
              key={prompt}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => onSelectPrompt(prompt)}
              className="w-full text-left px-4 py-3 rounded-2xl bg-bg-card border border-border-light hover:border-line-green/40 hover:bg-line-green-light/30 text-sm text-text-primary transition-colors"
            >
              {prompt}
            </m.button>
          ))}
        </div>
      </div>
    </div>
  );
}
