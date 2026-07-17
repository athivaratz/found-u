"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Bot,
  CheckCircle2,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { getAppSettingsWithMeta, updateAppSettings } from "@/lib/database";
import { pickSettingsKeys, OPENROUTER_SETTING_KEYS } from "@/lib/admin/ai-settings-keys";
import { buildOpenRouterRequestExtras } from "@/lib/agent/openrouter-routing";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/types";

type EndpointRow = {
  slug: string;
  name: string;
  status?: string;
  contextLength?: number;
  maxCompletionTokens?: number | null;
  pricingPrompt?: string;
  pricingCompletion?: string;
  uptimeLast30m?: number | null;
};

function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function AdminOpenRouterSettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [endpoints, setEndpoints] = useState<EndpointRow[]>([]);
  const [endpointsLoading, setEndpointsLoading] = useState(false);
  const [endpointsError, setEndpointsError] = useState<string | null>(null);

  const selectedOrder = settings.agentOpenRouterProviderOrder ?? [];
  const ignoreText = (settings.agentOpenRouterProviderIgnore ?? []).join(", ");

  const routingPreview = useMemo(
    () => buildOpenRouterRequestExtras(settings),
    [settings]
  );

  useEffect(() => {
    let mounted = true;
    getAppSettingsWithMeta()
      .then(({ settings: loaded, loadError }) => {
        if (!mounted) return;
        setSettings({ ...DEFAULT_APP_SETTINGS, ...loaded });
        setLoadError(loadError ?? null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const loadEndpoints = useCallback(async () => {
    const model = settings.agentOpenRouterModel?.trim();
    if (!model) {
      setEndpointsError("กรุณาระบุ OpenRouter Model ก่อน");
      return;
    }

    setEndpointsLoading(true);
    setEndpointsError(null);
    try {
      const res = await fetch(
        `/api/agent/openrouter/endpoints?model=${encodeURIComponent(model)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "โหลด providers ไม่สำเร็จ");
      }
      setEndpoints(data.endpoints ?? []);
    } catch (error) {
      setEndpoints([]);
      setEndpointsError(
        error instanceof Error ? error.message : "โหลด providers ไม่สำเร็จ"
      );
    } finally {
      setEndpointsLoading(false);
    }
  }, [settings.agentOpenRouterModel]);

  useEffect(() => {
    if (!loading && settings.agentOpenRouterModel) {
      void loadEndpoints();
    }
  }, [loading, settings.agentOpenRouterModel, loadEndpoints]);

  const toggleProvider = (slug: string) => {
    setSettings((prev) => {
      const current = prev.agentOpenRouterProviderOrder ?? [];
      const next = current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [...current, slug];
      return { ...prev, agentOpenRouterProviderOrder: next };
    });
  };

  const moveProvider = (slug: string, direction: -1 | 1) => {
    setSettings((prev) => {
      const current = [...(prev.agentOpenRouterProviderOrder ?? [])];
      const idx = current.indexOf(slug);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= current.length) return prev;
      [current[idx], current[target]] = [current[target], current[idx]];
      return { ...prev, agentOpenRouterProviderOrder: current };
    });
  };

  const handleSave = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await updateAppSettings(
        pickSettingsKeys(settings, OPENROUTER_SETTING_KEYS),
        user.uid
      );
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

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
              OpenRouter Settings
            </h1>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto space-y-6">
        <div className="rounded-2xl border border-amber-200/60 bg-amber-50/80 dark:bg-amber-950/30 dark:border-amber-800/40 p-4 text-sm text-amber-900 dark:text-amber-100 leading-relaxed">
          <p className="font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            แก้ปัญหา AI หยุดกลางคำ / สลับ provider เอง
          </p>
          <p className="mt-2 text-amber-800 dark:text-amber-200/90">
            OpenRouter จะ load-balance ไปหลาย upstream (เช่น OMNICloud, Poolside) ทำให้คำตอบไม่สม่ำเสมอ
            และบางครั้งจบด้วย <code className="text-xs">finish_reason: stop</code> ทั้งที่ข้อความยังไม่ครบ
            เปิด <strong>Lock provider</strong> แล้วเลือก provider ที่เสถียรเพื่อบังคับใช้ endpoint เดิมทุกครั้ง
          </p>
        </div>

        <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                การตั้งค่า Routing
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                ใช้กับ Agent เมื่อ provider หลักเป็น OpenRouter
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#06C755] text-white font-medium disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              บันทึก
            </button>
          </div>

          {loadError ? (
            <p className="text-sm text-amber-600">{loadError}</p>
          ) : null}
          {showSuccess ? (
            <p className="text-sm text-green-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              บันทึกแล้ว
            </p>
          ) : null}

          <div>
            <label className="text-xs text-gray-500">OpenRouter Model ID</label>
            <input
              value={settings.agentOpenRouterModel || ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  agentOpenRouterModel: e.target.value,
                }))
              }
              placeholder="deepseek/deepseek-v3.2-speciale"
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.agentOpenRouterLockProvider ?? false}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  agentOpenRouterLockProvider: e.target.checked,
                  agentOpenRouterAllowFallbacks: e.target.checked
                    ? (prev.agentOpenRouterAllowFallbacks ?? false)
                    : prev.agentOpenRouterAllowFallbacks,
                }))
              }
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-line-green" />
              Lock provider (ไม่ให้ OpenRouter สลับ upstream อัตโนมัติ)
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.agentOpenRouterAllowFallbacks ?? false}
              disabled={!(settings.agentOpenRouterLockProvider ?? false)}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  agentOpenRouterAllowFallbacks: e.target.checked,
                }))
              }
              className="rounded border-gray-300 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              อนุญาต fallback ไป provider อื่น (เมื่อ lock แล้ว provider หลักล่ม)
            </span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-gray-500">Reasoning effort</label>
              <select
                value={settings.agentOpenRouterReasoningEffort ?? "minimal"}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    agentOpenRouterReasoningEffort: e.target
                      .value as AppSettings["agentOpenRouterReasoningEffort"],
                  }))
                }
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              >
                <option value="none">none (แนะนำสำหรับแชท)</option>
                <option value="minimal">minimal</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="xhigh">xhigh</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Sort (เมื่อไม่ lock)</label>
              <select
                value={settings.agentOpenRouterProviderSort ?? "latency"}
                disabled={settings.agentOpenRouterLockProvider ?? false}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    agentOpenRouterProviderSort: e.target
                      .value as AppSettings["agentOpenRouterProviderSort"],
                  }))
                }
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="latency">latency</option>
                <option value="throughput">throughput</option>
                <option value="price">price</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500">
              Ignore providers (slug คั่นด้วย comma)
            </label>
            <input
              value={ignoreText}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  agentOpenRouterProviderIgnore: parseCsvList(e.target.value),
                }))
              }
              placeholder="poolside, deepinfra"
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <p className="text-xs text-gray-500">
              Max output tokens ตั้งที่{" "}
              <Link href="/admin/ai/settings?tab=agent" className="text-[#06C755] hover:underline">
                Agent ร่วม
              </Link>{" "}
              (ไม่บันทึกจากหน้านี้)
            </p>
          </div>

          <pre className="text-xs rounded-xl bg-gray-100 dark:bg-gray-900/80 p-3 overflow-x-auto text-gray-700 dark:text-gray-300">
            {JSON.stringify(routingPreview ?? {}, null, 2)}
          </pre>
        </div>

        <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Providers สำหรับโมเดลนี้
            </h2>
            <button
              type="button"
              onClick={() => void loadEndpoints()}
              disabled={endpointsLoading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
            >
              {endpointsLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              โหลดใหม่
            </button>
          </div>

          {endpointsError ? (
            <p className="text-sm text-amber-600">{endpointsError}</p>
          ) : null}

          {endpoints.length === 0 && !endpointsLoading ? (
            <p className="text-sm text-gray-500">ยังไม่มีรายการ provider</p>
          ) : null}

          <ul className="space-y-2">
            {endpoints.map((ep) => {
              const selected = selectedOrder.includes(ep.slug);
              const orderIndex = selectedOrder.indexOf(ep.slug);
              return (
                <li
                  key={ep.slug}
                  className={`rounded-xl border p-3 flex flex-wrap items-center gap-3 ${
                    selected
                      ? "border-line-green/50 bg-line-green/5"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <label className="flex items-center gap-2 flex-1 min-w-[200px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleProvider(ep.slug)}
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {ep.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        slug: <code>{ep.slug}</code>
                        {ep.status ? ` · ${ep.status}` : ""}
                      </div>
                    </div>
                  </label>
                  {selected ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 mr-1">
                        ลำดับ {orderIndex + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => moveProvider(ep.slug, -1)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        aria-label="เลื่อนขึ้น"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveProvider(ep.slug, 1)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        aria-label="เลื่อนลง"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {selectedOrder.length > 0 ? (
            <p className="text-xs text-gray-500">
              ลำดับที่ใช้: {selectedOrder.join(" → ")}
            </p>
          ) : (
            <p className="text-xs text-amber-600">
              เลือกอย่างน้อย 1 provider แล้วเปิด Lock เพื่อบังคับใช้ endpoint เดิม
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
