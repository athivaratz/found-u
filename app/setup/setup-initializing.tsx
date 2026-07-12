"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

type SetupStatusResponse = {
  databaseReady: boolean;
  setupCompleted: boolean;
  reason?: string;
};

type SetupInitializingProps = {
  onReady: () => void;
  onCompleted: () => void;
  /** Skip polling and show a fixed reason (e.g. missing env from server) */
  initialReason?: "missing_env";
};

const MAX_POLLS = 45;

export function SetupInitializing({
  onReady,
  onCompleted,
  initialReason,
}: SetupInitializingProps) {
  const searchParams = useSearchParams();
  const reason = initialReason ?? searchParams.get("reason");
  const [status, setStatus] = useState<SetupStatusResponse | null>(
    initialReason === "missing_env"
      ? { databaseReady: false, setupCompleted: false, reason: "missing_env" }
      : null
  );
  const [pollCount, setPollCount] = useState(0);
  const [stopped, setStopped] = useState(initialReason === "missing_env");

  useEffect(() => {
    if (initialReason === "missing_env") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;

    async function poll() {
      if (polls >= MAX_POLLS) {
        if (!cancelled) setStopped(true);
        return;
      }
      polls += 1;
      if (!cancelled) setPollCount(polls);

      try {
        const res = await fetch("/api/setup/status", { cache: "no-store" });
        const data = (await res.json()) as SetupStatusResponse;
        if (cancelled) return;

        setStatus(data);

        if (data.setupCompleted) {
          onCompleted();
          return;
        }

        if (data.databaseReady) {
          onReady();
          return;
        }

        if (data.reason === "missing_env") {
          setStopped(true);
          return;
        }

        timer = setTimeout(poll, 2000);
      } catch {
        if (!cancelled) {
          timer = setTimeout(poll, 3000);
        }
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [initialReason, onCompleted, onReady]);

  const reasonMessage =
    reason === "missing_env" || status?.reason === "missing_env"
      ? "ยังไม่ได้ตั้งค่า Supabase / Postgres environment variables"
      : reason === "initializing"
        ? "กำลังเตรียมฐานข้อมูล..."
        : null;

  return (
    <div className="flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-bg-primary rounded-2xl border border-border-light p-6 shadow-card text-center space-y-6">
        {!stopped ? (
          <Loader2 className="w-10 h-10 text-line-green animate-spin mx-auto" aria-hidden />
        ) : null}
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Found-U Setup</p>
          <h1 className="text-xl font-bold">
            {stopped && (reason === "missing_env" || status?.reason === "missing_env")
              ? "ยังไม่ได้ตั้งค่า Environment"
              : "กำลังเตรียมฐานข้อมูล"}
          </h1>
          <p className="text-sm text-text-secondary">
            {reasonMessage ?? "กำลังเตรียมระบบและตรวจสอบฐานข้อมูล..."}
          </p>
        </div>

        <div className="rounded-xl border border-border-light bg-bg-secondary p-4 text-left text-sm">
          <p className="font-medium">สถานะ</p>
          <ul className="mt-2 space-y-1 text-text-secondary">
            <li>
              ฐานข้อมูล:{" "}
              <span className="text-text-primary">
                {status?.databaseReady ? "พร้อม" : "กำลังเตรียม..."}
              </span>
            </li>
            {!stopped ? (
              <li className="text-xs">ตรวจสอบครั้งที่ {pollCount}</li>
            ) : null}
          </ul>
          {stopped && (reason === "missing_env" || status?.reason === "missing_env") ? (
            <div className="mt-3 space-y-2 text-xs text-text-secondary">
              <p>
                ตั้งค่า <code className="rounded bg-bg-primary px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
                <code className="rounded bg-bg-primary px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,{" "}
                <code className="rounded bg-bg-primary px-1">SUPABASE_SERVICE_ROLE_KEY</code>, และ{" "}
                <code className="rounded bg-bg-primary px-1">POSTGRES_URL_NON_POOLING</code> ใน
                Vercel แล้ว redeploy (ดู README ใน repo)
              </p>
            </div>
          ) : null}
          {stopped && status?.reason !== "missing_env" ? (
            <p className="mt-3 text-xs text-destructive">
              ใช้เวลานานเกินไป — ตรวจสอบ env และลองรีเฟรชหน้านี้
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
