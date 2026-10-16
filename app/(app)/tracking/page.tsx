"use client";

import { Suspense, useState, useEffect, useCallback, useId, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Clock,
  CheckCircle2,
  Package,
  MapPin,
  Calendar,
  Loader2,
  AlertCircle,
  User,
} from "lucide-react";
import Header from "@/components/layout/header";
import BottomNav from "@/components/layout/bottom-nav";
import AppShell from "@/components/layout/app-shell";
import { StatusAlert } from "@/components/ui/status-alert";
import {
  CATEGORIES,
  CONTACT_TYPES,
  getDropOffLocationLabel,
  getItemDisplayName,
  getItemStatusConfig,
  type FoundItem,
  type ItemStatus,
  type LostItem,
} from "@/lib/types";
import { cn, formatThaiDate } from "@/lib/utils";
import {
  getFoundItemByTrackingCode,
  getLostItemByTrackingCode,
  subscribeToFoundItemsByUserId,
  subscribeToLostItemsByUserId,
  timestampToDate,
} from "@/lib/database";
import { useAuth } from "@/contexts/auth-context";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import LoginPrompt from "@/components/auth/login-prompt";
import {
  formatHandoverDeadlineThai,
  resolveHandoverDeadlineAt,
} from "@/lib/found-handover";
import {
  TRACKING_CODE_INPUT_MAX_LENGTH,
  canViewReporterContacts,
  normalizeTrackingCode,
  trackingStatusHint,
} from "@/lib/tracking-code";

type TrackingHit =
  | { kind: "lost"; item: LostItem }
  | { kind: "found"; item: FoundItem };

type MyReport = TrackingHit & { sortAt: number };

function categoryIcon(category?: string): string {
  return CATEGORIES.find((c) => c.value === category)?.icon || "📦";
}

function reportSortTime(item: { createdAt?: Date }): number {
  return item.createdAt ? timestampToDate(item.createdAt).getTime() : 0;
}

export default function TrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg-secondary flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-line-green" aria-label="กำลังโหลด" />
        </div>
      }
    >
      <TrackingPageContent />
    </Suspense>
  );
}

