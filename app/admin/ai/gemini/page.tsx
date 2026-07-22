"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  RefreshCw,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Search,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { getAppSettingsWithMeta, updateAppSettings } from "@/lib/database";
import {
  pickSettingsKeys,
  GEMINI_PIPELINE_SETTING_KEYS,
} from "@/lib/admin/ai-settings-keys";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/types";

interface ModelInfo {
  name: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

function normalizeModelName(model: string) {
  return model.replace(/^models\//, "");
}

function parseNumber(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

const inputClass =
  "mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white";

export default function AdminGeminiPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadModels = async () => {
    setLoadingModels(true);
    setModelError(null);

    try {
      const response = await fetch("/api/ai/models");
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setModelError(
          (data && (data.error as string)) || "ไม่สามารถโหลดรายการโมเดลได้"
        );
        setLoadingModels(false);
        return;
      }

      const data = await response.json();
      setModels(data.models || []);
    } catch (error) {
      console.error("Error loading AI models:", error);
      setModelError("เกิดข้อผิดพลาดในการเรียกข้อมูลโมเดล");
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    getAppSettingsWithMeta()
      .then(({ settings: data, loadError }) => {
        if (mounted) {
          setSettings(data);
          if (loadError) {
            setSettingsLoadError(
              "โหลดการตั้งค่าจากฐานข้อมูลไม่สำเร็จ — กำลังแสดงค่าเริ่มต้น กรุณาตรวจสอบสิทธิ์หรือลองใหม่"
            );
          }
        }
      })
      .catch((error) => {
        console.error("Error loading settings:", error);
      })
      .finally(() => {
        if (mounted) setLoadingSettings(false);
      });

    loadModels();

    return () => {
      mounted = false;
    };
  }, []);

  const generateContentModels = useMemo(() => {
    const filtered = models.filter((model) =>
      (model.supportedGenerationMethods || []).includes("generateContent")
    );

    if (!searchTerm.trim()) return filtered;

    const term = searchTerm.toLowerCase();
    return filtered.filter((model) =>
      (model.displayName || model.name).toLowerCase().includes(term)
    );
  }, [models, searchTerm]);

  const isModelValid = (modelName?: string) => {
    if (!modelName) return false;
    if (loadingModels || models.length === 0) return true;
    return generateContentModels.some(
      (model) =>
        normalizeModelName(model.name) === normalizeModelName(modelName)
    );
  };

  const nerModelValid = isModelValid(settings.aiNerModel);
  const matchingModelValid = isModelValid(settings.aiMatchingModel);
  const visionModelValid = isModelValid(settings.aiVisionModel);
  const agentModelValid = isModelValid(settings.agentModel);

  const handleSave = async () => {
    if (!user?.uid) return;

    setSaving(true);
    try {
      await updateAppSettings(
        pickSettingsKeys(settings, GEMINI_PIPELINE_SETTING_KEYS),
        user.uid
      );
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving AI settings:", error);
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
              Gemini Settings
            </h1>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto space-y-6">
        <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                โมเดลที่ใช้ในระบบ
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                กำหนดโมเดล NER / Matching / Vision — ตั้ง API key ที่{" "}
                <Link
                  href="/admin/ai/settings?tab=gemini"
                  className="text-[#06C755] hover:underline"
                >
                  ตั้งค่า AI
                </Link>
              </p>
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

          {settingsLoadError ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {settingsLoadError}
            </div>
          ) : null}

          {showSuccess ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              บันทึกการตั้งค่าเรียบร้อยแล้ว
            </div>
          ) : null}

          <datalist id="ai-models">
            {generateContentModels.map((model) => (
              <option key={model.name} value={model.name} />
            ))}
          </datalist>

          <div className="grid gap-4 lg:grid-cols-2 mt-4">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  NER (สกัดข้อมูล)
                </h3>
                {!nerModelValid && settings.aiNerModel ? (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="w-3 h-3" />
                    ไม่อยู่ในรายการ generateContent
                  </span>
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Model name
                  </label>
                  <input
                    list="ai-models"
                    value={settings.aiNerModel || ""}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        aiNerModel: e.target.value,
                      }))
                    }
                    placeholder="gemini-1.5-flash"
                    className={inputClass}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Temperature
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      value={settings.aiNerTemperature ?? ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          aiNerTemperature: parseNumber(e.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Top P
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      value={settings.aiNerTopP ?? ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          aiNerTopP: parseNumber(e.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Max Tokens
                    </label>
                    <input
                      type="number"
                      min={64}
                      step={32}
                      value={settings.aiNerMaxOutputTokens ?? ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          aiNerMaxOutputTokens: parseNumber(e.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Matching (จับคู่)
                </h3>
                {!matchingModelValid && settings.aiMatchingModel ? (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="w-3 h-3" />
                    ไม่อยู่ในรายการ generateContent
                  </span>
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Model name
                  </label>
                  <input
                    list="ai-models"
                    value={settings.aiMatchingModel || ""}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        aiMatchingModel: e.target.value,
                      }))
                    }
                    placeholder="gemini-1.5-flash"
                    className={inputClass}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Temperature
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      value={settings.aiMatchingTemperature ?? ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          aiMatchingTemperature: parseNumber(e.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Top P
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      value={settings.aiMatchingTopP ?? ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          aiMatchingTopP: parseNumber(e.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Max Tokens
                    </label>
                    <input
                      type="number"
                      min={64}
                      step={32}
                      value={settings.aiMatchingMaxOutputTokens ?? ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          aiMatchingMaxOutputTokens: parseNumber(e.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Vision (รูปภาพ)
                </h3>
                {!visionModelValid && settings.aiVisionModel ? (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="w-3 h-3" />
                    ไม่อยู่ในรายการ generateContent
                  </span>
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Model name
                  </label>
                  <input
                    list="ai-models"
                    value={settings.aiVisionModel || ""}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        aiVisionModel: e.target.value,
                      }))
                    }
                    placeholder="gemini-1.5-flash"
                    className={inputClass}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    แนะนำโมเดลที่รองรับภาพ เช่น gemini-1.5-flash
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Temperature
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      value={settings.aiVisionTemperature ?? ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          aiVisionTemperature: parseNumber(e.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Top P
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      value={settings.aiVisionTopP ?? ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          aiVisionTopP: parseNumber(e.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Max Tokens
                    </label>
                    <input
                      type="number"
                      min={64}
                      step={32}
                      value={settings.aiVisionMaxOutputTokens ?? ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          aiVisionMaxOutputTokens: parseNumber(e.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Gemini Agent Model
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4">
            ตั้งค่าโมเดล Gemini สำหรับผู้ช่วย — provider และ context อยู่ที่{" "}
            <Link
              href="/admin/ai/settings"
              className="text-[#06C755] hover:underline"
            >
              ตั้งค่า AI
            </Link>
          </p>
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs text-gray-500">Gemini Agent Model</label>
              {!agentModelValid && settings.agentModel ? (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  ไม่อยู่ในรายการ
                </span>
              ) : null}
            </div>
            <input
              list="ai-models"
              value={settings.agentModel || ""}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, agentModel: e.target.value }))
              }
              placeholder="models/gemini-2.5-flash"
              className={inputClass}
            />
          </div>
        </div>

        <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                รายการโมเดลที่รองรับ generateContent
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                ดึงข้อมูลด้วย ModelService.ListModels เพื่อดูเมธอดที่รองรับ
              </p>
            </div>
            <button
              onClick={loadModels}
              disabled={loadingModels}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {loadingModels ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              รีเฟรช
            </button>
          </div>

          <div className="mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาโมเดล"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {modelError ? (
            <div className="mt-4 text-sm text-red-500">{modelError}</div>
          ) : null}

          <div className="mt-4 space-y-3">
            {loadingModels ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังโหลดรายการโมเดล
              </div>
            ) : generateContentModels.length === 0 ? (
              <div className="text-sm text-gray-500">ไม่พบรายการโมเดล</div>
            ) : (
              generateContentModels.map((model) => (
                <div
                  key={model.name}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {model.displayName || model.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {model.name}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(model.supportedGenerationMethods || []).map((method) => (
                        <span
                          key={method}
                          className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                        >
                          {method}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          aiNerModel: model.name,
                        }))
                      }
                      className="px-3 py-2 rounded-xl text-sm bg-[#06C755]/10 text-[#06C755] hover:bg-[#06C755]/20"
                    >
                      ใช้กับ NER
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          aiMatchingModel: model.name,
                        }))
                      }
                      className="px-3 py-2 rounded-xl text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                    >
                      ใช้กับ Matching
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          aiVisionModel: model.name,
                        }))
                      }
                      className="px-3 py-2 rounded-xl text-sm bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                    >
                      ใช้กับ Vision
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          agentModel: model.name,
                        }))
                      }
                      className="px-3 py-2 rounded-xl text-sm bg-violet-500/10 text-violet-600 hover:bg-violet-500/20"
                    >
                      ใช้กับ Agent
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
