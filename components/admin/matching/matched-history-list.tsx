"use client";

import { Loader2, Undo2 } from "lucide-react";
import { cn, formatThaiDate } from "@/lib/utils";
import type { ConfirmedHistoryPair } from "@/lib/match-admin-client";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  matchFocusRingClass,
  matchSecondaryCtaClass,
} from "@/components/admin/matching/matching-ui";

export function MatchedHistoryList({
  items,
  busyKey,
  onUnmatch,
  onGoQueue,
}: {
  items: ConfirmedHistoryPair[];
  busyKey: string | null;
  onUnmatch: (pair: ConfirmedHistoryPair) => void;
  onGoQueue?: () => void;
}) {
  const prefersHover = useMediaQuery("(hover: hover) and (pointer: fine)");

  if (items.length === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed border-border-light px-4 py-10 text-center sm:px-6 sm:py-12"
        role="status"
      >
        <p className="text-base font-medium text-text-primary text-balance">
          ยังไม่มีคู่ที่ยืนยันจับคู่
        </p>
        <p className="mt-1 text-pretty text-sm text-text-secondary">
          เมื่อยืนยันจากคิวตรวจ จะแสดงที่นี่
        </p>
        {onGoQueue ? (
          <button
            type="button"
            onClick={onGoQueue}
            className={cn(
              matchSecondaryCtaClass,
              "mt-4",
              matchFocusRingClass,
              prefersHover && "hover:bg-border-light"
            )}
          >
            ไปที่คิวตรวจ
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-light overflow-hidden rounded-2xl border border-border-light bg-bg-card">
      {items.map((pair) => {
        const busy = busyKey === pair.key;
        const anyBusy = busyKey !== null;
        const lostName = pair.lostItem.itemName;
        const foundName = pair.foundItem.itemName?.trim() || pair.foundItem.description;
        return (
          <li
            key={pair.key}
            className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 [content-visibility:auto] [contain-intrinsic-size:auto_5rem]"
          >
            <div className="min-w-0 space-y-1">
              <p
                className="text-sm font-medium text-text-primary sm:truncate"
                title={`${lostName} ↔ ${foundName}`}
              >
                <span className="break-words">{lostName}</span>
                <span className="mx-2 text-text-secondary" aria-hidden>
                  ↔
                </span>
                <span className="break-words">{foundName}</span>
              </p>
              <p className="text-xs text-text-secondary">
                <span className="font-mono">{pair.lostItem.trackingCode}</span>
                {" · "}
                <span className="font-mono">{pair.foundItem.trackingCode}</span>
                {pair.matchedAt ? ` · ${formatThaiDate(pair.matchedAt)}` : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={anyBusy}
              aria-busy={busy}
              aria-label={`ถอนจับคู่ ${lostName} กับ ${foundName}`}
              onClick={() => onUnmatch(pair)}
              className={cn(
                "inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-full border border-border-light px-4 py-2 text-sm font-medium text-text-secondary motion-safe:transition-colors motion-safe:duration-200 disabled:opacity-50 sm:w-auto",
                "active:bg-bg-secondary",
                prefersHover && "hover:bg-bg-secondary",
                matchFocusRingClass
              )}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Undo2 className="h-3.5 w-3.5" aria-hidden />
              )}
              ถอนจับคู่
            </button>
          </li>
        );
      })}
    </ul>
  );
}
