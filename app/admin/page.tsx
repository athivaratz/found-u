"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Package,
  Search,
  CheckCircle,
  Clock,
  TrendingUp,
  Loader2,
  ArrowUpRight,
  Activity,
} from "lucide-react";
import {
  subscribeToLostItems,
  subscribeToFoundItems,
  timestampToDate,
} from "@/lib/database";
import {
  CATEGORIES,
  STATUS_CONFIG,
  getItemDisplayName,
  isLostItem,
  type LostItem,
  type FoundItem,
} from "@/lib/types";
import { cn, formatThaiDate } from "@/lib/utils";

export default function AdminDashboard() {
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  const [foundItems, setFoundItems] = useState<FoundItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubLost = subscribeToLostItems((items) => {
      setLostItems(items);
      setLoading(false);
    });

    const unsubFound = subscribeToFoundItems((items) => {
      setFoundItems(items);
    });

    return () => {
      unsubLost();
      unsubFound();
    };
  }, []);

  const stats = {
    totalLost: lostItems.length,
    totalFound: foundItems.length,
    searching: lostItems.filter((i) => i.status === "searching").length,
    found: [...lostItems, ...foundItems].filter((i) => i.status === "found")
      .length,
    claimed: [...lostItems, ...foundItems].filter((i) => i.status === "claimed")
      .length,
    thisWeek: [...lostItems, ...foundItems].filter((item) => {
      if (!item.createdAt) return false;
      const date = timestampToDate(item.createdAt);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return date > weekAgo;
    }).length,
  };

  const recentActivity = [...lostItems, ...foundItems]
    .sort((a, b) => {
      const dateA = a.createdAt ? timestampToDate(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? timestampToDate(b.createdAt).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 8);

  const categoryBreakdown = CATEGORIES.map((cat) => ({
    ...cat,
    count: lostItems.filter((item) => item.category === cat.value).length,
  })).sort((a, b) => b.count - a.count);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#06C755]" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            ภาพรวม
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            สถิติและข้อมูลทั่วไปของระบบ Found-U
          </p>
        </div>
        <Link
          href="/admin/ai/usage"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:border-[#06C755]/40 transition-colors"
        >
          <Activity className="w-4 h-4 text-[#06C755]" />
          AI Usage & Rate Limit
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Search className="w-6 h-6 text-red-500" />
            </div>
            <span className="flex items-center text-xs text-green-500">
              <ArrowUpRight className="w-3 h-3" />
              {stats.thisWeek} สัปดาห์นี้
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
            {stats.totalLost}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ของหายทั้งหมด
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Package className="w-6 h-6 text-green-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
            {stats.totalFound}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ของเจอทั้งหมด
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
            {stats.searching}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">กำลังตามหา</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-blue-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
            {stats.claimed}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">รับคืนแล้ว</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
          <div className="p-5 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              กิจกรรมล่าสุด
            </h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {recentActivity.length === 0 ? (
              <div className="p-8 text-center text-gray-500">ยังไม่มีกิจกรรม</div>
            ) : (
              recentActivity.map((item) => {
                const isLost = isLostItem(item);
                return (
                  <div
                    key={item.id}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          isLost
                            ? "bg-red-100 dark:bg-red-900/30"
                            : "bg-green-100 dark:bg-green-900/30"
                        )}
                      >
                        {isLost ? (
                          <Search className="w-5 h-5 text-red-500" />
                        ) : (
                          <Package className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {getItemDisplayName(item)}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {isLost ? "แจ้งของหาย" : "แจ้งเจอของ"} •{" "}
                          <span className="font-mono text-[#06C755]">
                            {item.trackingCode}
                          </span>
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={cn(
                            "inline-block px-2.5 py-1 rounded-full text-xs font-medium",
                            STATUS_CONFIG[item.status].bgColor,
                            STATUS_CONFIG[item.status].color
                          )}
                        >
                          {STATUS_CONFIG[item.status].label}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">
                          {item.createdAt
                            ? formatThaiDate(timestampToDate(item.createdAt))
                            : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
          <div className="p-5 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              หมวดหมู่ที่หายบ่อย
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {categoryBreakdown.slice(0, 6).map((cat) => (
              <div key={cat.value} className="flex items-center gap-3">
                <span className="text-2xl">{cat.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {cat.label}
                    </span>
                    <span className="text-sm text-gray-500">{cat.count}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#06C755] rounded-full transition-all"
                      style={{
                        width: `${
                          stats.totalLost > 0
                            ? (cat.count / stats.totalLost) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}

            {categoryBreakdown.every((cat) => cat.count === 0) && (
              <p className="text-center text-gray-500 py-4">ยังไม่มีข้อมูล</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-[#06C755] to-[#05a647] rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">สรุปภาพรวม</h3>
            <p className="text-white/80 text-sm">อัตราการส่งคืนของ</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/10 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold">
              {stats.totalLost > 0
                ? Math.round((stats.claimed / stats.totalLost) * 100)
                : 0}
              %
            </p>
            <p className="text-sm text-white/80">อัตราส่งคืน</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold">{stats.found}</p>
            <p className="text-sm text-white/80">รอรับคืน</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold">
              {stats.totalLost + stats.totalFound}
            </p>
            <p className="text-sm text-white/80">รายการทั้งหมด</p>
          </div>
        </div>
      </div>
    </div>
  );
}
