"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { useCategories } from "@/contexts/DataContext";
import {
  MATCHABLE_FOUND_STATUSES,
  MATCHABLE_LOST_STATUSES,
} from "@/lib/matching";
import {
  confirmMatchApi,
  fetchItemMatches,
  fetchMatchBatch,
  rejectMatchApi,
  unmatchPairApi,
  type AdminMatchPair,
  type ConfirmedHistoryPair,
  type MatchBatchResponse,
} from "@/lib/match-admin-client";
import { subscribeToFoundItems, subscribeToLostItems } from "@/lib/database";
import { isLostItem, type FoundItem, type LostItem } from "@/lib/types";
import { StatusAlert } from "@/components/ui/status-alert";
import {
  adminPageShellClass,
} from "@/components/admin/admin-ui";
import {
  matchFocusRingClass,
  type MatchBusyAction,
} from "@/components/admin/matching/matching-ui";
import { useMediaQuery } from "@/hooks/use-media-query";

const MatchReviewQueue = nextDynamic(
  () =>
    import("@/components/admin/matching/match-review-queue").then((m) => ({
      default: m.MatchReviewQueue,
    })),
  {
    loading: () => <MatchingPanelSkeleton label="กำลังโหลดคิวตรวจ..." />,
  }
);

const ManualMatchPanel = nextDynamic(
  () =>
    import("@/components/admin/matching/manual-match-panel").then((m) => ({
      default: m.ManualMatchPanel,
    })),
  {
    loading: () => <MatchingPanelSkeleton label="กำลังโหลดตัวเลือกเอง..." />,
  }
);

const MatchedHistoryList = nextDynamic(
  () =>
    import("@/components/admin/matching/matched-history-list").then((m) => ({
      default: m.MatchedHistoryList,
    })),
  {
    loading: () => <MatchingPanelSkeleton label="กำลังโหลดประวัติ..." />,
  }
);

function MatchingPanelSkeleton({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-16"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-7 w-7 animate-spin text-text-secondary" aria-hidden />
      <p className="text-sm text-text-secondary">{label}</p>
    </div>
  );
}

type Tab = "queue" | "manual" | "history";
type ConfidenceFilter = "all" | "high" | "medium" | "low";

/** Avoid refetching when remounting / focus churn within TTL */
const BATCH_CACHE_TTL_MS = 60_000;
let batchCache: {
  key: string;
  data: MatchBatchResponse;
  at: number;
} | null = null;

function batchCacheKey(userId: string, useAI: boolean) {
  return `${userId}:${useAI ? "ai" : "plain"}`;
}

const chipClass =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium motion-safe:transition-colors motion-safe:duration-200 disabled:opacity-50 touch-manipulation";

const tabClass =
  "min-h-11 snap-start rounded-full px-4 py-2 text-sm font-medium motion-safe:transition-colors motion-safe:duration-200 touch-manipulation";

