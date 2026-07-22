"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Activity,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Save,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import {
  getAllUsers,
  getAppSettings,
  subscribeToAIUsage,
  updateAppSettings,
} from "@/lib/database";
import {
  DEFAULT_APP_SETTINGS,
  type AIUsageRecord,
  type AppSettings,
  type AppUser,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type ChartSource = "global" | "user";
type TimeRange = "1h" | "1d" | "3d" | "7d";

const RATE_LIMIT_KEYS = [
  "aiRateLimitEnabled",
  "aiRateLimitPerMinute",
  "aiRateLimitPerHour",
  "aiRateLimitMessage",
  "systemAiRateLimitEnabled",
  "systemAiRateLimitPerMinute",
  "systemAiRateLimitPerHour",
] as const satisfies readonly (keyof AppSettings)[];

function LineChart({
  data,
  color = "#06C755",
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  const rawMax = Math.max(...data.map((d) => d.value), 1);
  const maxValue = Math.ceil(rawMax * 1.2);

  const getYAxisTicks = (max: number) => {
    if (max <= 5) return [0, 1, 2, 3, 4, 5].filter((v) => v <= max + 1);
    if (max <= 10) return [0, 2, 4, 6, 8, 10].filter((v) => v <= max + 2);
    if (max <= 20) return [0, 5, 10, 15, 20].filter((v) => v <= max + 5);
    if (max <= 50) return [0, 10, 20, 30, 40, 50].filter((v) => v <= max + 10);
    if (max <= 100) return [0, 25, 50, 75, 100].filter((v) => v <= max + 25);
    const step = Math.ceil(max / 5 / 10) * 10;
    return [0, step, step * 2, step * 3, step * 4, step * 5].filter(
      (v) => v <= max + step
    );
  };

  const yTicks = getYAxisTicks(maxValue);
  const yAxisMax = yTicks[yTicks.length - 1] || maxValue;
  const chartLeft = 12;
  const chartWidth = 100 - chartLeft;
  const chartHeight = 65;

  const points = data.map((d, i) => ({
    x: chartLeft + (i / (data.length - 1 || 1)) * chartWidth,
    y: chartHeight - (d.value / yAxisMax) * chartHeight,
  }));

  const showLabelEvery = data.length > 10 ? Math.ceil(data.length / 7) : 1;

  return (
    <div className="relative w-full">
      <div className="relative w-full" style={{ paddingBottom: "70%" }}>
        <svg
          viewBox="0 0 100 75"
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
        >
          <rect x="0" y="0" width="100" height="75" fill="transparent" />
          {yTicks.map((tick) => {
            const y = chartHeight - (tick / yAxisMax) * chartHeight;
            return (
              <g key={tick}>
                <line
                  x1={chartLeft}
                  y1={y}
                  x2="100"
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="0.15"
                  className="text-gray-200 dark:text-gray-700"
                />
                <text
                  x={chartLeft - 1.5}
                  y={y + 1}
                  textAnchor="end"
                  className="text-gray-400 dark:text-gray-500"
                  style={{ fontSize: "3px" }}
                >
                  {tick}
                </text>
              </g>
            );
          })}
          {data.map((_, i) => (
            <line
              key={i}
              x1={chartLeft + (i / (data.length - 1 || 1)) * chartWidth}
              y1="0"
              x2={chartLeft + (i / (data.length - 1 || 1)) * chartWidth}
              y2={chartHeight}
              stroke="currentColor"
              strokeWidth="0.1"
              className="text-gray-100 dark:text-gray-800"
            />
          ))}
          {points.length > 1 && (
            <path
              d={
                `M ${points[0].x} ${chartHeight} L ${points[0].x} ${points[0].y} ` +
                points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ") +
                ` L ${points[points.length - 1].x} ${chartHeight} Z`
              }
              fill={color}
              fillOpacity="0.15"
            />
          )}
          {points.length > 1 && (
            <path
              d={
                `M ${points[0].x} ${points[0].y} ` +
                points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ")
              }
              fill="none"
              stroke={color}
              strokeWidth="0.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="1" fill={color} />
          ))}
        </svg>
      </div>
      <div
        className="flex justify-between text-[10px] text-gray-400 mt-2"
        style={{ marginLeft: "12%" }}
      >
        {data.map((d, i) =>
          i % showLabelEvery === 0 || i === data.length - 1 ? (
            <span key={i} className="text-center" style={{ minWidth: 0 }}>
              {d.label}
            </span>
          ) : (
            <span key={i} />
          )
        )}
      </div>
    </div>
  );
}

export default function AdminAIUsagePage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [chartSource, setChartSource] = useState<ChartSource>("global");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [aiUsageRecords, setAiUsageRecords] = useState<AIUsageRecord[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, AppUser>>({});
  const [aiLoading, setAiLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getAppSettings()
      .then((data) => {
        if (mounted) setSettings(data);
      })
      .catch((error) => console.error("Error loading settings:", error))
      .finally(() => {
        if (mounted) setLoadingSettings(false);
      });

    const unsubAI = subscribeToAIUsage((records) => {
      setAiUsageRecords(records);
      setAiLoading(false);
    });

    getAllUsers().then((users) => {
      const map: Record<string, AppUser> = {};
      users.forEach((u) => {
        map[u.uid] = u;
      });
      setUsersMap(map);
    });

    return () => {
      mounted = false;
      unsubAI();
    };
  }, []);

  const handleSave = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      const payload = {} as Pick<AppSettings, (typeof RATE_LIMIT_KEYS)[number]>;
      for (const key of RATE_LIMIT_KEYS) {
        payload[key] = settings[key] as never;
      }
      await updateAppSettings(payload, user.uid);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving rate limit settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const aiStats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const todayCount = aiUsageRecords.filter(
      (r) => new Date(r.timestamp) >= today
    ).length;
    const weekCount = aiUsageRecords.filter(
      (r) => new Date(r.timestamp) >= weekAgo
    ).length;
    const monthCount = aiUsageRecords.filter(
      (r) => new Date(r.timestamp) >= monthAgo
    ).length;

    const byEndpoint: Record<string, number> = {};
    aiUsageRecords.forEach((r) => {
      byEndpoint[r.endpoint] = (byEndpoint[r.endpoint] || 0) + 1;
    });

    const byUser: Record<string, { count: number; userId: string }> = {};
    aiUsageRecords.forEach((r) => {
      if (!byUser[r.userId]) {
        byUser[r.userId] = { count: 0, userId: r.userId };
      }
      byUser[r.userId].count++;
    });

    const getChartData = (range: TimeRange, userId?: string) => {
      const records = userId
        ? aiUsageRecords.filter((r) => r.userId === userId)
        : aiUsageRecords;

      if (range === "1h") {
        const data: { label: string; count: number }[] = [];
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        for (let i = 0; i < 12; i++) {
          const start = new Date(oneHourAgo.getTime() + i * 5 * 60 * 1000);
          const end = new Date(start.getTime() + 5 * 60 * 1000);
          const count = records.filter((r) => {
            const t = new Date(r.timestamp);
            return t >= start && t < end;
          }).length;
          data.push({
            label: start.toLocaleTimeString("th-TH", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            count,
          });
        }
        return data;
      }

      if (range === "1d") {
        const data: { label: string; count: number }[] = [];
        for (let i = 23; i >= 0; i--) {
          const start = new Date(now.getTime() - i * 60 * 60 * 1000);
          const end = new Date(start.getTime() + 60 * 60 * 1000);
          const count = records.filter((r) => {
            const t = new Date(r.timestamp);
            return t >= start && t < end;
          }).length;
          data.push({
            label: start.toLocaleTimeString("th-TH", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            count,
          });
        }
        return data;
      }

      if (range === "3d") {
        const data: { label: string; count: number }[] = [];
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        for (let i = 0; i < 12; i++) {
          const start = new Date(threeDaysAgo.getTime() + i * 6 * 60 * 60 * 1000);
          const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
          const count = records.filter((r) => {
            const t = new Date(r.timestamp);
            return t >= start && t < end;
          }).length;
          data.push({
            label:
              start.toLocaleDateString("th-TH", {
                day: "numeric",
                month: "short",
              }) +
              " " +
              start.toLocaleTimeString("th-TH", { hour: "2-digit" }) +
              ":00",
            count,
          });
        }
        return data;
      }

      const data: { label: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
        const count = records.filter((r) => {
          const t = new Date(r.timestamp);
          return t >= date && t < nextDate;
        }).length;
        data.push({
          label: date.toLocaleDateString("th-TH", {
            day: "numeric",
            month: "short",
          }),
          count,
        });
      }
      return data;
    };

    return {
      total: aiUsageRecords.length,
      today: todayCount,
      week: weekCount,
      month: monthCount,
      byEndpoint,
      byUser: Object.values(byUser).sort((a, b) => b.count - a.count),
      getChartData,
    };
  }, [aiUsageRecords]);

  const getCurrentChartData = () => {
    const timeRangeLabels: Record<TimeRange, string> = {
      "1h": "1 ชั่วโมงล่าสุด",
      "1d": "24 ชั่วโมงล่าสุด",
      "3d": "3 วันล่าสุด",
      "7d": "7 วันล่าสุด",
    };

    if (chartSource === "global") {
      const data = aiStats.getChartData(timeRange);
      return {
        data: data.map((d) => ({ label: d.label, value: d.count })),
        color: "#06C755",
        title: `Global - ${timeRangeLabels[timeRange]}`,
      };
    }

    const userId = selectedUserId || aiStats.byUser[0]?.userId;
    if (!userId) {
      return { data: [], color: "#F59E0B", title: "ไม่พบข้อมูลผู้ใช้" };
    }
    const userInfo = usersMap[userId];
    const displayName = userInfo?.email || userInfo?.displayName || userId;
    const data = aiStats.getChartData(timeRange, userId);
    return {
      data: data.map((d) => ({ label: d.label, value: d.count })),
      color: "#F59E0B",
      title: `${displayName} - ${timeRangeLabels[timeRange]}`,
    };
  };

  const chartData = getCurrentChartData();

  return (
    <div className="min-h-screen bg-bg-secondary dark:bg-gray-900">
      <header className="bg-bg-primary dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="px-4 h-16 flex items-center gap-3">
          <Link
            href="/admin/ai"
            className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-text-primary dark:text-white" />
          </Link>
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-line-green" />
            <h1 className="text-lg font-semibold text-text-primary dark:text-white">
              Usage & Rate Limit
            </h1>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto space-y-6">
        <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                <RefreshCw className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  AI Rate Limit
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  จำกัดการใช้งาน AI ต่อผู้ใช้และทั้งระบบ
                </p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || loadingSettings}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#06C755] text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              บันทึก
            </button>
          </div>

          {showSuccess ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              บันทึกการตั้งค่าเรียบร้อยแล้ว
            </div>
          ) : null}

          {loadingSettings ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              กำลังโหลด
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    จำกัดต่อผู้ใช้
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    ป้องกันการใช้งาน AI มากเกินไปต่อบัญชี
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      aiRateLimitEnabled: !settings.aiRateLimitEnabled,
                    })
                  }
                  className={cn(
                    "w-14 h-8 rounded-full transition-colors relative flex-shrink-0",
                    settings.aiRateLimitEnabled
                      ? "bg-line-green"
                      : "bg-gray-300 dark:bg-gray-600"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform",
                      settings.aiRateLimitEnabled ? "right-1" : "left-1"
                    )}
                  />
                </button>
              </div>

              {settings.aiRateLimitEnabled ? (
                <div className="space-y-4 pl-1">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      จำกัดต่อนาที (Per Minute)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={settings.aiRateLimitPerMinute || 5}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            aiRateLimitPerMinute:
                              parseInt(e.target.value, 10) || 5,
                          })
                        }
                        className="w-24 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-line-green"
                      />
                      <span className="text-sm text-gray-500">
                        ครั้ง / นาที / ผู้ใช้
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      จำกัดต่อชั่วโมง (Per Hour)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={settings.aiRateLimitPerHour || 30}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            aiRateLimitPerHour:
                              parseInt(e.target.value, 10) || 30,
                          })
                        }
                        className="w-24 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-line-green"
                      />
                      <span className="text-sm text-gray-500">
                        ครั้ง / ชั่วโมง / ผู้ใช้
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      ข้อความเมื่อถูก Limit
                    </label>
                    <input
                      type="text"
                      value={settings.aiRateLimitMessage || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          aiRateLimitMessage: e.target.value,
                        })
                      }
                      placeholder="คุณใช้งาน AI บ่อยเกินไป กรุณารอสักครู่"
                      className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-line-green"
                    />
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                    <div className="flex items-start justify-between mb-4 gap-4">
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          Rate Limit ระดับระบบ (System-wide)
                        </h4>
                        <p className="text-sm text-gray-500 mt-1">
                          จำกัดการใช้งาน AI รวมทั้งระบบ (ทุก user รวมกัน)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            systemAiRateLimitEnabled:
                              !settings.systemAiRateLimitEnabled,
                          })
                        }
                        className={cn(
                          "w-14 h-8 rounded-full transition-colors relative flex-shrink-0",
                          settings.systemAiRateLimitEnabled
                            ? "bg-line-green"
                            : "bg-gray-300 dark:bg-gray-600"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform",
                            settings.systemAiRateLimitEnabled
                              ? "right-1"
                              : "left-1"
                          )}
                        />
                      </button>
                    </div>

                    {settings.systemAiRateLimitEnabled ? (
                      <div className="space-y-3 pl-4 border-l-2 border-purple-200 dark:border-purple-800">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            จำกัดต่อนาที (ทั้งระบบ)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={settings.systemAiRateLimitPerMinute || 20}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  systemAiRateLimitPerMinute:
                                    parseInt(e.target.value, 10) || 20,
                                })
                              }
                              className="w-24 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-line-green"
                            />
                            <span className="text-sm text-gray-500">
                              ครั้ง / นาที (ทุก user รวมกัน)
                            </span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            จำกัดต่อชั่วโมง (ทั้งระบบ)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={10000}
                              value={settings.systemAiRateLimitPerHour || 100}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  systemAiRateLimitPerHour:
                                    parseInt(e.target.value, 10) || 100,
                                })
                              }
                              className="w-24 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-line-green"
                            />
                            <span className="text-sm text-gray-500">
                              ครั้ง / ชั่วโมง (ทุก user รวมกัน)
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {aiLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#06C755]" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-purple-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
                  {aiStats.total}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">ทั้งหมด</p>
              </div>
              <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-blue-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
                  {aiStats.today}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">วันนี้</p>
              </div>
              <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
                  {aiStats.week}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  7 วันล่าสุด
                </p>
              </div>
              <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <Users className="w-6 h-6 text-orange-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
                  {aiStats.byUser.length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">ผู้ใช้</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-bg-primary dark:bg-gray-800 rounded-2xl shadow-sm p-6 border border-gray-100 dark:border-gray-700">
                <div className="flex flex-col gap-4 mb-6">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    API Usage Chart
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    <select
                      value={chartSource}
                      onChange={(e) => {
                        setChartSource(e.target.value as ChartSource);
                        if (
                          e.target.value === "user" &&
                          !selectedUserId &&
                          aiStats.byUser.length > 0
                        ) {
                          setSelectedUserId(aiStats.byUser[0].userId);
                        }
                      }}
                      className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border-0 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-[#06C755]"
                    >
                      <option value="global">Global</option>
                      <option value="user">User</option>
                    </select>
                    {chartSource === "user" ? (
                      <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border-0 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-[#06C755] max-w-[200px]"
                      >
                        {aiStats.byUser.map((u) => {
                          const userInfo = usersMap[u.userId];
                          const displayName =
                            userInfo?.email ||
                            userInfo?.displayName ||
                            u.userId.slice(0, 12) + "...";
                          return (
                            <option key={u.userId} value={u.userId}>
                              {displayName} ({u.count})
                            </option>
                          );
                        })}
                      </select>
                    ) : null}
                    <select
                      value={timeRange}
                      onChange={(e) =>
                        setTimeRange(e.target.value as TimeRange)
                      }
                      className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border-0 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-[#06C755]"
                    >
                      <option value="1h">1 ชั่วโมง</option>
                      <option value="1d">1 วัน</option>
                      <option value="3d">3 วัน</option>
                      <option value="7d">7 วัน</option>
                    </select>
                  </div>
                </div>
                <div className="w-full max-w-lg mx-auto">
                  <div className="relative w-full" style={{ paddingBottom: "75%" }}>
                    <div className="absolute inset-0">
                      <LineChart data={chartData.data} color={chartData.color} />
                    </div>
                  </div>
                  <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
                    {chartData.title}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl shadow-sm p-5 border border-gray-100 dark:border-gray-700">
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-4">
                    Endpoints
                  </h4>
                  <div className="space-y-3">
                    {Object.entries(aiStats.byEndpoint).map(
                      ([endpoint, count]) => (
                        <div
                          key={endpoint}
                          className="flex items-center justify-between"
                        >
                          <span className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate flex-1">
                            {endpoint}
                          </span>
                          <span className="text-sm font-bold text-gray-900 dark:text-white ml-2">
                            {count}
                          </span>
                        </div>
                      )
                    )}
                    {Object.keys(aiStats.byEndpoint).length === 0 ? (
                      <p className="text-center text-gray-500 text-sm">
                        ไม่มีข้อมูล
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl shadow-sm p-5 border border-gray-100 dark:border-gray-700">
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-4">
                    Top Users
                  </h4>
                  <div className="space-y-2">
                    {aiStats.byUser.slice(0, 5).map((u, index) => {
                      const userInfo = usersMap[u.userId];
                      const displayName =
                        userInfo?.email ||
                        userInfo?.displayName ||
                        u.userId.slice(0, 12) + "...";
                      const isSelected =
                        chartSource === "user" && selectedUserId === u.userId;
                      return (
                        <button
                          key={u.userId}
                          type="button"
                          onClick={() => {
                            setChartSource("user");
                            setSelectedUserId(u.userId);
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left",
                            isSelected
                              ? "bg-[#06C755]/10 border border-[#06C755]"
                              : "hover:bg-gray-50 dark:hover:bg-gray-700"
                          )}
                        >
                          <div
                            className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                              index === 0
                                ? "bg-yellow-100 text-yellow-700"
                                : index === 1
                                  ? "bg-gray-200 text-gray-700"
                                  : index === 2
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-gray-100 text-gray-600"
                            )}
                          >
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-900 dark:text-white truncate">
                              {displayName}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-[#06C755]">
                            {u.count}
                          </span>
                        </button>
                      );
                    })}
                    {aiStats.byUser.length === 0 ? (
                      <p className="text-center text-gray-500 text-sm py-2">
                        ไม่มีข้อมูล
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
