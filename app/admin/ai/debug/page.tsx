"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bug,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  RefreshCw,
} from "lucide-react";

type LogRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  provider: string;
  model: string | null;
  truncated: boolean;
  finish_reason: string | null;
  duration_ms: number | null;
  steps: unknown;
  created_at: string;
};

type LogDetail = LogRow & {
  settings_snapshot: unknown;
  routing: unknown;
  request_messages: unknown;
  response_parts: unknown;
  error: string | null;
};

export default function AdminAgentDebugPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncatedOnly, setTruncatedOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const q = truncatedOnly ? "?truncated=1" : "";
      const res = await fetch(`/api/admin/agent-logs${q}`);
      const data = await res.json();
      if (!res.ok) {
        setLogs([]);
        setLoadError(data.error ?? `โหลดไม่สำเร็จ (${res.status})`);
        return;
      }
      setLogs(data.logs ?? []);
    } catch {
      setLogs([]);
      setLoadError("ไม่สามารถเชื่อมต่อ API ได้");
    } finally {
      setLoading(false);
    }
  }, [truncatedOnly]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const loadDetail = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/agent-logs/${id}`);
      const data = await res.json();
      setDetail(data.log ?? null);
    } finally {
      setDetailLoading(false);
    }
  };

  const copyJson = async (value: unknown) => {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
  };

  return (
    <div className="min-h-screen bg-bg-secondary dark:bg-gray-900">
      <header className="bg-bg-primary dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin/ai" className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <Bug className="w-6 h-6 text-violet-500" />
            <h1 className="text-lg font-semibold">Agent Debug Log</h1>
          </div>
          <button
            type="button"
            onClick={() => void loadLogs()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            รีเฟรช
          </button>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto space-y-4">
        <p className="text-sm text-gray-500">
          Raw request/response ย้อนหลัง 7 วัน — ใช้ตรวจ truncation หลัง tool calls
        </p>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={truncatedOnly}
            onChange={(e) => setTruncatedOnly(e.target.checked)}
          />
          แสดงเฉพาะที่ truncated
        </label>

        {loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800/40 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {loadError}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            กำลังโหลด...
          </div>
        ) : logs.length === 0 && !loadError ? (
          <p className="text-sm text-gray-500">
            ยังไม่มี log — ลองแชทใน /assistant แล้วกดรีเฟรช (log เก่าก่อนสร้างตารางจะไม่ถูกบันทึก)
          </p>
        ) : (
          <ul className="space-y-2">
            {logs.map((log) => (
              <li
                key={log.id}
                className="bg-bg-primary dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => void loadDetail(log.id)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700/40"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {new Date(log.created_at).toLocaleString("th-TH")}
                      {log.truncated ? (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          truncated
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {log.provider} · {log.model ?? "-"} · session{" "}
                      {log.session_id?.slice(0, 8) ?? "-"} · {log.duration_ms ?? 0}ms
                    </div>
                  </div>
                  {expandedId === log.id ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                {expandedId === log.id ? (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
                    {detailLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin my-4" />
                    ) : detail ? (
                      <div className="space-y-3 mt-3">
                        {(
                          [
                            ["Steps", detail.steps],
                            ["Request messages", detail.request_messages],
                            ["Response parts", detail.response_parts],
                            ["Settings", detail.settings_snapshot],
                            ["Routing", detail.routing],
                          ] as const
                        ).map(([label, value]) => (
                          <div key={String(label)}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-gray-500">
                                {label}
                              </span>
                              <button
                                type="button"
                                onClick={() => void copyJson(value)}
                                className="text-xs text-[#06C755] inline-flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" />
                                Copy JSON
                              </button>
                            </div>
                            <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-xl overflow-x-auto max-h-64">
                              {JSON.stringify(value, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
