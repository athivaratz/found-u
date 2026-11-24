"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api-client";

type Status = {
  php: { version: string; eol: string | null };
  extensions: Record<string, boolean>;
  database: { version: string; bytes: number | null; accepted: boolean };
  cron: { lastRun: string | null; busy: boolean };
  backup: { finished: boolean | null; at: string | null; bytes: number | null };
  migrations: { pending: string[] };
  disk: { bytes: number | null; partial: boolean };
  config: {
    turnstile: boolean;
    ai: boolean;
    r2: boolean;
    signupsEnabled: boolean;
  };
  errors: { recent: number };
};

function size(bytes: number | null): string {
  if (bytes === null) return "อ่านไม่ได้";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function when(value: string | null): string {
  if (!value) return "ยังไม่มี";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

export default function SystemStatusPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const body = await apiFetch<Status>("/api/admin/system-status");
    setStatus(body);
  }, []);

  useEffect(() => {
    let gone = false;
    load().catch((err: unknown) => {
      if (gone) return;
      setError(err instanceof ApiError ? "โหลดสถานะไม่ได้" : "โหลดสถานะไม่ได้");
    });
    return () => {
      gone = true;
    };
  }, [load]);

  async function runMigrations() {
    setBusy(true);
    setNote("");
    try {
      const result = await apiFetch<{ done: boolean; ran: number; pending: string[] }>(
        "/api/admin/system-status/migrations",
        { method: "POST", json: {} }
      );
      setNote(
        result.done
          ? "ไม่มีไฟล์ค้างแล้ว"
          : `ทำไป ${result.ran} คำสั่ง ยังเหลือ ${result.pending.length} ไฟล์ กดอีกครั้งได้`
      );
      await load();
    } catch {
      setNote("นำเข้าไม่สำเร็จในรอบนี้ ลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <p className="p-6 text-red-600">{error}</p>;
  }
  if (!status) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    ["PHP", status.php.version],
    ["ฐานข้อมูล", status.database.version || "อ่านไม่ได้"],
    ["ขนาดฐาน", size(status.database.bytes)],
    ["cron ล่าสุด", status.cron.busy ? "กำลังรัน" : when(status.cron.lastRun)],
    [
      "แบ็กอัป R2",
      status.backup.finished === null
        ? "ยังไม่มี"
        : `${status.backup.finished ? "เสร็จ" : "ยังไม่จบ"} ${when(status.backup.at)} ${size(status.backup.bytes)}`,
    ],
    ["ไฟล์ค้าง", status.migrations.pending.length === 0 ? "ไม่มี" : status.migrations.pending.join(", ")],
    ["พื้นที่ foundu", `${size(status.disk.bytes)}${status.disk.partial ? " (ยังนับไม่ครบ)" : ""}`],
    ["Turnstile", status.config.turnstile ? "ตั้งแล้ว" : "ยังไม่ตั้ง"],
    ["AI", status.config.ai ? "ตั้งแล้ว" : "ยังไม่ตั้ง"],
    ["R2", status.config.r2 ? "ตั้งแล้ว" : "ยังไม่ตั้ง"],
    ["รับสมัคร", status.config.signupsEnabled ? "เปิด" : "ปิดชั่วคราว"],
    ["ข้อผิดพลาดล่าสุด", String(status.errors.recent)],
  ];

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">สถานะระบบ</h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          ดูว่าเครื่องและฐานข้อมูลพร้อมไหม หน้านี้ไม่แสดงค่ารหัสหรือคีย์
        </p>
      </div>

      {status.php.eol ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {status.php.eol}
        </p>
      ) : null}
      {status.database.version && !status.database.accepted ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          รุ่นฐานข้อมูลนี้ต่ำกว่าที่แอปยอมรับ สุขภาพของ API จะตอบ 503
        </p>
      ) : null}

      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-gray-800">
            <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
            <dd className="mt-1 break-words font-medium text-gray-900 dark:text-white">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-gray-800">
        <h2 className="font-semibold text-gray-900 dark:text-white">ส่วนขยาย</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {Object.entries(status.extensions).map(([name, on]) => (
            <li
              key={name}
              className={
                on
                  ? "rounded-full bg-green-100 px-3 py-1 text-sm text-green-800"
                  : "rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-200"
              }
            >
              {name} {on ? "มี" : "ไม่มี"}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col items-start gap-3">
        <button
          type="button"
          onClick={() => void runMigrations()}
          disabled={busy}
          className="min-h-11 rounded-full bg-[#06C755] px-5 py-2 font-medium text-white disabled:opacity-60"
        >
          {busy ? "กำลังนำเข้า…" : "รันไมเกรชันที่ค้าง"}
        </button>
        {note ? <p className="text-sm text-gray-600 dark:text-gray-300">{note}</p> : null}
        <p className="text-sm text-gray-500 dark:text-gray-400">
          แต่ละครั้งทำงานไม่เกิน 30 วินาที ถ้ายังเหลือให้กดซ้ำ การปิดรับสมัครอยู่ที่ SIGNUPS_ENABLED ในไฟล์ตั้งค่า
        </p>
      </div>
    </div>
  );
}
