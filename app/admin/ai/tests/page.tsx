"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Activity,
  Camera,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Zap,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileImage,
  Upload,
} from "lucide-react";
import CameraCapture from "@/components/ui/camera-capture";
import { useAuth } from "@/contexts/auth-context";
import {
  mapVisionToFoundForm,
  VISION_CATEGORY_LABELS,
  VISION_FIELD_LABELS,
  type VisionExtractedData,
} from "@/lib/vision";
import { cn } from "@/lib/utils";

type TestTab = "ner" | "vision";

interface PingResult {
  success: boolean;
  responseTime: number;
  timestamp: Date;
  message?: string;
  error?: string;
  jsonData?: unknown;
}

interface VisionTestResult {
  success: boolean;
  responseTime: number;
  timestamp: Date;
  error?: string;
  statusCode?: number;
  imagePreview: string;
  apiResponse?: unknown;
  data?: VisionExtractedData;
  formMapping?: ReturnType<typeof mapVisionToFoundForm>;
}

const FORM_FIELD_KEYS = [
  "itemName",
  "category",
  "color",
  "brand",
  "description",
] as const;

export default function AITestsPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TestTab>("ner");

  // --- NER test state ---
  const [isPinging, setIsPinging] = useState(false);
  const [nerResults, setNerResults] = useState<PingResult[]>([]);
  const [testText, setTestText] = useState(
    "ตามหาพวงกุญแจซันซู หายตอนวันสอบธรรมะ น่าจะแถวสนามกีฬากับสหกรณ์ ใครเจอเอามาฝากห้องปกครองรี1/11(3604)หน่อย"
  );

  // --- Vision test state ---
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [visionTestMode, setVisionTestMode] = useState(true);
  const [visionResults, setVisionResults] = useState<VisionTestResult[]>([]);
  const [visionQuota, setVisionQuota] = useState<unknown>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const [showJson, setShowJson] = useState<Record<string, boolean>>({});

  const loadVisionQuota = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const response = await fetch(`/api/vision?userId=${user.uid}`);
      if (response.ok) {
        setVisionQuota(await response.json());
      }
    } catch (error) {
      console.error("Error loading vision quota:", error);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (activeTab === "vision" && user?.uid) {
      void loadVisionQuota();
    }
  }, [activeTab, user?.uid, loadVisionQuota]);

  const pingAI = async () => {
    setIsPinging(true);
    const startTime = Date.now();

    try {
      const response = await fetch("/api/ner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testText, type: "lost" }),
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      if (response.ok) {
        const data = await response.json();
        setNerResults((prev) => [
          {
            success: true,
            responseTime,
            timestamp: new Date(),
            message: `Item: ${data.item || "N/A"} | Location: ${data.location || "N/A"} | Target: ${data.target || "N/A"}`,
            jsonData: data,
          },
          ...prev.slice(0, 9),
        ]);
      } else {
        const errorText = await response.text();
        setNerResults((prev) => [
          {
            success: false,
            responseTime,
            timestamp: new Date(),
            error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
          },
          ...prev.slice(0, 9),
        ]);
      }
    } catch (error) {
      const endTime = Date.now();
      setNerResults((prev) => [
        {
          success: false,
          responseTime: endTime - startTime,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : "Unknown error",
        },
        ...prev.slice(0, 9),
      ]);
    } finally {
      setIsPinging(false);
    }
  };

  const setImageFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleVisionFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFromFile(file);
  };

  const handleVisionCapture = (dataUrl: string) => {
    setImagePreview(dataUrl);
  };

  const runVisionAnalysis = async () => {
    if (!imagePreview) return;
    if (!user?.uid) return;

    setIsAnalyzing(true);
    const startTime = Date.now();

    try {
      const response = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: imagePreview,
          userId: user.uid,
          testMode: visionTestMode && isAdmin,
        }),
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      const apiResponse = await response.json();

      if (!response.ok) {
        setVisionResults((prev) => [
          {
            success: false,
            responseTime,
            timestamp: new Date(),
            statusCode: response.status,
            error:
              apiResponse.message ||
              apiResponse.error ||
              `HTTP ${response.status}`,
            imagePreview,
            apiResponse,
          },
          ...prev.slice(0, 9),
        ]);
      } else {
        setVisionResults((prev) => [
          {
            success: true,
            responseTime,
            timestamp: new Date(),
            statusCode: response.status,
            imagePreview,
            apiResponse,
            data: apiResponse.data,
            formMapping: apiResponse.formMapping,
          },
          ...prev.slice(0, 9),
        ]);
      }

      void loadVisionQuota();
    } catch (error) {
      const endTime = Date.now();
      setVisionResults((prev) => [
        {
          success: false,
          responseTime: endTime - startTime,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : "Unknown error",
          imagePreview,
        },
        ...prev.slice(0, 9),
      ]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleJson = (key: string) => {
    setShowJson((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getStats = (results: { success: boolean; responseTime: number }[]) => {
    const successful = results.filter((r) => r.success);
    return {
      total: results.length,
      successRate:
        results.length === 0
          ? 0
          : Math.round((successful.length / results.length) * 100),
      avgTime:
        successful.length === 0
          ? 0
          : Math.round(
              successful.reduce((sum, r) => sum + r.responseTime, 0) /
                successful.length
            ),
    };
  };

  const nerStats = getStats(nerResults);
  const visionStats = getStats(visionResults);

  const renderJsonBlock = (key: string, label: string, data: unknown) => {
    if (data == null) return null;
    return (
      <div className="mt-3 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleJson(key)}
          className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-medium bg-gray-50 dark:bg-gray-700/50 text-text-primary dark:text-white"
        >
          <span>{label}</span>
          {showJson[key] ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        {showJson[key] && (
          <pre className="p-3 text-xs overflow-auto max-h-80 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    );
  };

  const renderFormMappingTable = (
    mapping: ReturnType<typeof mapVisionToFoundForm> | undefined,
    data: VisionExtractedData | undefined
  ) => {
    const rows = FORM_FIELD_KEYS.map((key) => {
      const value = mapping?.[key] ?? "";
      const filled = Boolean(String(value).trim());
      let displayValue = String(value || "—");
      if (key === "category" && data?.category) {
        displayValue = `${data.category} (${VISION_CATEGORY_LABELS[data.category] || data.category})`;
      }
      return {
        key,
        label:
          key === "description"
            ? "รายละเอียด (description)"
            : VISION_FIELD_LABELS[key as keyof VisionExtractedData] || key,
        value: displayValue,
        filled,
      };
    });

    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-600">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">ฟิลด์ฟอร์ม</th>
              <th className="text-left px-3 py-2 font-medium">ค่าที่จะใส่</th>
              <th className="text-center px-3 py-2 font-medium w-20">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="border-t border-gray-100 dark:border-gray-700"
              >
                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                  {row.label}
                </td>
                <td className="px-3 py-2 text-text-primary dark:text-white break-all">
                  {row.value}
                </td>
                <td className="px-3 py-2 text-center">
                  {row.filled ? (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      มีค่า
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      ว่าง
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {data?.confidence && (
              <tr className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                  {VISION_FIELD_LABELS.confidence}
                </td>
                <td className="px-3 py-2 capitalize">{data.confidence}</td>
                <td className="px-3 py-2 text-center text-xs text-gray-400">
                  meta
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
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
            <Activity className="w-6 h-6 text-line-green" />
            <h1 className="text-lg font-semibold text-text-primary dark:text-white">
              AI Tests
            </h1>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-6">
        <div className="flex gap-2 p-1 bg-bg-primary dark:bg-gray-800 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab("ner")}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors",
              activeTab === "ner"
                ? "bg-blue-500 text-white"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            )}
          >
            NER (ข้อความ)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("vision")}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5",
              activeTab === "vision"
                ? "bg-[#06C755] text-white"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            )}
          >
            <Camera className="w-4 h-4" />
            Vision (ถ่ายรูป)
          </button>
        </div>

        {activeTab === "ner" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-bg-primary dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm">
                <div className="text-2xl font-bold text-text-primary dark:text-white">
                  {nerStats.total}
                </div>
                <div className="text-xs text-text-secondary dark:text-gray-400">
                  ทดสอบ
                </div>
              </div>
              <div className="bg-bg-primary dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm">
                <div className="text-2xl font-bold text-line-green">
                  {nerStats.successRate}%
                </div>
                <div className="text-xs text-text-secondary dark:text-gray-400">
                  สำเร็จ
                </div>
              </div>
              <div className="bg-bg-primary dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm">
                <div className="text-2xl font-bold text-blue-500">
                  {nerStats.avgTime}ms
                </div>
                <div className="text-xs text-text-secondary dark:text-gray-400">
                  เฉลี่ย
                </div>
              </div>
            </div>

            <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
              <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-2">
                ข้อความทดสอบ
              </label>
              <textarea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                rows={3}
                className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl resize-none text-text-primary dark:text-white focus:ring-2 focus:ring-line-green"
              />
            </div>

            <button
              onClick={pingAI}
              disabled={isPinging}
              className="w-full py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPinging ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  กำลังทดสอบ...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Ping NER
                </>
              )}
            </button>

            {nerResults.length > 0 && (
              <button
                onClick={() => setNerResults([])}
                className="w-full py-3 rounded-xl font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700"
              >
                <RefreshCw className="w-4 h-4 inline mr-2" />
                ล้างผลลัพธ์
              </button>
            )}

            {nerResults.map((result, index) => (
              <div
                key={`ner-${index}`}
                className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {result.success ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                    )}
                    <div>
                      <div className="text-sm font-medium text-text-primary dark:text-white">
                        {result.success ? "Success" : "Failed"}
                      </div>
                      <div className="text-xs text-text-secondary dark:text-gray-400 mt-1">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {result.responseTime}ms ·{" "}
                        {result.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {result.success ? result.message : result.error}
                </div>
                {renderJsonBlock(`ner-${index}`, "JSON Output", result.jsonData)}
              </div>
            ))}
          </>
        )}

        {activeTab === "vision" && (
          <>
            {authLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#06C755]" />
              </div>
            ) : !user ? (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 text-amber-800 dark:text-amber-200 text-sm">
                กรุณาเข้าสู่ระบบด้วยบัญชี Admin เพื่อทดสอบ Vision
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-bg-primary dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm">
                    <div className="text-2xl font-bold text-text-primary dark:text-white">
                      {visionStats.total}
                    </div>
                    <div className="text-xs text-text-secondary dark:text-gray-400">
                      ทดสอบ
                    </div>
                  </div>
                  <div className="bg-bg-primary dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm">
                    <div className="text-2xl font-bold text-[#06C755]">
                      {visionStats.successRate}%
                    </div>
                    <div className="text-xs text-text-secondary dark:text-gray-400">
                      สำเร็จ
                    </div>
                  </div>
                  <div className="bg-bg-primary dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm">
                    <div className="text-2xl font-bold text-blue-500">
                      {visionStats.avgTime}ms
                    </div>
                    <div className="text-xs text-text-secondary dark:text-gray-400">
                      เฉลี่ย
                    </div>
                  </div>
                </div>

                {visionQuota != null && (
                  <div className="bg-bg-primary dark:bg-gray-800 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-medium text-text-primary dark:text-white">
                      Quota ปัจจุบัน:{" "}
                    </span>
                    <code className="break-all">
                      {JSON.stringify(visionQuota)}
                    </code>
                  </div>
                )}

                <div className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold text-text-primary dark:text-white flex items-center gap-2">
                      <Camera className="w-5 h-5 text-[#06C755]" />
                      ถ่าย / อัปโหลดรูปทดสอบ
                    </h2>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center gap-1"
                    >
                      <Upload className="w-4 h-4" />
                      อัปโหลด
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleVisionFileSelect}
                    />
                  </div>

                  <CameraCapture
                    previewUrl={imagePreview}
                    onCapture={(dataUrl) => {
                      handleVisionCapture(dataUrl);
                    }}
                    onClear={() => {
                      setImagePreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    labels={{
                      start: "เปิดกล้อง",
                      capture: "ถ่ายรูป",
                      retake: "เลือกรูปใหม่",
                      unavailable: "ไม่พบกล้อง",
                      idle: "ยังไม่มีรูป",
                    }}
                  />

                  {isAdmin && (
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visionTestMode}
                        onChange={(e) => setVisionTestMode(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      โหมดทดสอบ Admin (ไม่นับ quota + แสดง JSON ละเอียด)
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={runVisionAnalysis}
                    disabled={!imagePreview || isAnalyzing}
                    className="w-full py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-500 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        กำลังวิเคราะห์...
                      </>
                    ) : (
                      <>
                        <FileImage className="w-5 h-5" />
                        วิเคราะห์ด้วย AI
                      </>
                    )}
                  </button>
                </div>

                {visionResults.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setVisionResults([])}
                    className="w-full py-3 rounded-xl font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700"
                  >
                    <RefreshCw className="w-4 h-4 inline mr-2" />
                    ล้างผลลัพธ์ Vision
                  </button>
                )}

                {visionResults.map((result, index) => {
                  const sectionKey = `vision-${index}`;
                  const api = result.apiResponse as Record<string, unknown> | undefined;

                  return (
                    <div
                      key={sectionKey}
                      className="bg-bg-primary dark:bg-gray-800 rounded-2xl p-4 shadow-sm"
                    >
                      <div className="flex gap-4">
                        {/* eslint-disable-next-line @next/next/no-img-element -- local test image preview */}
                        <img
                          src={result.imagePreview}
                          alt="Test"
                          className="w-24 h-24 rounded-xl object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            {result.success ? (
                              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                            )}
                            <div>
                              <div className="text-sm font-medium text-text-primary dark:text-white">
                                {result.success ? "วิเคราะห์สำเร็จ" : "วิเคราะห์ล้มเหลว"}
                                {result.statusCode != null && (
                                  <span className="ml-2 text-xs text-gray-400">
                                    HTTP {result.statusCode}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-text-secondary dark:text-gray-400 mt-1">
                                {result.responseTime}ms ·{" "}
                                {result.timestamp.toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                          {!result.success && result.error && (
                            <p className="mt-2 text-sm text-red-500">{result.error}</p>
                          )}
                        </div>
                      </div>

                      {result.success && (
                        <>
                          <p className="mt-3 text-sm font-medium text-text-primary dark:text-white">
                            การแมปไปฟอร์ม /found
                          </p>
                          {renderFormMappingTable(result.formMapping, result.data)}

                          <button
                            type="button"
                            onClick={() => toggleSection(`${sectionKey}-extracted`)}
                            className="mt-3 text-sm text-blue-500 flex items-center gap-1"
                          >
                            {expandedSections[`${sectionKey}-extracted`] ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                            ดูค่า AI แต่ละฟิลด์ (normalized)
                          </button>
                          {expandedSections[`${sectionKey}-extracted`] && result.data && (
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                              {(Object.keys(VISION_FIELD_LABELS) as (keyof VisionExtractedData)[]).map(
                                (field) => (
                                  <div
                                    key={field}
                                    className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                                  >
                                    <div className="text-xs text-gray-500">
                                      {VISION_FIELD_LABELS[field]}
                                    </div>
                                    <div className="font-medium text-text-primary dark:text-white break-all">
                                      {result.data?.[field] == null
                                        ? "null"
                                        : String(result.data[field])}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {renderJsonBlock(
                        `${sectionKey}-api`,
                        "JSON Output (API Response ทั้งก้อน)",
                        result.apiResponse
                      )}

                      {api?.debug != null &&
                        renderJsonBlock(
                          `${sectionKey}-raw-parsed`,
                          "Raw Parsed JSON (จากโมเดล)",
                          (api.debug as Record<string, unknown>).rawParsedJson
                        )}

                      {api?.debug != null &&
                        renderJsonBlock(
                          `${sectionKey}-raw-text`,
                          "Raw Model Text",
                          { text: (api.debug as Record<string, unknown>).rawModelText }
                        )}

                      {api?.debug != null &&
                        renderJsonBlock(
                          `${sectionKey}-gemini`,
                          "Gemini Response (เต็ม)",
                          (api.debug as Record<string, unknown>).geminiResponse
                        )}

                      {api?.meta != null &&
                        renderJsonBlock(`${sectionKey}-meta`, "Meta / Config", api.meta)}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
