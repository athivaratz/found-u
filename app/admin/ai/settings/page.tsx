"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Save,
  Loader2,
  CheckCircle2,
  Settings2,
  Sparkles,
  Route,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { getAppSettingsWithMeta, updateAppSettings } from "@/lib/database";
import {
  pickSettingsKeys,
  AGENT_SHARED_SETTING_KEYS,
} from "@/lib/admin/ai-settings-keys";
import { AiSettingField } from "@/components/admin/ai-setting-field";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/types";

const TABS = [
  { id: "agent", label: "Agent ร่วม", icon: Settings2 },
  { id: "gemini", label: "Gemini & Pipeline", icon: Sparkles },
  { id: "openrouter", label: "OpenRouter", icon: Route },
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseNumber(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function AdminAiSettingsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabId =
    tabParam === "gemini" || tabParam === "openrouter" ? tabParam : "agent";

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    getAppSettingsWithMeta()
      .then(({ settings: loaded }) => {
        if (mounted) setSettings({ ...DEFAULT_APP_SETTINGS, ...loaded });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveAgent = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await updateAppSettings(
        pickSettingsKeys(settings, AGENT_SHARED_SETTING_KEYS),
        user.uid
      );
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white";

  const tabLinks = useMemo(
    () =>
      TABS.map((tab) => ({
        ...tab,
        href: `/admin/ai/settings?tab=${tab.id}`,
      })),
    []
  );

  return (
    <div className="min-h-screen bg-bg-secondary dark:bg-gray-900">
      <header className="bg-bg-primary dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="px-4 h-16 flex items-center gap-3">
          <Link
            href="/admin/ai"
            className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
          >
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <Bot className="w-6 h-6 text-line-green" />
          <h1 className="text-lg font-semibold">ตั้งค่า AI</h1>
        </div>
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
          {tabLinks.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm whitespace-nowrap ${
                  active
                    ? "bg-[#06C755]/15 text-[#06C755] font-medium"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            กำลังโหลด...
          </div>
        ) : null}

        {activeTab === "agent" ? (
          <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-4">
            <p className="text-sm text-gray-500">
              การตั้งค่าเหล่านี้ใช้ร่วมกันทุก provider — ไม่ซ้ำกับหน้า Gemini หรือ OpenRouter
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <AiSettingField settingKey="agentProvider" settings={settings}>
                <select
                  value={settings.agentProvider ?? "auto"}
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      agentProvider: e.target.value as AppSettings["agentProvider"],
                    }))
                  }
                  className={inputClass}
                >
                  <option value="auto">Auto (แนะนำ)</option>
                  <option value="gemini">Gemini</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </AiSettingField>
              <AiSettingField settingKey="agentFallbackProvider" settings={settings}>
                <select
                  value={settings.agentFallbackProvider ?? "openrouter"}
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      agentFallbackProvider: e.target
                        .value as AppSettings["agentFallbackProvider"],
                    }))
                  }
                  className={inputClass}
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="gemini">Gemini</option>
                </select>
              </AiSettingField>
              <AiSettingField settingKey="agentMaxSteps" settings={settings}>
                <input
                  type="number"
                  min={3}
                  max={8}
                  value={settings.agentMaxSteps ?? ""}
                  placeholder="Auto (4)"
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      agentMaxSteps: parseNumber(e.target.value),
                    }))
                  }
                  className={inputClass}
                />
              </AiSettingField>
              <AiSettingField settingKey="agentMaxOutputTokens" settings={settings}>
                <input
                  type="number"
                  min={1024}
                  max={16384}
                  value={settings.agentMaxOutputTokens ?? ""}
                  placeholder="Auto"
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      agentMaxOutputTokens: parseNumber(e.target.value),
                    }))
                  }
                  className={inputClass}
                />
              </AiSettingField>
              <AiSettingField settingKey="agentTemperature" settings={settings}>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={settings.agentTemperature ?? ""}
                  placeholder="Auto (0.3)"
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      agentTemperature: parseNumber(e.target.value),
                    }))
                  }
                  className={inputClass}
                />
              </AiSettingField>
              <AiSettingField settingKey="agentContextMaxMessages" settings={settings}>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={settings.agentContextMaxMessages ?? ""}
                  placeholder="Auto (8)"
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      agentContextMaxMessages: parseNumber(e.target.value),
                    }))
                  }
                  className={inputClass}
                />
              </AiSettingField>
              <AiSettingField settingKey="agentContextMaxTokens" settings={settings}>
                <input
                  type="number"
                  min={2000}
                  max={32000}
                  step={500}
                  value={settings.agentContextMaxTokens ?? ""}
                  placeholder="Auto (6000)"
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      agentContextMaxTokens: parseNumber(e.target.value),
                    }))
                  }
                  className={inputClass}
                />
              </AiSettingField>
              <AiSettingField settingKey="agentContextStrategy" settings={settings}>
                <select
                  value={settings.agentContextStrategy ?? "hybrid"}
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      agentContextStrategy: e.target
                        .value as AppSettings["agentContextStrategy"],
                    }))
                  }
                  className={inputClass}
                >
                  <option value="hybrid">hybrid (Auto)</option>
                  <option value="messages">messages</option>
                  <option value="tokens">tokens</option>
                </select>
              </AiSettingField>
              <AiSettingField settingKey="agentMemoryMaxFacts" settings={settings}>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={settings.agentMemoryMaxFacts ?? 5}
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      agentMemoryMaxFacts: parseNumber(e.target.value),
                    }))
                  }
                  className={inputClass}
                />
              </AiSettingField>
            </div>
            <button
              type="button"
              onClick={handleSaveAgent}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#06C755] text-white font-medium disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              บันทึก Agent ร่วม
            </button>
            {showSuccess ? (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                บันทึกแล้ว
              </p>
            ) : null}
          </div>
        ) : null}

        {activeTab === "gemini" ? (
          <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
            <p className="text-sm text-gray-500 mb-4">
              ตั้งค่า NER, Matching, Vision และ Gemini Agent model — บันทึกเฉพาะฟิลด์ Gemini
              ไม่ทับ OpenRouter
            </p>
            <Link
              href="/admin/ai/models"
              className="inline-flex items-center gap-2 text-[#06C755] hover:underline"
            >
              เปิดหน้าตั้งค่า Gemini & Pipeline เต็มรูปแบบ →
            </Link>
          </div>
        ) : null}

        {activeTab === "openrouter" ? (
          <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
            <p className="text-sm text-gray-500 mb-4">
              Lock provider, reasoning, routing — บันทึกเฉพาะฟิลด์ OpenRouter
            </p>
            <Link
              href="/admin/ai/openrouter"
              className="inline-flex items-center gap-2 text-[#06C755] hover:underline"
            >
              เปิดหน้าตั้งค่า OpenRouter เต็มรูปแบบ →
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default function AdminAiSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          กำลังโหลด...
        </div>
      }
    >
      <AdminAiSettingsContent />
    </Suspense>
  );
}
