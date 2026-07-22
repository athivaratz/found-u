"use client";

import { MatchComparePanel } from "@/components/admin/matching/match-compare-panel";
import { MatchActionBar } from "@/components/admin/matching/match-action-bar";
import { MatchQueueRail } from "@/components/admin/matching/match-queue-rail";
import {
  matchFocusRingClass,
  matchSecondaryCtaClass,
  type MatchBusyAction,
} from "@/components/admin/matching/matching-ui";
import type { AdminMatchPair } from "@/lib/match-admin-client";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";

export function MatchReviewQueue({
  matches,
  activeKey,
  busyAction,
  pool,
  loading,
  filterActive,
  totalMatches,
  onClearFilter,
  onGoManual,
  onSelect,
  onConfirm,
  onReject,
  onSkip,
  getCategoryIcon,
}: {
  matches: AdminMatchPair[];
  activeKey: string | null;
  busyAction: MatchBusyAction;
  pool: { lost: number; found: number };
  loading: boolean;
  filterActive: boolean;
  totalMatches: number;
  onClearFilter: () => void;
  onGoManual: () => void;
  onSelect: (key: string) => void;
  onConfirm: () => void;
  onReject: () => void;
  onSkip: () => void;
  getCategoryIcon: (category?: string) => string;
}) {
  const prefersHover = useMediaQuery("(hover: hover) and (pointer: fine)");
  const active = matches.find((m) => m.key === activeKey) || matches[0] || null;

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-16 sm:py-24"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="h-8 w-8 animate-spin text-text-secondary" aria-hidden />
        <p className="text-sm text-text-secondary">กำลังจัดคิวคู่ที่อาจตรงกัน...</p>
      </div>
    );
  }

  if (!active) {
    if (filterActive && totalMatches > 0) {
      return (
        <div
          className="rounded-2xl border border-dashed border-border-light px-4 py-12 text-center sm:px-6 sm:py-16"
          role="status"
        >
          <p className="text-base font-medium text-text-primary text-balance">
            ไม่มีคู่ในระดับความมั่นใจนี้
          </p>
          <p className="mt-2 text-pretty text-sm text-text-secondary">
            ยังมี {totalMatches} คู่ในคิว — ลองดูทั้งหมดหรือเลือกระดับอื่น
          </p>
          <button
            type="button"
            onClick={onClearFilter}
            className={cn(
              matchSecondaryCtaClass,
              "mt-4",
              matchFocusRingClass,
              prefersHover && "hover:bg-border-light"
            )}
          >
            แสดงทั้งหมด
          </button>
        </div>
      );
    }

    const canManual = pool.lost > 0 || pool.found > 0;

    return (
      <div
        className="rounded-2xl border border-dashed border-border-light px-4 py-12 text-center sm:px-6 sm:py-16"
        role="status"
      >
        <p className="text-base font-medium text-text-primary text-balance">
          ไม่มีคู่รอตรวจตอนนี้
        </p>
        <p className="mt-2 text-pretty text-sm text-text-secondary">
          ของหายรอจับคู่ {pool.lost} รายการ · ของเจอรอจับคู่ {pool.found} รายการ
        </p>
        <p className="mt-1 text-pretty text-xs text-text-secondary">
          ระบบจะเสนอคู่เมื่อมีรายการที่คล้ายกันในช่วง 30 วัน
        </p>
        {canManual ? (
          <button
            type="button"
            onClick={onGoManual}
            className={cn(
              matchSecondaryCtaClass,
              "mt-4",
              matchFocusRingClass,
              prefersHover && "hover:bg-border-light"
            )}
          >
            เลือกจับคู่เอง
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px] lg:gap-6">
      <div className="order-1 min-w-0 lg:order-2">
        <MatchQueueRail matches={matches} activeKey={active.key} onSelect={onSelect} />
      </div>

      <div className="order-2 min-w-0 space-y-3 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:space-y-4 lg:order-1 lg:pb-0">
        <MatchComparePanel match={active} getCategoryIcon={getCategoryIcon} />
        <MatchActionBar
          busyAction={busyAction}
          onReject={onReject}
          onSkip={onSkip}
          onConfirm={onConfirm}
        />
      </div>
    </div>
  );
}