export default function AdminMatchingPage() {
  const tabsId = useId();
  const confidenceId = useId();
  const aiToggleId = useId();
  const statusLiveId = useId();

  const { user } = useAuth();
  const { showAlert, showConfirm, dialog } = useAppDialog();
  const { getCategoryByValue } = useCategories();
  const isMdUp = useMediaQuery("(min-width: 768px)");
  const prefersHover = useMediaQuery("(hover: hover) and (pointer: fine)");

  const [tab, setTab] = useState<Tab>("queue");
  const [useAI, setUseAI] = useState(false);
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");

  const [matches, setMatches] = useState<AdminMatchPair[]>([]);
  const [history, setHistory] = useState<ConfirmedHistoryPair[]>([]);
  const [pool, setPool] = useState({ lost: 0, found: 0, highConfidence: 0 });
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<MatchBusyAction>(null);
  const [historyBusyKey, setHistoryBusyKey] = useState<string | null>(null);

  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  const [foundItems, setFoundItems] = useState<FoundItem[]>([]);
  const [loadingPoolItems, setLoadingPoolItems] = useState(false);

  const [selectedItem, setSelectedItem] = useState<LostItem | FoundItem | null>(null);
  const [manualMatches, setManualMatches] = useState<AdminMatchPair[]>([]);
  const [loadingManual, setLoadingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const userRef = useRef(user);
  userRef.current = user;
  const useAIRef = useRef(useAI);
  useAIRef.current = useAI;
  const batchGenRef = useRef(0);
  const manualGenRef = useRef(0);
  const poolReadyRef = useRef(false);
  const showAlertRef = useRef(showAlert);
  showAlertRef.current = showAlert;
  const showConfirmRef = useRef(showConfirm);
  showConfirmRef.current = showConfirm;

  const busy = busyAction !== null;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const getToken = useCallback(async () => {
    const current = userRef.current;
    if (!current) throw new Error("Not authenticated");
    return current.getIdToken();
  }, []);

  const getCategoryIcon = useCallback(
    (category?: string) => getCategoryByValue(category || "other")?.icon || "📦",
    [getCategoryByValue]
  );

  const applyBatchData = useCallback((data: MatchBatchResponse) => {
    setMatches(data.matches || []);
    setPool(data.pool || { lost: 0, found: 0, highConfidence: 0 });
    setHistory(data.history || []);
    setActiveKey((prev) => {
      if (prev && data.matches.some((m) => m.key === prev)) return prev;
      return data.matches[0]?.key ?? null;
    });
  }, []);

  const loadBatch = useCallback(
    async (options?: { force?: boolean }) => {
      const currentUser = userRef.current;
      if (!currentUser?.uid) return;

      const key = batchCacheKey(currentUser.uid, useAIRef.current);
      const cached = batchCache;
      if (
        !options?.force &&
        cached &&
        cached.key === key &&
        Date.now() - cached.at < BATCH_CACHE_TTL_MS
      ) {
        applyBatchData(cached.data);
        setLoadError(null);
        setLoadingBatch(false);
        return;
      }

      const gen = ++batchGenRef.current;

      if (options?.force || !cached || cached.key !== key) {
        setLoadingBatch(true);
      }

      try {
        const data = await fetchMatchBatch(getToken, { useAI: useAIRef.current });
        if (gen !== batchGenRef.current) return;
        batchCache = { key, data, at: Date.now() };
        applyBatchData(data);
        setLoadError(null);
      } catch (error) {
        if (gen !== batchGenRef.current) return;
        console.error(error);
        const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
        setLoadError(message);
      } finally {
        if (gen === batchGenRef.current) {
          setLoadingBatch(false);
        }
      }
    },
    [applyBatchData, getToken]
  );

  useEffect(() => {
    if (!user?.uid) return;
    void loadBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only userId + useAI
  }, [user?.uid, useAI]);

  useEffect(() => {
    return () => {
      batchGenRef.current += 1;
      manualGenRef.current += 1;
    };
  }, []);

  // Subscribe to matchable pool only when Manual tab needs it
  useEffect(() => {
    if (tab !== "manual") return;

    let cancelled = false;
    let gotLost = false;
    let gotFound = false;

    if (!poolReadyRef.current) {
      setLoadingPoolItems(true);
    }

    const done = () => {
      if (cancelled) return;
      if (gotLost && gotFound) {
        setLoadingPoolItems(false);
        poolReadyRef.current = true;
      }
    };

    const unsubLost = subscribeToLostItems((items) => {
      if (cancelled) return;
      setLostItems(
        items.filter(
          (item) =>
            (MATCHABLE_LOST_STATUSES as readonly string[]).includes(item.status) &&
            !item.matchedFoundId
        )
      );
      gotLost = true;
      done();
    });

    const unsubFound = subscribeToFoundItems((items) => {
      if (cancelled) return;
      setFoundItems(
        items.filter(
          (item) =>
            (MATCHABLE_FOUND_STATUSES as readonly string[]).includes(item.status) &&
            !item.matchedLostId
        )
      );
      gotFound = true;
      done();
    });

    return () => {
      cancelled = true;
      unsubLost();
      unsubFound();
    };
  }, [tab]);

  const filteredMatches = useMemo(() => {
    if (confidenceFilter === "all") return matches;
    return matches.filter((m) => m.confidence === confidenceFilter);
  }, [matches, confidenceFilter]);

  useEffect(() => {
    if (filteredMatches.length === 0) {
      setActiveKey(null);
      return;
    }
    if (!activeKey || !filteredMatches.some((m) => m.key === activeKey)) {
      setActiveKey(filteredMatches[0].key);
    }
  }, [filteredMatches, activeKey]);

  const advanceQueue = useCallback((removedKey: string) => {
    setMatches((prev) => {
      const next = prev.filter((m) => m.key !== removedKey);
      const idx = prev.findIndex((m) => m.key === removedKey);
      const fallback = next[idx] || next[idx - 1] || next[0] || null;
      setActiveKey(fallback?.key ?? null);
      return next;
    });
  }, []);

  const activeMatch =
    filteredMatches.find((m) => m.key === activeKey) || filteredMatches[0] || null;
  const activeMatchRef = useRef(activeMatch);
  activeMatchRef.current = activeMatch;
  const filteredMatchesRef = useRef(filteredMatches);
  filteredMatchesRef.current = filteredMatches;

  const invalidateBatchCache = useCallback(() => {
    batchCache = null;
  }, []);

  const handleConfirm = useCallback(
    async (match: AdminMatchPair) => {
      if (busyRef.current) return;
      setBusyAction("confirm");
      try {
        await confirmMatchApi(getToken, match.lostItem.id, match.foundItem.id);
        invalidateBatchCache();
        advanceQueue(match.key);
        setHistory((prev) => [
          {
            key: match.key,
            lostItem: match.lostItem,
            foundItem: match.foundItem,
            matchedAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setPool((p) => ({
          ...p,
          lost: Math.max(0, p.lost - 1),
          found: Math.max(0, p.found - 1),
        }));
        void showAlertRef.current({
          title: "จับคู่สำเร็จ",
          message: "อัปเดตสถานะเป็นพร้อมให้เจ้าของมารับแล้ว",
          variant: "success",
        });
      } catch (error) {
        void showAlertRef.current({
          title: "จับคู่ไม่สำเร็จ",
          message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
          variant: "error",
        });
      } finally {
        setBusyAction(null);
      }
    },
    [advanceQueue, getToken, invalidateBatchCache]
  );

  const handleReject = useCallback(
    async (match: AdminMatchPair) => {
      if (busyRef.current) return;
      setBusyAction("reject");
      try {
        await rejectMatchApi(getToken, match.lostItem.id, match.foundItem.id);
        invalidateBatchCache();
        advanceQueue(match.key);
      } catch (error) {
        void showAlertRef.current({
          title: "ปฏิเสธไม่สำเร็จ",
          message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
          variant: "error",
        });
      } finally {
        setBusyAction(null);
      }
    },
    [advanceQueue, getToken, invalidateBatchCache]
  );

  const handleSkip = useCallback(() => {
    const current = activeMatchRef.current;
    const list = filteredMatchesRef.current;
    if (!current || list.length <= 1 || busyRef.current) return;
    const idx = list.findIndex((m) => m.key === current.key);
    const next = list[(idx + 1) % list.length];
    setActiveKey(next.key);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tabRef.current !== "queue" || busyRef.current || !activeMatchRef.current) return;
      if (document.querySelector('[aria-modal="true"]')) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      const key = e.key.toLowerCase();
      if (key === "c") {
        e.preventDefault();
        void handleConfirm(activeMatchRef.current);
      } else if (key === "r") {
        e.preventDefault();
        void handleReject(activeMatchRef.current);
      } else if (key === "s") {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleConfirm, handleReject, handleSkip]);

  const loadManualMatches = useCallback(
    async (type: "lost" | "found", item: LostItem | FoundItem) => {
      setSelectedItem(item);
      setLoadingManual(true);
      setManualMatches([]);
      setManualError(null);
      const gen = ++manualGenRef.current;
      try {
        const results = await fetchItemMatches(getToken, type, item.id, useAIRef.current);
        if (gen !== manualGenRef.current) return;
        setManualMatches(results);
      } catch (error) {
        if (gen !== manualGenRef.current) return;
        const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
        setManualError(message);
      } finally {
        if (gen === manualGenRef.current) {
          setLoadingManual(false);
        }
      }
    },
    [getToken]
  );

  const handleUnmatch = useCallback(
    async (pair: ConfirmedHistoryPair) => {
      if (historyBusyKey) return;
      const ok = await showConfirmRef.current({
        title: "ถอนจับคู่นี้?",
        message: "รายการจะกลับไปรอจับคู่ใหม่",
      });
      if (!ok) return;
      setHistoryBusyKey(pair.key);
      try {
        await unmatchPairApi(getToken, pair.lostItem.id, pair.foundItem.id);
        setHistory((prev) => prev.filter((h) => h.key !== pair.key));
        await loadBatch({ force: true });
        void showAlertRef.current({
          title: "ถอนจับคู่แล้ว",
          message: "รายการกลับสู่สถานะรอจับคู่",
          variant: "success",
        });
      } catch (error) {
        void showAlertRef.current({
          title: "ถอนจับคู่ไม่สำเร็จ",
          message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
          variant: "error",
        });
      } finally {
        setHistoryBusyKey(null);
      }
    },
    [getToken, historyBusyKey, loadBatch]
  );

  const onConfirmActive = useCallback(() => {
    const match = activeMatchRef.current;
    if (match) void handleConfirm(match);
  }, [handleConfirm]);

  const onRejectActive = useCallback(() => {
    const match = activeMatchRef.current;
    if (match) void handleReject(match);
  }, [handleReject]);

  const onClearFilter = useCallback(() => setConfidenceFilter("all"), []);
  const onGoManual = useCallback(() => setTab("manual"), []);
  const onGoQueue = useCallback(() => setTab("queue"), []);
  const onClearSelected = useCallback(() => {
    setSelectedItem(null);
    setManualMatches([]);
    setManualError(null);
  }, []);

  const onManualConfirm = useCallback(
    async (match: AdminMatchPair) => {
      await handleConfirm(match);
      setManualMatches((prev) => prev.filter((m) => m.key !== match.key));
    },
    [handleConfirm]
  );

  const onManualReject = useCallback(
    async (match: AdminMatchPair) => {
      await handleReject(match);
      setManualMatches((prev) => prev.filter((m) => m.key !== match.key));
    },
    [handleReject]
  );

  const onSelectLost = useCallback(
    (item: LostItem) => void loadManualMatches("lost", item),
    [loadManualMatches]
  );
  const onSelectFound = useCallback(
    (item: FoundItem) => void loadManualMatches("found", item),
    [loadManualMatches]
  );

  const highConfidenceCount = useMemo(
    () => matches.reduce((n, m) => (m.confidence === "high" ? n + 1 : n), 0),
    [matches]
  );
  const summaryLine = isMdUp
    ? `รอตรวจ ${filteredMatches.length} คู่ · มั่นใจสูง ${highConfidenceCount} · ของหาย ${pool.lost} · ของเจอ ${pool.found}`
    : `รอตรวจ ${filteredMatches.length} คู่ · มั่นใจสูง ${highConfidenceCount}`;

  const liveStatus = loadingBatch
    ? "กำลังโหลดคิวจับคู่"
    : loadError
      ? `โหลดคิวไม่สำเร็จ: ${loadError}`
      : summaryLine;

  return (
    <div className={adminPageShellClass}>
      {dialog}

      <p id={statusLiveId} className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>

      <header className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-balance text-xl font-semibold text-text-primary sm:text-2xl">
            จับคู่รายการ
          </h1>
          <p className="mt-1 text-pretty text-sm text-text-secondary">{summaryLine}</p>
        </div>

        <div className="flex w-full flex-wrap items-stretch gap-2 sm:w-auto sm:items-center">
          <label
            htmlFor={aiToggleId}
            className={cn(
              chipClass,
              "flex-1 cursor-pointer bg-bg-secondary text-text-secondary sm:flex-none",
              matchFocusRingClass,
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-line-green/35",
              "active:bg-bg-tertiary",
              prefersHover && "hover:bg-bg-tertiary"
            )}
          >
            <input
              id={aiToggleId}
              type="checkbox"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
              className="rounded border-border-light text-line-green focus:ring-line-green"
            />
            {isMdUp ? "ใช้ AI ช่วยจัดอันดับ" : "ใช้ AI"}
          </label>
          <button
            type="button"
            onClick={() => void loadBatch({ force: true })}
            disabled={loadingBatch || busy}
            className={cn(
              chipClass,
              "flex-1 bg-bg-secondary text-text-secondary sm:flex-none",
              "active:bg-bg-tertiary",
              prefersHover && "hover:bg-bg-tertiary",
              matchFocusRingClass
            )}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loadingBatch && "animate-spin")}
              aria-hidden
            />
            รีเฟรช
          </button>
        </div>
      </header>

      {loadError ? (
        <StatusAlert
          variant="error"
          title="โหลดคิวไม่สำเร็จ"
          message={loadError}
          action={{
            label: "ลองอีกครั้ง",
            onClick: () => void loadBatch({ force: true }),
          }}
        />
      ) : null}

      <div
        className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 snap-x snap-mandatory"
        role="tablist"
        aria-label="โหมดจับคู่"
        id={tabsId}
      >
        {(
          [
            { id: "queue" as const, label: "คิวตรวจ" },
            { id: "manual" as const, label: "เลือกเอง" },
            { id: "history" as const, label: "จับคู่แล้ว" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            id={`${tabsId}-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              tabClass,
              "flex-1 whitespace-nowrap sm:flex-none",
              matchFocusRingClass,
              tab === t.id
                ? "bg-bg-tertiary text-text-primary"
                : "bg-bg-secondary text-text-secondary active:bg-bg-tertiary",
              prefersHover && "hover:bg-bg-tertiary"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "queue" ? (
        <div
          className="space-y-3 sm:space-y-4"
          role="tabpanel"
          aria-labelledby={`${tabsId}-queue`}
        >
          <div
            className="flex gap-1 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 snap-x snap-mandatory"
            role="group"
            aria-label="กรองตามความมั่นใจ"
            id={confidenceId}
          >
            {(["all", "high", "medium", "low"] as const).map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={confidenceFilter === level}
                onClick={() => setConfidenceFilter(level)}
                className={cn(
                  "min-h-11 shrink-0 snap-start rounded-full px-3.5 py-1.5 text-xs font-medium motion-safe:transition-colors motion-safe:duration-200 touch-manipulation",
                  matchFocusRingClass,
                  confidenceFilter === level
                    ? "bg-bg-tertiary text-text-primary"
                    : "bg-bg-secondary text-text-secondary active:bg-bg-tertiary",
                  prefersHover &&
                    confidenceFilter !== level &&
                    "hover:bg-bg-tertiary"
                )}
              >
                {level === "all"
                  ? "ทั้งหมด"
                  : level === "high"
                    ? "สูง"
                    : level === "medium"
                      ? "กลาง"
                      : "ต่ำ"}
              </button>
            ))}
          </div>

          <MatchReviewQueue
            matches={filteredMatches}
            activeKey={activeKey}
            busyAction={busyAction}
            pool={pool}
            loading={loadingBatch}
            filterActive={confidenceFilter !== "all"}
            totalMatches={matches.length}
            onClearFilter={onClearFilter}
            onGoManual={onGoManual}
            onSelect={setActiveKey}
            onConfirm={onConfirmActive}
            onReject={onRejectActive}
            onSkip={handleSkip}
            getCategoryIcon={getCategoryIcon}
          />
        </div>
      ) : null}

      {tab === "manual" ? (
        <div role="tabpanel" aria-labelledby={`${tabsId}-manual`}>
          {manualError && selectedItem ? (
            <StatusAlert
              className="mb-4"
              variant="error"
              title="ค้นหาคู่ไม่สำเร็จ"
              message={manualError}
              action={{
                label: "ลองอีกครั้ง",
                onClick: () => {
                  void loadManualMatches(
                    isLostItem(selectedItem) ? "lost" : "found",
                    selectedItem
                  );
                },
              }}
            />
          ) : null}
          <ManualMatchPanel
            lostItems={lostItems}
            foundItems={foundItems}
            loadingItems={loadingPoolItems}
            loadingMatches={loadingManual}
            matches={manualMatches}
            selected={selectedItem}
            busyAction={busyAction}
            onSelectLost={onSelectLost}
            onSelectFound={onSelectFound}
            onClearSelected={onClearSelected}
            onConfirm={onManualConfirm}
            onReject={onManualReject}
            getCategoryIcon={getCategoryIcon}
          />
        </div>
      ) : null}

      {tab === "history" ? (
        <div role="tabpanel" aria-labelledby={`${tabsId}-history`}>
          {loadingBatch ? (
            <div
              className="flex flex-col items-center justify-center gap-2 py-16"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2 className="h-7 w-7 animate-spin text-text-secondary" aria-hidden />
              <span className="sr-only">กำลังโหลดประวัติจับคู่</span>
              <p className="text-sm text-text-secondary">กำลังโหลดประวัติจับคู่...</p>
            </div>
          ) : (
            <MatchedHistoryList
              items={history}
              busyKey={historyBusyKey}
              onUnmatch={handleUnmatch}
              onGoQueue={onGoQueue}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
