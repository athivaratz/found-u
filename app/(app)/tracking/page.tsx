"use client";

import { useState, useEffect, useCallback, useId } from "react";
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
  getItemStatusConfig,
  type ItemStatus,
  type LostItem,
} from "@/lib/types";
import { cn, formatThaiDate } from "@/lib/utils";
import { getLostItemByTrackingCode, subscribeToLostItemsByUserId, timestampToDate } from "@/lib/database";
import { useAuth } from "@/contexts/auth-context";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import LoginPrompt from "@/components/auth/login-prompt";

type SearchResult = (LostItem & { matchLocation?: string; icon?: string }) | null;

const TRACKING_CODE_MAX_LENGTH = 16;

function enrichLostItem(item: LostItem): NonNullable<SearchResult> {
  const category = CATEGORIES.find((c) => c.value === item.category);
  return {
    ...item,
    icon: category?.icon || "📦",
  };
}

export default function TrackingPage() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const reduced = useReducedMotion();
  const searchInputId = useId();
  const searchStatusId = useId();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [myItems, setMyItems] = useState<LostItem[]>([]);
  const [loadingMyItems, setLoadingMyItems] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setMyItems([]);
      setLoadingMyItems(false);
      return;
    }

    setLoadingMyItems(true);
    const unsubscribe = subscribeToLostItemsByUserId(user.uid, (items) => {
      setMyItems(items);
      setLoadingMyItems(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const getCategoryIcon = (category: string) => {
    const cat = CATEGORIES.find((c) => c.value === category);
    return cat?.icon || "📦";
  };

  const scrollToSearch = useCallback(() => {
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, [reduced]);

  const selectTrackingItem = useCallback(
    (item: LostItem) => {
      setSearchQuery(item.trackingCode);
      setSearchError(null);
      setSearchResult(enrichLostItem(item));
      setHasSearched(true);
      scrollToSearch();
    },
    [scrollToSearch]
  );

  const runSearch = useCallback(async (query: string) => {
    const normalized = query.trim().toUpperCase();
    if (!normalized) return;

    setIsSearching(true);
    setHasSearched(true);
    setSearchError(null);

    try {
      const result = await getLostItemByTrackingCode(normalized);

      if (result) {
        setSearchResult(enrichLostItem(result));
      } else {
        setSearchResult(null);
      }
    } catch (error) {
      console.error("Error searching:", error);
      setSearchResult(null);
      setSearchError("ไม่สามารถค้นหาได้ในขณะนี้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
    } finally {
      setIsSearching(false);
    }
  }, []);

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
          description="คุณต้องเข้าสู่ระบบเพื่อดูรายการของหายของคุณและติดตามสถานะแบบ Real-time"
          feature="รายการของฉันจะอัปเดตอัตโนมัติเมื่อมีคนเจอของ!"
        />
        <BottomNav />
      </div>
    );
  }

  const searchStatusMessage = searchError
    ? searchError
    : hasSearched && !isSearching
      ? searchResult
        ? `พบรายการ ${searchResult.itemName}`
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
                placeholder="เช่น LOST-ABC123"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={TRACKING_CODE_MAX_LENGTH}
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
              ) : searchResult ? (
                <div className="bg-bg-card rounded-xl overflow-hidden border border-border-light">
                  <div
                    className={cn(
                      "px-4 py-3 flex items-center gap-2",
                      getItemStatusConfig(searchResult).bgColor || "bg-bg-tertiary"
                    )}
                  >
                    <span className={getItemStatusConfig(searchResult).color || "text-text-secondary"}>
                      {getStatusIcon(searchResult.status)}
                    </span>
                    <span
                      className={cn(
                        "font-medium",
                        getItemStatusConfig(searchResult).color || "text-text-secondary"
                      )}
                    >
                      {getItemStatusConfig(searchResult).label || "ไม่ทราบสถานะ"}
                    </span>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start gap-3 mb-4">
                      <div
                        className="w-12 h-12 rounded-xl bg-bg-secondary flex items-center justify-center text-2xl shrink-0"
                        aria-hidden
                      >
                        {searchResult.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-text-primary truncate">
                          {searchResult.itemName}
                        </h3>
                        <p className="text-sm text-text-secondary break-all">
                          {searchResult.trackingCode}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="flex items-start gap-2 text-text-secondary">
                        <MapPin className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" aria-hidden />
                        <span className="min-w-0 break-words">
                          ทำหายที่: {searchResult.locationLost}
                        </span>
                      </div>
                      {searchResult.contacts &&
                        searchResult.contacts.length > 0 &&
                        (isAdmin || searchResult.userId === user?.uid) && (
                          <div className="flex items-start gap-2 text-text-secondary">
                            <User className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" aria-hidden />
                            <span className="min-w-0 break-words">
                              {searchResult.contacts.map((c, i) => {
                                const contactType = CONTACT_TYPES.find((t) => t.value === c.type);
                                return (
                                  <span key={`${c.type}-${c.value}-${i}`}>
                                    {contactType?.icon} {c.value}
                                    {i < searchResult.contacts!.length - 1 ? " • " : ""}
                                  </span>
                                );
                              })}
                            </span>
                          </div>
                        )}
                      {searchResult.contacts &&
                        searchResult.contacts.length > 0 &&
                        !isAdmin &&
                        searchResult.userId !== user?.uid && (
                          <div className="flex items-start gap-2 text-text-secondary text-sm bg-bg-tertiary rounded-lg p-3">
                            <User className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" aria-hidden />
                            <span className="min-w-0 break-words">
                              ติดต่อเจ้าของรายการได้ผ่านห้องบุคคลครับ
                            </span>
                          </div>
                        )}
                      <div className="flex items-start gap-2 text-text-secondary">
                        <Calendar className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" aria-hidden />
                        <span>
                          วันที่แจ้ง:{" "}
                          {searchResult.createdAt
                            ? formatThaiDate(timestampToDate(searchResult.createdAt))
                            : "-"}
                        </span>
                      </div>

                      {searchResult.status === "pending_room_confirm" && (
                        <div className="flex items-start gap-2 text-status-warning bg-status-warning-light rounded-lg p-3 mt-3">
                          <Clock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                          <span className="font-medium min-w-0 break-words">
                            พบของแล้ว กำลังรอส่ง/ยืนยันที่ห้องบุคคล
                          </span>
                        </div>
                      )}

                      {searchResult.status === "found" && (
                        <div className="flex items-start gap-2 text-line-green bg-line-green-light dark:bg-line-green/20 rounded-lg p-3 mt-3">
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                          <span className="font-medium min-w-0 break-words">
                            ของถึงห้องบุคคลแล้ว! กรุณาติดต่อรับคืนที่ห้องบุคคล
                          </span>
                        </div>
                      )}

                      {searchResult.status === "claimed" && (
                        <div className="flex items-start gap-2 text-status-info bg-status-info-light rounded-lg p-3 mt-3">
                          <Package className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                          <span className="font-medium min-w-0 break-words">
                            รับคืนเรียบร้อยแล้ว
                          </span>
                        </div>
                      )}
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
            ) : myItems.length > 0 ? (
              <ul className="space-y-3" role="list">
                {myItems.map((item) => {
                  const statusConfig = getItemStatusConfig(item);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => selectTrackingItem(item)}
                        aria-label={`ดูรายละเอียด ${item.itemName} รหัส ${item.trackingCode}`}
                        className="w-full text-left bg-bg-card border border-border-light rounded-xl p-4 hover:border-line-green transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center text-xl shrink-0"
                            aria-hidden
                          >
                            {getCategoryIcon(item.category)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-text-primary truncate">
                              {item.itemName}
                            </h4>
                            <p className="text-xs text-text-secondary mt-0.5 truncate">
                              {item.trackingCode} •{" "}
                              {item.createdAt
                                ? formatThaiDate(timestampToDate(item.createdAt))
                                : "-"}
                            </p>
                          </div>

                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0",
                              statusConfig.bgColor || "bg-bg-tertiary",
                              statusConfig.color || "text-text-secondary"
                            )}
                          >
                            {getStatusIcon(item.status)}
                            {statusConfig.label || "ไม่ทราบ"}
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
                  เริ่มแจ้งของหายเพื่อติดตามสถานะ
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
                <CheckCircle2 className="w-4 h-4 text-line-green shrink-0 mt-0.5" aria-hidden />
                <span className="text-text-secondary min-w-0 break-words">
                  เจอแล้ว — รอติดต่อรับคืน
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
