"use client";

import { ItemResultCard, type SerializedItem } from "@/components/agent/item-result-card";
import { cn } from "@/lib/utils";

type MatchResultCardProps = {
  match: {
    scorePercentage: number;
    confidence: string;
    lostItem: SerializedItem;
    foundItem: SerializedItem;
    reasons?: string[];
  };
  className?: string;
};

export function MatchResultCard({ match, className }: MatchResultCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl p-4 agent-glass bg-white/70 dark:bg-white/5 border border-white/30 dark:border-white/10",
        className
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="relative w-12 h-12 rounded-full flex items-center justify-center bg-line-green-light text-line-green font-bold text-sm"
          style={{
            background: `conic-gradient(var(--line-green) ${match.scorePercentage}%, var(--bg-tertiary) 0)`,
          }}
        >
          <span className="absolute inset-1 rounded-full bg-bg-card flex items-center justify-center text-xs">
            {match.scorePercentage}%
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">ความน่าจะเป็นคู่กัน</p>
          <p className="text-xs text-text-secondary capitalize">{match.confidence}</p>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        <ItemResultCard item={match.lostItem} />
        <ItemResultCard item={match.foundItem} />
      </div>
    </div>
  );
}
