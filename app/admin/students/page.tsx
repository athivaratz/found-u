"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  Upload,
  Loader2,
  Users,
  Shield,
  Trash2,
  Plus,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { StudentImportSummary } from "@/lib/types";

interface WhitelistEntry {
  id: string;
  email: string;
  note?: string;
}

interface Stats {
  totalStudents: number;
  loggedInCount: number;
  disabledCount: number;
  whitelist: WhitelistEntry[];
}

export default function AdminStudentsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [csvContent, setCsvContent] = useState("");
  const [preview, setPreview] = useState<
    { studentId: string; firstName: string; lastName: string; nickname: string }[]
  >([]);
  const [parseErrors, setParseErrors] = useState<{ line: number; message: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<StudentImportSummary | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminNote, setNewAdminNote] = useState("");
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
  }, [user]);

  const loadStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/whitelist", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
      setStats(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, [user, getToken]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvContent(text);
    setImportResult(null);
    await previewCsv(text);
  };

  const previewCsv = async (content: string) => {
    if (!user) return;
    setImporting(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/students/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ csvContent: content, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreview(data.rows || []);
      setParseErrors(data.parseErrors || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    if (!csvContent || !user) return;
    setImporting(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/students/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ csvContent, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setImportResult(data.summary);
      setParseErrors(data.summary?.errors || []);
      await loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const addWhitelist = async () => {
    if (!newAdminEmail.trim() || !user) return;
    setWhitelistLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/whitelist", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: newAdminEmail, note: newAdminNote }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "เพิ่มไม่สำเร็จ");
      }
      setNewAdminEmail("");
      setNewAdminNote("");
      await loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    } finally {
      setWhitelistLoading(false);
    }
  };

  const removeWhitelist = async (email: string) => {
    if (!user) return;
    setWhitelistLoading(true);
    try {
      const token = await getToken();
      await fetch(`/api/admin/whitelist?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadStats();
    } finally {
      setWhitelistLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#06C755]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-7 h-7 text-[#06C755]" />
          จัดการนักเรียน
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          อัปโหลด CSV บัญชีนักเรียน และจัดการ whitelist ผู้ดูแลระบบ
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-xl">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="นักเรียนในระบบ" value={stats?.totalStudents ?? 0} />
        <StatCard label="เคยเข้าสู่ระบบแล้ว" value={stats?.loggedInCount ?? 0} />
        <StatCard label="ปิดใช้งาน" value={stats?.disabledCount ?? 0} />
      </div>

      <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <FileSpreadsheet className="w-5 h-5" />
          นำเข้า CSV นักเรียน
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          รูปแบบ:{" "}
          <code className="bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">
            เลขประจำตัว:รหัสผ่าน:ชื่อ:นามสกุล:ชื่อเล่น
          </code>
        </p>

        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
          <Upload className="w-8 h-8 text-gray-400 mb-2" />
          <span className="text-sm text-gray-500">คลิกเพื่อเลือกไฟล์ CSV</span>
          <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
        </label>

        {preview.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ตัวอย่าง {preview.length} รายการ
            </p>
            <div className="max-h-48 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="text-left p-2">เลข 5 หลัก</th>
                    <th className="text-left p-2">ชื่อ</th>
                    <th className="text-left p-2">นามสกุล</th>
                    <th className="text-left p-2">ชื่อเล่น</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((row) => (
                    <tr key={row.studentId} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="p-2 font-mono">{row.studentId}</td>
                      <td className="p-2">{row.firstName}</td>
                      <td className="p-2">{row.lastName}</td>
                      <td className="p-2">{row.nickname}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {parseErrors.length > 0 && (
          <div className="mt-4 text-sm text-amber-700 dark:text-amber-300">
            {parseErrors.map((e) => (
              <p key={`${e.line}-${e.message}`}>
                แถว {e.line}: {e.message}
              </p>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleImport}
          disabled={!csvContent || importing || preview.length === 0}
          className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 bg-[#06C755] text-white rounded-xl font-medium disabled:opacity-50"
        >
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          นำเข้าข้อมูล
        </button>

        {importResult && (
          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">นำเข้าสำเร็จ</p>
              <p className="text-sm text-green-700 dark:text-green-300">
                สร้างใหม่ {importResult.created} · อัปเดต {importResult.updated} · ข้าม{" "}
                {importResult.skipped}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5" />
          Whitelist ผู้ดูแลระบบ (Google)
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          อีเมลที่ลงทะเบียนล่วงหน้าจะเข้าสู่ระบบด้วย Google โดยไม่ต้องกรอกเลขประจำตัว
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="email"
            placeholder="admin@school.ac.th"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
          />
          <input
            type="text"
            placeholder="หมายเหตุ (optional)"
            value={newAdminNote}
            onChange={(e) => setNewAdminNote(e.target.value)}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
          />
          <button
            type="button"
            onClick={addWhitelist}
            disabled={whitelistLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium"
          >
            {whitelistLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            เพิ่ม
          </button>
        </div>

        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {(stats?.whitelist ?? []).map((entry) => (
            <li key={entry.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{entry.email}</p>
                {entry.note && <p className="text-sm text-gray-500">{entry.note}</p>}
              </div>
              <button
                type="button"
                onClick={() => removeWhitelist(entry.email)}
                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {(stats?.whitelist ?? []).length === 0 && (
            <li className="py-4 text-sm text-gray-500 text-center">ยังไม่มีอีเมลใน whitelist</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
    </div>
  );
}
