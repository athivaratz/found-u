"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Search,
  MapPin,
  Calendar,
  Loader2,
  Filter,
  ChevronDown,
  Package,
  AlertCircle,
} from "lucide-react";
import Header from "@/components/layout/header";
import BottomNav from "@/components/layout/bottom-nav";
import AppShell from "@/components/layout/app-shell";
import { StatusAlert } from "@/components/ui/status-alert";
import { useAuth } from "@/contexts/auth-context";
import {
  CATEGORIES,
  CONTACT_TYPES,
  getStatusDisplayConfig,
  type LostItem,
  type FoundItem,
  type ItemStatus,
  type ContactInfo,
} from "@/lib/types";
import { cn, formatThaiDate } from "@/lib/utils";
import { subscribeToLostItems, subscribeToFoundItems, timestampToDate } from "@/lib/database";

type FilterType = "all" | "lost" | "found";

type CombinedItem = {
  id: string;
  type: "lost" | "found";
  name: string;
  description?: string;
  location: string;
  status: ItemStatus;
  category?: string;
  photoUrl?: string;
  contacts?: ContactInfo[];
  trackingCode: string;
  createdAt: Date;
};

const LIST_LOAD_TIMEOUT_MS = 20_000;
const SEARCH_MAX_LENGTH = 80;

function itemPhotoAlt(item: CombinedItem): string {
  const kind = item.type === "lost" ? "ของหาย" : "ของที่เจอ";
  return `รูป${kind}: ${item.name}`;
}

