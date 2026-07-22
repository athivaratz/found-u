"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MatchComparePanel } from "@/components/admin/matching/match-compare-panel";
import { MatchActionBar } from "@/components/admin/matching/match-action-bar";
import {
  matchFocusRingClass,
  matchSecondaryCtaClass,
  type MatchBusyAction,
} from "@/components/admin/matching/matching-ui";
import type { AdminMatchPair } from "@/lib/match-admin-client";
import type { FoundItem, LostItem } from "@/lib/types";
import { useMediaQuery } from "@/hooks/use-media-query";

const SEARCH_MAX_LENGTH = 120;
const SEARCH_DEBOUNCE_MS = 200;
/** Soft cap — full list still searchable; keeps DOM light on large schools */
const LIST_RENDER_LIMIT = 80;

export function ManualMatchPanel({
  lostItems,
  foundItems,
  loadingItems,
  loadingMatches,
  matches,
  selected,
  busyAction,
  onSelectLost,
  onSelectFound,
  onClearSelected,
  onConfirm,
  onReject,
  getCategoryIcon,
}: {
  lostItems: LostItem[];
  foundItems: FoundItem[];
  loadingItems: boolean;
  loadingMatches: boolean;
  matches: AdminMatchPair[];
  selected: LostItem | FoundItem | null;
  busyAction: MatchBusyAction;
  onSelectLost: (item: LostItem) => void;
  onSelectFound: (item: FoundItem) => void;
  onClearSelected: () => void;
  onConfirm: (match: AdminMatchPair) => void;
  onReject: (match: AdminMatchPair) => void;
  getCategoryIcon: (category?: string) => string;
}) {
  const searchId = useId();
  const resultsId = useId();
  const [tab, setTab] = useState<"lost" | "found">("lost");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [focusMatch, setFocusMatch] = useState<AdminMatchPair | null>(null);
  const [listExpanded, setListExpanded] = useState(false);
  const isLgUp = useMediaQuery("(min-width: 1024px)");
  const prefersHover = useMediaQuery("(hover: hover) and (pointer: fine)");
  const isMdUp = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
      setListExpanded(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    const list = tab === "lost" ? lostItems : foundItems;
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => {
      const name =
        tab === "lost"
          ? (item as LostItem).itemName
          : (item as FoundItem).itemName || (item as FoundItem).description;
      const loc =
        tab === "lost"
          ? (item as LostItem).locationLost
          : (item as FoundItem).locationFound;
      return (
        item.trackingCode?.toLowerCase().includes(q) ||
        name?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        loc?.toLowerCase().includes(q)
      );
    });
  }, [tab, lostItems, foundItems, debouncedQuery]);

  const visibleItems = listExpanded ? filtered : filtered.slice(0, LIST_RENDER_LIMIT);
  const hiddenCount = Math.max(0, filtered.length - visibleItems.length);

  const activeMatch = focusMatch || matches[0] || null;
  const busy = busyAction !== null;

  /** Phone/tablet: master-detail — list OR detail, not both */
  const showList = isLgUp || !selected;
  const showDetail = isLgUp || !!selected;

  const listPanel = (
    <aside className="rounded-2xl border border-border-light bg-bg-card">
      <div className="flex border-b border-border-light" role="tablist" aria-label="ประเภทรายการ">
        {(["lost", "found"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            disabled={busy}
            onClick={() => {
              setTab(t);
              setFocusMatch(null);
            }}
            className={cn(
              "min-h-11 flex-1 px-3 py-2.5 text-sm font-medium motion-safe:transition-colors motion-safe:duration-200 disabled:opacity-50",
              matchFocusRingClass,
              tab === t
                ? "bg-bg-secondary text-text-primary"
                : "text-text-secondary active:bg-bg-secondary active:text-text-primary",
              prefersHover && tab !== t && "hover:bg-bg-secondary hover:text-text-primary"
            )}
          >
            {t === "lost" ? `ของหาย (${lostItems.length})` : `ของเจอ (${foundItems.length})`}
          </button>
        ))}
      </div>
      <div className="p-3">
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            ค้นหารายการด้วยชื่อ รหัสติดตาม หรือสถานที่
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
            aria-hidden
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, SEARCH_MAX_LENGTH))}
            maxLength={SEARCH_MAX_LENGTH}
            placeholder={isMdUp ? "ค้นหาชื่อหรือรหัส..." : "ค้นหา..."}
            autoComplete="off"
            enterKeyHint="search"
            aria-controls={resultsId}
            className={cn(
              "min-h-11 w-full rounded-xl bg-bg-secondary py-2 pl-9 pr-3 text-base text-text-primary outline-none placeholder:text-text-secondary focus:bg-bg-primary focus:ring-2 focus:ring-line-green/35",
              "[appearance:textfield] [&::-webkit-search-cancel-button]:hidden"
            )}
          />
        </div>
      </div>
      <div
        id={resultsId}
        className="max-h-[min(24rem,50dvh)] overflow-y-auto overscroll-contain lg:max-h-[min(26rem,60dvh)]"
        role="listbox"
        aria-label="รายการรอจับคู่"
      >
        {loadingItems ? (
          <div
            className="flex justify-center py-8"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader2 className="h-5 w-5 animate-spin text-text-secondary" aria-hidden />
            <span className="sr-only">กำลังโหลดรายการ</span>
          </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-secondary" role="status">
              {debouncedQuery.trim() ? "ไม่พบรายการที่ตรงกับคำค้น" : "ไม่พบรายการ"}
            </p>
          ) : (
            <>
              {visibleItems.map((item) => {
                const active = selected?.id === item.id;
                const title =
                  tab === "lost"
                    ? (item as LostItem).itemName
                    : (item as FoundItem).itemName || (item as FoundItem).description;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={busy || loadingMatches}
                    onClick={() => {
                      setFocusMatch(null);
                      if (tab === "lost") onSelectLost(item as LostItem);
                      else onSelectFound(item as FoundItem);
                    }}
                    className={cn(
                      "w-full min-h-11 border-t border-border-light px-4 py-3 text-left motion-safe:transition-colors motion-safe:duration-200 disabled:opacity-50",
                      "[content-visibility:auto] [contain-intrinsic-size:auto_3.5rem]",
                      matchFocusRingClass,
                      active ? "bg-bg-tertiary" : "active:bg-bg-secondary",
                      prefersHover && !active && "hover:bg-bg-secondary"
                    )}
                  >
                    <p className="truncate text-sm font-medium text-text-primary">{title}</p>
                    <p className="truncate font-mono text-xs text-text-secondary">
                      {item.trackingCode}
                    </p>
                  </button>
                );
              })}
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setListExpanded(true)}
                  className={cn(
                    "w-full min-h-11 border-t border-border-light px-4 py-3 text-sm font-medium text-line-green-link",
                    matchFocusRingClass,
                    prefersHover && "hover:bg-bg-secondary"
                  )}
                >
                  แสดงอีก {hiddenCount} รายการ
                </button>
              ) : null}
            </>
          )}
      </div>
    </aside>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]">
      {showList ? listPanel : null}

      {showDetail ? (
        <div className="min-w-0 space-y-3 sm:space-y-4">
          {!isLgUp && selected ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setFocusMatch(null);
                onClearSelected();
              }}
              className={cn(
                matchSecondaryCtaClass,
                "disabled:opacity-50",
                matchFocusRingClass,
                prefersHover && "hover:bg-border-light"
              )}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              กลับไปเลือกรายการ
            </button>
          ) : null}

          {!selected ? (
            <div
              className="rounded-2xl border border-dashed border-border-light px-4 py-12 text-center sm:px-6 sm:py-16"
              role="status"
            >
              <p className="text-pretty text-sm text-text-secondary">
                {isLgUp
                  ? "เลือกรายการทางซ้ายเพื่อดูคู่ที่อาจตรงกัน"
                  : "เลือกรายการด้านบนเพื่อดูคู่ที่อาจตรงกัน"}
              </p>
            </div>
          ) : loadingMatches ? (
            <div
              className="flex flex-col items-center justify-center gap-2 py-12 sm:py-16"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2 className="h-7 w-7 animate-spin text-text-secondary" aria-hidden />
              <p className="text-sm text-text-secondary">กำลังค้นหาคู่...</p>
            </div>
          ) : !activeMatch ? (
            <div
              className="rounded-2xl border border-dashed border-border-light px-4 py-12 text-center sm:px-6 sm:py-16"
              role="status"
            >
              <p className="text-pretty text-sm text-text-secondary">
                ไม่พบคู่ที่คล้ายกันสำหรับรายการนี้
              </p>
              {!isLgUp ? (
                <button
                  type="button"
                  onClick={onClearSelected}
                  className={cn(
                    matchSecondaryCtaClass,
                    "mt-4",
                    matchFocusRingClass,
                    prefersHover && "hover:bg-border-light"
                  )}
                >
                  เลือกรายการอื่น
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {matches.length > 1 ? (
                <div
                  className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5"
                  role="group"
                  aria-label="คู่ที่แนะนำ"
                >
                  {matches.map((m, index) => {
                    const isActive = (focusMatch?.key || matches[0]?.key) === m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        aria-pressed={isActive}
                        disabled={busy}
                        onClick={() => setFocusMatch(m)}
                      className={cn(
                        "min-h-11 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium tabular-nums motion-safe:transition-colors motion-safe:duration-200 disabled:opacity-50",
                        matchFocusRingClass,
                        isActive
                          ? "bg-bg-tertiary text-text-primary"
                          : "bg-bg-secondary text-text-secondary active:bg-bg-tertiary",
                        prefersHover && !isActive && "hover:bg-bg-tertiary"
                      )}
                    >
                      {m.scorePercentage}%
                    </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
                <MatchComparePanel match={activeMatch} getCategoryIcon={getCategoryIcon} />
              </div>
              <MatchActionBar
                busyAction={busyAction}
                onReject={() => onReject(activeMatch)}
                onSkip={() => {
                  if (busy) return;
                  const idx = matches.findIndex((m) => m.key === activeMatch.key);
                  const next = matches[idx + 1] || matches[0];
                  if (next && next.key !== activeMatch.key) setFocusMatch(next);
                }}
                onConfirm={() => onConfirm(activeMatch)}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
