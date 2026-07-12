"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

type SetupStatusResponse = {
  databaseReady: boolean;
  setupCompleted: boolean;
  hydrationError?: string;
  hydrationReason?: string;
};

type SetupInitializingProps = {
  onReady: () => void;
  onCompleted: () => void;
};

export function SetupInitializing({ onReady, onCompleted }: SetupInitializingProps) {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const [status, setStatus] = useState<SetupStatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
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
  }, [onCompleted, onReady]);

  const reasonMessage =
    reason === "missing_env"
      ? "ยังไม่ได้ตั้งค่า Supabase / Postgres environment variables"
      : reason === "initializing"
        ? "กำลังเตรียมฐานข้อมูล..."
        : null;

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-bg-primary rounded-2xl border border-border-light p-6 shadow-card text-center space-y-6">
        <Loader2 className="w-10 h-10 text-line-green animate-spin mx-auto" />
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Found-U Setup</p>
          <h1 className="text-xl font-bold">กำลังเตรียมฐานข้อมูล</h1>
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
          </ul>
          {status?.hydrationError ? (
            <p className="mt-3 text-xs text-destructive">{status.hydrationError}</p>
          ) : null}
          {status?.hydrationReason === "missing_env" ? (
            <p className="mt-3 text-xs text-text-secondary">
              ตั้งค่า POSTGRES_URL_NON_POOLING และ Supabase keys แล้วรีสตาร์ทเซิร์ฟเวอร์
              หรือรัน <code className="rounded bg-bg-primary px-1">bun run db:push</code> สำหรับ
              local dev
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