function TrackingPageContent() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const reduced = useReducedMotion();
  const searchParams = useSearchParams();
  const searchInputId = useId();
  const searchStatusId = useId();
  const consumedUrlCode = useRef<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<TrackingHit | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [myLostItems, setMyLostItems] = useState<LostItem[]>([]);
  const [myFoundItems, setMyFoundItems] = useState<FoundItem[]>([]);
  const [lostReady, setLostReady] = useState(false);
  const [foundReady, setFoundReady] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setMyLostItems([]);
      setMyFoundItems([]);
      setLostReady(false);
      setFoundReady(false);
      return;
    }

    setLostReady(false);
    setFoundReady(false);
    const unsubscribeLost = subscribeToLostItemsByUserId(user.uid, (items) => {
      setMyLostItems(items);
      setLostReady(true);
    });
    const unsubscribeFound = subscribeToFoundItemsByUserId(user.uid, (items) => {
      setMyFoundItems(items);
      setFoundReady(true);
    });

    return () => {
      unsubscribeLost();
      unsubscribeFound();
    };
  }, [user?.uid]);

  const myReports = useMemo<MyReport[]>(() => {
    const reports: MyReport[] = [
      ...myLostItems.map((item) => ({ kind: "lost" as const, item, sortAt: reportSortTime(item) })),
      ...myFoundItems.map((item) => ({ kind: "found" as const, item, sortAt: reportSortTime(item) })),
    ];
    reports.sort((a, b) => b.sortAt - a.sortAt);
    return reports;
  }, [myLostItems, myFoundItems]);

  const loadingMyItems = Boolean(user?.uid) && (!lostReady || !foundReady);

  const scrollToSearch = useCallback(() => {
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, [reduced]);

  const selectTrackingItem = useCallback(
    (hit: TrackingHit) => {
      setSearchQuery(hit.item.trackingCode);
      setSearchError(null);
      setSearchResult(hit);
      setHasSearched(true);
      scrollToSearch();
    },
    [scrollToSearch]
  );

  const runSearch = useCallback(async (query: string) => {
    const parsed = normalizeTrackingCode(query);
    if (!parsed.ok) {
      if (!query.trim()) return;
      setHasSearched(true);
      setSearchResult(null);
      setSearchError(parsed.message);
      return;
    }

    setSearchQuery(parsed.code);
    setIsSearching(true);
    setHasSearched(true);
    setSearchError(null);

    try {
      if (parsed.kind === "found") {
        const result = await getFoundItemByTrackingCode(parsed.code);
        setSearchResult(result ? { kind: "found", item: result } : null);
      } else {
        const result = await getLostItemByTrackingCode(parsed.code);
        setSearchResult(result ? { kind: "lost", item: result } : null);
      }
    } catch (error) {
      console.error("Error searching:", error);
      setSearchResult(null);
      setSearchError("ไม่สามารถค้นหาได้ในขณะนี้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const raw = searchParams.get("code")?.trim() ?? "";
    if (!raw || consumedUrlCode.current === raw) return;
    consumedUrlCode.current = raw;
    const parsed = normalizeTrackingCode(raw);
    setSearchQuery(parsed.ok ? parsed.code : raw.toUpperCase());
    void runSearch(raw);
  }, [searchParams, runSearch]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch(searchQuery);
  };

  const getStatusIcon = (status: ItemStatus) => {
    switch (status) {
      case "searching":
        return <Clock className="w-5 h-5" aria-hidden />;
      case "pending_room_confirm":
        return <Clock className="w-5 h-5" aria-hidden />;
      case "found":
        return <CheckCircle2 className="w-5 h-5" aria-hidden />;
      case "claimed":
        return <Package className="w-5 h-5" aria-hidden />;
      default:
        return <AlertCircle className="w-5 h-5" aria-hidden />;
    }
  };

  if (authLoading && !user) {
    return (
      <div className="min-h-screen bg-bg-secondary flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-line-green" aria-label="กำลังโหลด" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-primary pb-24 transition-colors">
        <Header title="ติดตามสถานะ" showBack />
        <LoginPrompt
          title="เข้าสู่ระบบเพื่อติดตามสถานะ"
          description="คุณต้องเข้าสู่ระบบเพื่อดูรายการของหายและของเจอของคุณ และติดตามสถานะแบบ Real-time"
          feature="เปิดลิงก์รหัสติดตามแล้ว ระบบจะค้นให้ต่อหลังเข้าสู่ระบบ"
        />
        <BottomNav />
      </div>
    );
  }

  const statusConfig = searchResult ? getItemStatusConfig(searchResult.item) : null;
  const reporterContacts = searchResult
    ? searchResult.kind === "lost"
      ? searchResult.item.contacts
      : searchResult.item.finderContacts ?? []
    : [];
  const showReporterContacts = searchResult
    ? canViewReporterContacts({
        isAdmin,
        viewerId: user.uid,
        ownerId: searchResult.item.userId,
      })
    : false;
  const handoverDeadline =
    searchResult?.kind === "found" && searchResult.item.status === "pending_room_confirm"
      ? resolveHandoverDeadlineAt(searchResult.item)
      : null;

  const searchStatusMessage = searchError
    ? searchError
    : hasSearched && !isSearching
      ? searchResult
        ? `พบรายการ ${getItemDisplayName(searchResult.item)}`
        : "ไม่พบรายการจากรหัสที่ค้นหา"
      : "";

  return (
    <AppShell>
      <div className="min-h-screen bg-bg-secondary pb-24 shell-desktop:pb-8 transition-colors">
        <div className="shell-desktop:hidden">
          <Header title="ติดตามสถานะ" showBack />
        </div>

        <div className="hidden shell-desktop:block px-8 py-6 border-b border-border-light bg-bg-secondary sticky top-0 z-10">
          <h1 className="text-2xl font-semibold text-text-primary text-balance">ติดตามสถานะ</h1>
          <p className="text-text-secondary text-sm mt-1">ติดตามสถานะของหายและของที่เจอ</p>
        </div>

        <div className="w-full max-w-4xl mx-auto px-4 shell-desktop:px-8 py-6 min-w-0">
          <form onSubmit={handleSearch} className="mb-6" aria-busy={isSearching}>
            <label
              htmlFor={searchInputId}
              className="block text-sm font-medium text-text-primary mb-2"
            >
              ค้นหาด้วยรหัสติดตาม
            </label>
            <div className="relative">
              <input
                id={searchInputId}
                type="text"
                name="trackingCode"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value.toUpperCase());
                  if (searchError) setSearchError(null);
                }}
                placeholder="เช่น LOST-ABC234 หรือ FOUND-ABC234"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={TRACKING_CODE_INPUT_MAX_LENGTH}
                enterKeyHint="search"
                className="w-full h-12 px-4 pr-14 bg-bg-card rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-line-green uppercase border border-border-light"
              />
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                aria-label="ค้นหารหัสติดตาม"
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 min-w-11 min-h-11 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35",
                  searchQuery.trim()
                    ? "bg-line-green text-white hover:bg-line-green-hover"
                    : "bg-bg-secondary text-text-tertiary"
                )}
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                ) : (
                  <Search className="w-4 h-4" aria-hidden />
                )}
              </button>
            </div>
          </form>

          <p id={searchStatusId} className="sr-only" aria-live="polite" aria-atomic="true">
            {searchStatusMessage}
          </p>

          {hasSearched && (
            <div className="mb-8" aria-describedby={searchStatusId}>
              {searchError ? (
                <StatusAlert
                  variant="error"
                  message={searchError}
                  action={{
                    label: "ลองอีกครั้ง",
                    onClick: () => void runSearch(searchQuery),
                  }}
                />
              ) : searchResult && statusConfig ? (
                <div className="bg-bg-card rounded-xl overflow-hidden border border-border-light">
                  <div
                    className={cn(
                      "px-4 py-3 flex items-center gap-2",
                      statusConfig.bgColor || "bg-bg-tertiary"
                    )}
                  >
                    <span className={statusConfig.color || "text-text-secondary"}>
                      {getStatusIcon(searchResult.item.status)}
                    </span>
                    <span
                      className={cn(
                        "font-medium",
                        statusConfig.color || "text-text-secondary"
                      )}
                    >
                      {statusConfig.label || "ไม่ทราบสถานะ"}
                    </span>
                    <span className="ml-auto text-xs font-medium text-text-tertiary">
                      {searchResult.kind === "found" ? "ของเจอ" : "ของหาย"}
                    </span>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start gap-3 mb-4">
                      <div
                        className="w-12 h-12 rounded-xl bg-bg-secondary flex items-center justify-center text-2xl shrink-0"
                        aria-hidden
                      >
                        {categoryIcon(searchResult.item.category)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-text-primary truncate">
                          {getItemDisplayName(searchResult.item)}
                        </h3>
                        <p className="text-sm text-text-secondary break-all">
                          {searchResult.item.trackingCode}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="flex items-start gap-2 text-text-secondary">
                        <MapPin className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" aria-hidden />
                        <span className="min-w-0 break-words">
                          {searchResult.kind === "found"
                            ? `เจอที่: ${searchResult.item.locationFound}`
                            : `ทำหายที่: ${searchResult.item.locationLost}`}
                        </span>
                      </div>
                      {searchResult.kind === "found" ? (
                        <div className="flex items-start gap-2 text-text-secondary">
                          <Package className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" aria-hidden />
                          <span className="min-w-0 break-words">
                            จุดส่งมอบ: {getDropOffLocationLabel(searchResult.item.dropOffLocation)}
                          </span>
                        </div>
                      ) : null}
                      {reporterContacts.length > 0 && showReporterContacts ? (
                        <div className="flex items-start gap-2 text-text-secondary">
                          <User className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" aria-hidden />
                          <span className="min-w-0 break-words">
                            {reporterContacts.map((c, i) => {
                              const contactType = CONTACT_TYPES.find((t) => t.value === c.type);
                              return (
                                <span key={`${c.type}-${c.value}-${i}`}>
                                  {contactType?.icon} {c.value}
                                  {i < reporterContacts.length - 1 ? " • " : ""}
                                </span>
                              );
                            })}
                          </span>
                        </div>
                      ) : null}
                      {reporterContacts.length > 0 && !showReporterContacts ? (
                        <div className="flex items-start gap-2 text-text-secondary text-sm bg-bg-tertiary rounded-lg p-3">
                          <User className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" aria-hidden />
                          <span className="min-w-0 break-words">
                            ติดต่อเจ้าของรายการได้ผ่านห้องบุคคลครับ
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-start gap-2 text-text-secondary">
                        <Calendar className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" aria-hidden />
                        <span>
                          วันที่แจ้ง:{" "}
                          {searchResult.item.createdAt
                            ? formatThaiDate(timestampToDate(searchResult.item.createdAt))
                            : "-"}
                        </span>
                      </div>
                      {handoverDeadline ? (
                        <div className="flex items-start gap-2 text-text-secondary">
                          <Clock className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" aria-hidden />
                          <span className="min-w-0 break-words">
                            ส่งห้องบุคคลภายใน {formatHandoverDeadlineThai(handoverDeadline)}
                          </span>
                        </div>
                      ) : null}

                      <div
                        className={cn(
                          "flex items-start gap-2 rounded-lg p-3 mt-3",
                          searchResult.item.status === "found"
                            ? "text-line-green bg-line-green-light dark:bg-line-green/20"
                            : searchResult.item.status === "claimed"
                              ? "text-status-info bg-status-info-light"
                              : searchResult.item.status === "expired"
                                ? "text-status-error bg-status-error-light"
                                : "text-status-warning bg-status-warning-light"
                        )}
                      >
                        <span className="shrink-0 mt-0.5" aria-hidden>
                          {getStatusIcon(searchResult.item.status)}
                        </span>
                        <span className="font-medium min-w-0 break-words">
                          {trackingStatusHint(searchResult.kind, searchResult.item.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 bg-bg-card rounded-2xl border border-border-light">
                  <div className="w-16 h-16 rounded-full bg-bg-secondary flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-text-tertiary" aria-hidden />
                  </div>
                  <p className="text-text-secondary font-medium">ไม่พบข้อมูล</p>
                  <p className="text-sm text-text-tertiary mt-1">
                    กรุณาตรวจสอบรหัสติดตามอีกครั้ง
                  </p>
                </div>
              )}
            </div>
          )}

          <section aria-labelledby="my-reports-heading">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 id="my-reports-heading" className="text-lg font-semibold text-text-primary">
                รายการของฉัน
              </h2>
              <span className="text-xs text-text-tertiary shrink-0">อัปเดตอัตโนมัติ</span>
            </div>

            {loadingMyItems ? (
              <div
                className="text-center py-12 bg-bg-card rounded-2xl border border-border-light"
                aria-busy="true"
                aria-live="polite"
              >
                <Loader2 className="w-8 h-8 animate-spin text-line-green mx-auto mb-4" aria-hidden />
                <p className="text-text-secondary">กำลังโหลดรายการของคุณ...</p>
              </div>
            ) : myReports.length > 0 ? (
              <ul className="space-y-3" role="list">
                {myReports.map((report) => {
                  const reportStatus = getItemStatusConfig(report.item);
                  const reportName = getItemDisplayName(report.item);
                  return (
                    <li key={`${report.kind}-${report.item.id}`}>
                      <button
                        type="button"
                        onClick={() => selectTrackingItem(report)}
                        aria-label={`ดูรายละเอียด ${reportName} รหัส ${report.item.trackingCode}`}
                        className="w-full text-left bg-bg-card border border-border-light rounded-xl p-4 hover:border-line-green transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center text-xl shrink-0"
                            aria-hidden
                          >
                            {categoryIcon(report.item.category)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-text-primary truncate">
                              {reportName}
                            </h4>
                            <p className="text-xs text-text-secondary mt-0.5 truncate">
                              {report.kind === "found" ? "ของเจอ" : "ของหาย"} • {report.item.trackingCode} •{" "}
                              {report.item.createdAt
                                ? formatThaiDate(timestampToDate(report.item.createdAt))
                                : "-"}
                            </p>
                          </div>

                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0",
                              reportStatus.bgColor || "bg-bg-tertiary",
                              reportStatus.color || "text-text-secondary"
                            )}
                          >
                            {getStatusIcon(report.item.status)}
                            {reportStatus.label || "ไม่ทราบ"}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-center py-12 bg-bg-card rounded-2xl border border-border-light">
                <div className="w-16 h-16 rounded-full bg-bg-secondary flex items-center justify-center mx-auto mb-4">
                  <Package className="w-8 h-8 text-text-tertiary" aria-hidden />
                </div>
                <p className="text-text-secondary font-medium">ยังไม่มีรายการ</p>
                <p className="text-sm text-text-tertiary mt-1">
                  เริ่มแจ้งของหายหรือของเจอเพื่อติดตามสถานะ
                </p>
              </div>
            )}
          </section>

          <section
            className="mt-8 p-4 bg-bg-card rounded-xl border border-border-light"
            aria-labelledby="status-legend-heading"
          >
            <h3 id="status-legend-heading" className="text-sm font-medium text-text-primary mb-3">
              คำอธิบายสถานะ
            </h3>
            <ul className="space-y-2" role="list">
              <li className="flex items-start gap-2 text-sm">
                <Clock className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" aria-hidden />
                <span className="text-text-secondary min-w-0 break-words">
                  กำลังตามหา — รอดูว่ามีคนเจอ
                </span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <Clock className="w-4 h-4 text-status-warning shrink-0 mt-0.5" aria-hidden />
                <span className="text-text-secondary min-w-0 break-words">
                  รอส่งห้องบุคคล — ของเจอยังไม่ถึงจุดส่งมอบ
                </span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-line-green shrink-0 mt-0.5" aria-hidden />
                <span className="text-text-secondary min-w-0 break-words">
                  ถึงห้องบุคคลแล้ว — เจ้าของติดต่อรับคืนได้
                </span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <Package className="w-4 h-4 text-status-info shrink-0 mt-0.5" aria-hidden />
                <span className="text-text-secondary min-w-0 break-words">
                  รับคืนแล้ว — ดำเนินการเสร็จสิ้น
                </span>
              </li>
            </ul>
          </section>
        </div>

        <div className="lg:hidden">
          <BottomNav />
        </div>
      </div>
    </AppShell>
  );
}
