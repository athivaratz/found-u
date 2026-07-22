"use client";

import { CheckCircle2, SkipForward, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  matchFocusRingClass,
  type MatchBusyAction,
} from "@/components/admin/matching/matching-ui";

export function MatchActionBar({
  busyAction = null,
  onReject,
  onSkip,
  onConfirm,
}: {
  busyAction?: MatchBusyAction;
  onReject: () => void;
  onSkip: () => void;
  onConfirm: () => void;
}) {
  const busy = busyAction !== null;
  const prefersHover = useMediaQuery("(hover: hover) and (pointer: fine)");
  const isLgUp = useMediaQuery("(min-width: 1024px)");

  return (
    <div
      className={cn(
        "z-30 border-t border-border-light bg-bg-card",
        isLgUp
          ? "relative rounded-2xl border px-4 py-3"
          : "fixed inset-x-0 bottom-0 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-4"
      )}
      aria-busy={busy}
    >
      <div className="mx-auto flex max-w-3xl flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-center">
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          aria-label="ไม่ตรงกัน (คีย์ลัด R)"
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-border-light bg-bg-card px-4 py-2.5 text-sm font-medium text-text-primary motion-safe:transition-colors motion-safe:duration-200 disabled:opacity-50 sm:px-5 touch-manipulation",
            "active:bg-bg-secondary",
            prefersHover && "hover:bg-bg-secondary",
            matchFocusRingClass
          )}
        >
          {busyAction === "reject" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <XCircle className="h-4 w-4 text-text-secondary" aria-hidden />
          )}
          ไม่ตรง
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          aria-label="ข้ามคู่นี้ (คีย์ลัด S)"
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-bg-secondary px-4 py-2.5 text-sm font-medium text-text-secondary motion-safe:transition-colors motion-safe:duration-200 disabled:opacity-50 sm:px-5 touch-manipulation",
            "active:bg-bg-tertiary",
            prefersHover && "hover:bg-bg-tertiary",
            matchFocusRingClass
          )}
        >
          <SkipForward className="h-4 w-4" aria-hidden />
          ข้าม
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          aria-label="ยืนยันจับคู่ (คีย์ลัด C)"
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-line-green-cta px-4 py-2.5 text-sm font-medium text-white motion-safe:transition-colors motion-safe:duration-200 disabled:opacity-50 sm:px-5 touch-manipulation",
            "active:bg-line-green-cta-hover",
            prefersHover && "hover:bg-line-green-cta-hover",
            matchFocusRingClass
          )}
        >
          {busyAction === "confirm" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          )}
          ยืนยันจับคู่
        </button>
      </div>
    </div>
  );
}
