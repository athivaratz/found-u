"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import type { AdminMatchPair } from "@/lib/match-admin-client";
import { useMediaQuery } from "@/hooks/use-media-query";
import { matchFocusRingClass } from "@/components/admin/matching/matching-ui";

function MatchQueueRailInner({
  matches,
  activeKey,
  onSelect,
}: {
  matches: AdminMatchPair[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  const prefersHover = useMediaQuery("(hover: hover) and (pointer: fine)");

  if (matches.length === 0) return null;

  const visible = matches.slice(0, 8);
  const remaining = matches.length - visible.length;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-text-secondary">คิวถัดไป</p>
      <div
        className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-col lg:overflow-visible lg:snap-none lg:pb-0"
        role="listbox"
        aria-label="คิวคู่ที่รอตรวจ"
      >
        {visible.map((match, index) => {
          const active = match.key === activeKey;
          const lostName = match.lostItem.itemName;
          const foundName = match.foundItem.itemName?.trim() || match.foundItem.description;
          return (
            <button
              key={match.key}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(match.key)}
              aria-label={`คู่ที่ ${index + 1} คะแนน ${match.scorePercentage} เปอร์เซ็นต์ ${lostName} กับ ${foundName}`}
              className={cn(
                "min-h-11 min-w-[9.5rem] shrink-0 snap-start rounded-xl border px-3 py-2.5 text-left motion-safe:transition-colors motion-safe:duration-200 touch-manipulation sm:min-w-[10.5rem] lg:min-w-0",
                "[content-visibility:auto] [contain-intrinsic-size:auto_4.5rem]",
                matchFocusRingClass,
                active
                  ? "border-border-light bg-bg-tertiary"
                  : "border-transparent bg-bg-secondary active:bg-bg-tertiary",
                prefersHover && !active && "hover:bg-bg-tertiary"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-text-secondary">#{index + 1}</span>
                <span className="text-xs font-medium tabular-nums text-text-secondary">
                  {match.scorePercentage}%
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-text-secondary">{lostName}</p>
              <p className="truncate text-xs text-text-secondary">↔ {foundName}</p>
            </button>
          );
        })}
      </div>
      {remaining > 0 ? (
        <p className="text-xs text-text-secondary">และอีก {remaining} คู่ในคิว</p>
      ) : null}
    </div>
  );
}

export const MatchQueueRail = memo(MatchQueueRailInner);