export default function ListPage() {
  const { isAdmin } = useAuth();
  const searchInputId = useId();
  const categorySelectId = useId();
  const resultsStatusId = useId();

  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  const [foundItems, setFoundItems] = useState<FoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [subscriptionKey, setSubscriptionKey] = useState(0);

  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setSubscriptionKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let loadedLost = false;
    let loadedFound = false;
    let cancelled = false;

    const markReady = () => {
      if (cancelled || !loadedLost || !loadedFound) return;
      setLoading(false);
      setLoadError(null);
    };

    const timeoutId = window.setTimeout(() => {
      if (cancelled || (loadedLost && loadedFound)) return;
      setLoading(false);
      setLoadError("โหลดรายการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
    }, LIST_LOAD_TIMEOUT_MS);

    const unsubLost = subscribeToLostItems((items) => {
      setLostItems(items);
      loadedLost = true;
      markReady();
    });

    const unsubFound = subscribeToFoundItems((items) => {
      setFoundItems(items);
      loadedFound = true;
      markReady();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      unsubLost();
      unsubFound();
    };
  }, [subscriptionKey]);

  const combinedItems: CombinedItem[] = [
    ...lostItems.map((item) => ({
      id: item.id,
      type: "lost" as const,
      name: item.itemName,
      description: item.description,
      location: item.locationLost,
      status: item.status,
      category: item.category,
      contacts: item.contacts,
      trackingCode: item.trackingCode,
      createdAt: timestampToDate(item.createdAt),
    })),
    ...foundItems.map((item) => ({
      id: item.id,
      type: "found" as const,
      name: item.description,
      description: item.description,
      location: item.locationFound,
      status: item.status,
      photoUrl: item.photoUrl,
      contacts: item.finderContacts,
      trackingCode: item.trackingCode,
      createdAt: timestampToDate(item.createdAt),
    })),
  ]
    .filter((item) => {
      if (!isAdmin && item.type === "found") return false;
      if (filter !== "all" && item.type !== filter) return false;

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(query);
        const matchDesc = item.description?.toLowerCase().includes(query);
        const matchLocation = item.location.toLowerCase().includes(query);
        const matchCode = item.trackingCode.toLowerCase().includes(query);
        if (!matchName && !matchDesc && !matchLocation && !matchCode) return false;
      }

      if (categoryFilter && item.type === "lost" && item.category !== categoryFilter) {
        return false;
      }

      return true;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const getCategoryIcon = (category?: string) => {
    if (!category) return "📦";
    const cat = CATEGORIES.find((c) => c.value === category);
    return cat?.icon || "📦";
  };


  return (
    <AppShell>
      <div className="min-h-screen bg-bg-secondary pb-24 shell-desktop:pb-8 transition-colors">
        <div className="shell-desktop:hidden">
          <Header title="รายการทั้งหมด" showBack />
        </div>

        <div className="hidden shell-desktop:block px-8 py-6 border-b border-border-light bg-bg-secondary sticky top-0 z-10">
          <h1 className="text-2xl font-semibold text-text-primary text-balance">รายการทั้งหมด</h1>
          <p className="text-text-secondary text-sm mt-1">
            รายการของหายและของที่เจอทั้งหมดในระบบ
          </p>
        </div>

        <div className="w-full max-w-4xl mx-auto px-4 shell-desktop:px-8 py-6 min-w-0">
          <section aria-label="ค้นหาและกรอง">
            {isAdmin && (
              <div
                className="flex gap-2 mb-4 overflow-x-auto pb-2"
                role="group"
                aria-label="กรองประเภทรายการ"
              >
                {(
                  [
                    { id: "all" as const, label: "ทั้งหมด", activeClass: "bg-line-green text-white" },
                    {
                      id: "lost" as const,
                      label: "ของหายทั้งหมด",
                      activeClass: "bg-status-error text-white",
                    },
                    {
                      id: "found" as const,
                      label: "เจอของทั้งหมด",
                      activeClass: "bg-line-green text-white",
                    },
                  ] as const
                ).map(({ id, label, activeClass }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    aria-pressed={filter === id}
                    className={cn(
                      "min-h-11 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35",
                      filter === id
                        ? activeClass
                        : "bg-bg-card text-text-secondary border border-border-light"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 mb-4">
              <div className="relative flex-1 min-w-0">
                <label htmlFor={searchInputId} className="sr-only">
                  ค้นหารายการ
                </label>
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary pointer-events-none"
                  aria-hidden
                />
                <input
                  id={searchInputId}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาชื่อ สถานที่ หรือรหัสติดตาม"
                  maxLength={SEARCH_MAX_LENGTH}
                  autoComplete="off"
                  enterKeyHint="search"
                  aria-describedby={resultsStatusId}
                  className="w-full h-12 pl-10 pr-4 bg-bg-card rounded-xl text-text-primary placeholder-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green border border-border-light"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowFilters((open) => !open)}
                aria-label="แสดงตัวกรองหมวดหมู่"
                aria-expanded={showFilters}
                aria-controls="list-advanced-filters"
                className={cn(
                  "min-h-12 min-w-12 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35",
                  showFilters
                    ? "bg-line-green text-white"
                    : "bg-bg-card text-text-secondary border border-border-light"
                )}
              >
                <Filter className="w-5 h-5" aria-hidden />
                <ChevronDown
                  className={cn("w-4 h-4 transition-transform", showFilters && "rotate-180")}
                  aria-hidden
                />
              </button>
            </div>

            {showFilters && (
              <div
                id="list-advanced-filters"
                className="bg-bg-card rounded-xl p-4 mb-4 border border-border-light"
              >
                <label
                  htmlFor={categorySelectId}
                  className="block text-sm font-medium text-text-secondary mb-2"
                >
                  หมวดหมู่
                </label>
                <select
                  id={categorySelectId}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full min-h-11 px-3 bg-bg-secondary rounded-lg text-text-primary border border-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green"
                >
                  <option value="">ทั้งหมด</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          <p
            id={resultsStatusId}
            className="text-sm text-text-tertiary mb-4"
            aria-live="polite"
            aria-atomic="true"
          >
            {loading ? "กำลังโหลด..." : `พบ ${combinedItems.length} รายการ`}
          </p>

          {loadError ? (
            <StatusAlert
              variant="error"
              message={loadError}
              action={{ label: "ลองอีกครั้ง", onClick: retryLoad }}
              className="mb-4"
            />
          ) : null}

          {loading ? (
            <div
              className="text-center py-12 bg-bg-card rounded-2xl border border-border-light"
              aria-busy="true"
              aria-live="polite"
            >
              <Loader2
                className="w-8 h-8 animate-spin text-line-green mx-auto mb-4"
                aria-hidden
              />
              <p className="text-text-secondary">กำลังโหลดรายการ...</p>
            </div>
          ) : combinedItems.length === 0 ? (
            <div className="text-center py-12 bg-bg-card rounded-2xl border border-border-light">
              <div className="w-16 h-16 rounded-full bg-bg-secondary flex items-center justify-center mx-auto mb-4">
                <Package className="w-8 h-8 text-text-tertiary" aria-hidden />
              </div>
              <p className="text-text-secondary font-medium">ไม่พบรายการ</p>
              <p className="text-sm text-text-tertiary mt-1">
                {searchQuery || categoryFilter || filter !== "all"
                  ? "ลองเปลี่ยนตัวกรองหรือคำค้นหา"
                  : "ยังไม่มีรายการในระบบ"}
              </p>
            </div>
          ) : (
            <ul className="space-y-3" role="list">
              {combinedItems.map((item) => {
                const statusConfig = getStatusDisplayConfig(item.status, item.type);
                return (
                  <li key={`${item.type}-${item.id}`}>
                    <article className="bg-bg-card rounded-xl border border-border-light overflow-hidden">
                      <Link
                        href={`/tracking?code=${encodeURIComponent(item.trackingCode)}`}
                        className="block p-4 hover:border-line-green transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-line-green/35"
                        aria-label={`ดูรายละเอียด ${item.name} รหัส ${item.trackingCode}`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="w-12 h-12 rounded-xl bg-bg-secondary flex items-center justify-center text-2xl shrink-0 overflow-hidden"
                            aria-hidden={!item.photoUrl}
                          >
                            {item.photoUrl ? (
                              <Image
                                src={item.photoUrl}
                                alt={itemPhotoAlt(item)}
                                width={48}
                                height={48}
                                className="w-full h-full object-cover"
                                unoptimized
                              />
                            ) : (
                              <span aria-hidden>{getCategoryIcon(item.category)}</span>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded text-xs font-medium",
                                  item.type === "lost"
                                    ? "bg-status-error-light text-status-error"
                                    : "bg-line-green-light text-line-green"
                                )}
                              >
                                {item.type === "lost" ? "ของหาย" : "เจอของ"}
                              </span>
                              <span className="text-xs text-text-tertiary break-all">
                                {item.trackingCode}
                              </span>
                            </div>
                            <h2 className="font-medium text-text-primary truncate">
                              {item.name}
                            </h2>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-text-secondary">
                              <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                                <MapPin className="w-3 h-3 shrink-0" aria-hidden />
                                <span className="truncate">{item.location}</span>
                              </span>
                              <span className="inline-flex items-center gap-1 shrink-0">
                                <Calendar className="w-3 h-3" aria-hidden />
                                {formatThaiDate(item.createdAt)}
                              </span>
                            </div>
                          </div>

                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-full text-xs font-medium shrink-0",
                              statusConfig.bgColor || "bg-bg-tertiary",
                              statusConfig.color || "text-text-secondary"
                            )}
                          >
                            {statusConfig.label || "ไม่ทราบ"}
                          </span>
                        </div>
                      </Link>

                      {item.contacts && item.contacts.length > 0 && (
                        <div className="px-4 pb-4 pt-0">
                          <div className="pt-3 border-t border-border-light">
                            <p className="text-xs text-text-secondary mb-1">ติดต่อ:</p>
                            <div className="flex flex-wrap gap-2">
                              {item.contacts.map((contact, idx) => {
                                const contactType = CONTACT_TYPES.find(
                                  (t) => t.value === contact.type
                                );
                                return (
                                  <span
                                    key={`${contact.type}-${contact.value}-${idx}`}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-bg-secondary rounded-lg text-xs text-text-primary break-all"
                                  >
                                    <span aria-hidden>{contactType?.icon}</span>
                                    {contact.value}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {item.type === "lost" && (
                        <div className="px-4 pb-4 pt-0">
                          <div className="pt-3 border-t border-border-light">
                            <Link
                              href="/found"
                              className="flex items-center justify-center gap-2 w-full min-h-11 py-2 bg-line-green-light text-line-green rounded-lg text-sm font-medium hover:bg-line-green-light/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35"
                            >
                              <AlertCircle className="w-4 h-4" aria-hidden />
                              ฉันเจอของชิ้นนี้
                            </Link>
                          </div>
                        </div>
                      )}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="lg:hidden">
          <BottomNav />
        </div>
      </div>
    </AppShell>
  );
}
