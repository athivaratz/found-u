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
  Activity,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { getAppSettingsWithMeta, updateAppSettings } from "@/lib/database";
import {
  pickSettingsKeys,
  AGENT_SHARED_SETTING_KEYS,
} from "@/lib/admin/ai-settings-keys";
import { AiSettingField } from "@/components/admin/ai-setting-field";
import { ApiKeyLabelLink } from "@/components/admin/api-key-label-link";
import { WIZARD_FREE_OPENROUTER_MODELS } from "@/lib/setup/validations/wizard-ai";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/types";

type AiCredentialsMeta = {
  provider: "auto" | "gemini" | "openrouter" | "none";
  openrouterModel: string | null;
  hasGeminiKey: boolean;
  hasOpenrouterKey: boolean;
  configuredAt: string | null;
};

const KEY_PLACEHOLDER = "••••••••••••••••";

function isPlaceholderKeyInput(value: string): boolean {
  if (!value.trim()) return true;
  return /^[•*.\s]+$/.test(value.trim());
}

const TABS = [
  { id: "agent", label: "Agent ร่วม", icon: Settings2 },
  { id: "gemini", label: "Gemini Key", icon: Sparkles },
  { id: "openrouter", label: "OpenRouter Key", icon: Route },
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

  const [credentialsMeta, setCredentialsMeta] = useState<AiCredentialsMeta | null>(null);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialsSuccess, setCredentialsSuccess] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [openrouterModel, setOpenrouterModel] = useState<string>(WIZARD_FREE_OPENROUTER_MODELS[0]);
  const [testingProvider, setTestingProvider] = useState<"gemini" | "openrouter" | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

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

  useEffect(() => {
    if (activeTab !== "gemini" && activeTab !== "openrouter") return;

    let mounted = true;
    setLoadingCredentials(true);
    setCredentialsError(null);

    fetch("/api/admin/ai-credentials")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "โหลด credentials ไม่สำเร็จ");
        }
        return res.json() as Promise<AiCredentialsMeta>;
      })
      .then((data) => {
        if (!mounted) return;
        setCredentialsMeta(data);
        setOpenrouterModel(
          data.openrouterModel?.trim() || WIZARD_FREE_OPENROUTER_MODELS[0]
        );
        setGeminiApiKey("");
        setOpenrouterApiKey("");
      })
      .catch((error) => {
        if (mounted) {
          setCredentialsError(
            error instanceof Error ? error.message : "โหลด credentials ไม่สำเร็จ"
          );
        }
      })
      .finally(() => {
        if (mounted) setLoadingCredentials(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeTab]);

  const handleSaveCredentials = async (
    patch: {
      geminiApiKey?: string;
      openrouterApiKey?: string;
      openrouterModel?: string;
    }
  ) => {
    setSavingCredentials(true);
    setCredentialsError(null);
    setCredentialsSuccess(false);
    setTestResult(null);

    const body: Record<string, string> = {};
    if (patch.geminiApiKey && !isPlaceholderKeyInput(patch.geminiApiKey)) {
      body.geminiApiKey = patch.geminiApiKey.trim();
    }
    if (patch.openrouterApiKey && !isPlaceholderKeyInput(patch.openrouterApiKey)) {
      body.openrouterApiKey = patch.openrouterApiKey.trim();
    }
    if (patch.openrouterModel?.trim()) {
      body.openrouterModel = patch.openrouterModel.trim();
    }

    try {
      const res = await fetch("/api/admin/ai-credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "บันทึกไม่สำเร็จ");
      }
      setCredentialsMeta(data);
      setGeminiApiKey("");
      setOpenrouterApiKey("");
      setCredentialsSuccess(true);
      setTimeout(() => setCredentialsSuccess(false), 3000);
    } catch (error) {
      setCredentialsError(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleTestProvider = async (provider: "gemini" | "openrouter") => {
    setTestingProvider(provider);
    setTestResult(null);
    setCredentialsError(null);

    try {
      const res = await fetch("/api/agent/test-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ทดสอบไม่สำเร็จ");
      }
      const info = data.providers?.[provider] as
        | { configured?: boolean; ok?: boolean; error?: string; model?: string }
        | undefined;
      if (info?.ok) {
        setTestResult(`${provider}: OK${info.model ? ` [${info.model}]` : ""}`);
      } else if (!info?.configured) {
        setTestResult(`${provider}: ยังไม่ได้ตั้งค่า API key`);
      } else {
        setTestResult(`${provider}: ${info?.error || "เชื่อมต่อไม่สำเร็จ"}`);
      }
    } catch (error) {
      setTestResult(error instanceof Error ? error.message : "ทดสอบไม่สำเร็จ");
    } finally {
      setTestingProvider(null);
    }
  };

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
          <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-4">
            <p className="text-sm text-gray-500">
              ตั้งค่า Gemini API key — โมเดล pipeline อยู่ที่หน้า{" "}
              <Link href="/admin/ai/gemini" className="text-[#06C755] hover:underline">
                Gemini Settings
              </Link>
            </p>

            {loadingCredentials ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังโหลด credentials...
              </div>
            ) : null}

            {credentialsError ? (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {credentialsError}
              </p>
            ) : null}

            {credentialsMeta?.hasGeminiKey && !geminiApiKey ? (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ตั้งค่า Gemini API key แล้ว — กรอกค่าใหม่เพื่อเปลี่ยน
              </p>
            ) : null}

            <div>
              <ApiKeyLabelLink
                htmlFor="admin-gemini-api-key"
                label="Gemini API Key"
                href="https://aistudio.google.com/"
                ariaLabel="เปิด Google AI Studio"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              />
              <input
                id="admin-gemini-api-key"
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder={
                  credentialsMeta?.hasGeminiKey ? KEY_PLACEHOLDER : "AIza..."
                }
                autoComplete="off"
                className={inputClass}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  void handleSaveCredentials({ geminiApiKey })
                }
                disabled={savingCredentials}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#06C755] text-white font-medium disabled:opacity-60"
              >
                {savingCredentials ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                บันทึก Gemini key
              </button>
              <button
                type="button"
                onClick={() => void handleTestProvider("gemini")}
                disabled={testingProvider === "gemini"}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 disabled:opacity-60"
              >
                {testingProvider === "gemini" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Activity className="w-4 h-4" />
                )}
                ทดสอบการเชื่อมต่อ
              </button>
            </div>

            {credentialsSuccess ? (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                บันทึกแล้ว
              </p>
            ) : null}
            {testResult ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">{testResult}</p>
            ) : null}

            <Link
              href="/admin/ai/gemini"
              className="inline-flex items-center gap-2 text-[#06C755] hover:underline text-sm"
            >
              ตั้งโมเดล pipeline ที่ Gemini Settings →
            </Link>
          </div>
        ) : null}

        {activeTab === "openrouter" ? (
          <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-4">
            <p className="text-sm text-gray-500">
              ตั้งค่า OpenRouter API key และโมเดลเริ่มต้น — routing เพิ่มเติมอยู่ที่หน้า OpenRouter
            </p>

            {loadingCredentials ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังโหลด credentials...
              </div>
            ) : null}

            {credentialsError ? (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {credentialsError}
              </p>
            ) : null}

            {credentialsMeta?.hasOpenrouterKey && !openrouterApiKey ? (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ตั้งค่า OpenRouter API key แล้ว — กรอกค่าใหม่เพื่อเปลี่ยน
              </p>
            ) : null}

            <div>
              <ApiKeyLabelLink
                htmlFor="admin-openrouter-api-key"
                label="OpenRouter API Key"
                href="https://openrouter.ai/"
                ariaLabel="เปิด OpenRouter"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              />
              <input
                id="admin-openrouter-api-key"
                type="password"
                value={openrouterApiKey}
                onChange={(e) => setOpenrouterApiKey(e.target.value)}
                placeholder={
                  credentialsMeta?.hasOpenrouterKey ? KEY_PLACEHOLDER : "sk-or-..."
                }
                autoComplete="off"
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="admin-openrouter-model"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                OpenRouter Model
              </label>
              <select
                id="admin-openrouter-model"
                value={openrouterModel}
                onChange={(e) => setOpenrouterModel(e.target.value)}
                className={inputClass}
              >
                {WIZARD_FREE_OPENROUTER_MODELS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  void handleSaveCredentials({
                    openrouterApiKey,
                    openrouterModel,
                  })
                }
                disabled={savingCredentials}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#06C755] text-white font-medium disabled:opacity-60"
              >
                {savingCredentials ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                บันทึก OpenRouter
              </button>
              <button
                type="button"
                onClick={() => void handleTestProvider("openrouter")}
                disabled={testingProvider === "openrouter"}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 disabled:opacity-60"
              >
                {testingProvider === "openrouter" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Activity className="w-4 h-4" />
                )}
                ทดสอบการเชื่อมต่อ
              </button>
            </div>

            {credentialsSuccess ? (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                บันทึกแล้ว
              </p>
            ) : null}
            {testResult ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">{testResult}</p>
            ) : null}

            <Link
              href="/admin/ai/openrouter"
              className="inline-flex items-center gap-2 text-[#06C755] hover:underline text-sm"
            >
              ตั้งค่า OpenRouter routing / lock provider →
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
