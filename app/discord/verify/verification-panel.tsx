"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, CircleAlert, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

type VerificationState = "loading" | "success" | "error" | "missing";

type VerifyResponse = {
  verified?: boolean;
  roleCount?: number;
  error?: string;
};

export function DiscordVerificationPanel() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";
  const { user, loading, authHydrating } = useAuth();
  const attemptedToken = useRef<string | null>(null);
  const [state, setState] = useState<VerificationState>(token ? "loading" : "missing");
  const [message, setMessage] = useState("");
  const [roleCount, setRoleCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    if (loading || authHydrating || !user || attemptedToken.current === token) return;

    attemptedToken.current = token;
    void fetch("/api/discord/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as VerifyResponse;
        if (!response.ok || !payload.verified) {
          throw new Error(payload.error || "ยืนยันบัญชี Discord ไม่สำเร็จ");
        }
        setRoleCount(payload.roleCount || 0);
        setState("success");
        // The link is single-use; do not leave its secret in browser history.
        window.history.replaceState({}, "", "/discord/verify");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "ยืนยันบัญชี Discord ไม่สำเร็จ");
        setState("error");
      });
  }, [authHydrating, loading, token, user]);

  const content =
    state === "success" ? (
      <>
        <BadgeCheck className="mx-auto h-12 w-12 text-line-green-cta" aria-hidden />
        <h1 className="mt-5 text-2xl font-semibold text-text-primary">เชื่อมต่อ Discord สำเร็จ</h1>
        <p className="mt-3 text-text-secondary">
          Found-U ส่งคำขอรับ Role แล้ว กรุณากลับไปที่ Discord — ปกติจะได้รับภายในไม่กี่วินาที
          {roleCount > 1 ? ` (${roleCount} Role)` : ""}
        </p>
        <p className="mt-2 text-sm text-text-tertiary">
          หากยังไม่เห็น Role ให้ใช้คำสั่ง <code>/sync</code> กับบอทในเซิร์ฟเวอร์
        </p>
      </>
    ) : state === "error" ? (
      <>
        <CircleAlert className="mx-auto h-12 w-12 text-red-500" aria-hidden />
        <h1 className="mt-5 text-2xl font-semibold text-text-primary">ยืนยันไม่สำเร็จ</h1>
        <p className="mt-3 text-text-secondary">{message}</p>
        <p className="mt-2 text-sm text-text-tertiary">
          กรุณาใช้คำสั่ง <code>/verify</code> ใน Discord เพื่อสร้างลิงก์ใหม่
        </p>
      </>
    ) : state === "missing" ? (
      <>
        <CircleAlert className="mx-auto h-12 w-12 text-amber-500" aria-hidden />
        <h1 className="mt-5 text-2xl font-semibold text-text-primary">ไม่พบลิงก์ยืนยัน</h1>
        <p className="mt-3 text-text-secondary">
          เริ่มต้นจากคำสั่ง <code>/verify</code> ของบอทใน Discord เพื่อรับลิงก์แบบใช้ครั้งเดียว
        </p>
      </>
    ) : (
      <>
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-line-green-cta" aria-hidden />
        <h1 className="mt-5 text-2xl font-semibold text-text-primary">กำลังยืนยันบัญชี</h1>
        <p className="mt-3 text-text-secondary">กำลังตรวจสอบสิทธิ์ Found-U และเชื่อมต่อกับ Discord...</p>
      </>
    );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg-secondary px-5 py-10">
      <section className="w-full max-w-lg rounded-3xl bg-bg-primary p-7 text-center shadow-sm ring-1 ring-black/5 sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-line-green-light text-line-green-link">
          <ShieldCheck className="h-7 w-7" aria-hidden />
        </div>
        <div className="mt-6">{content}</div>
        {(state === "success" || state === "error" || state === "missing") && (
          <Link
            href="/home"
            className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-bg-tertiary px-5 py-2.5 font-medium text-text-primary transition-colors hover:bg-bg-secondary"
          >
            กลับหน้า Found-U
          </Link>
        )}
      </section>
    </main>
  );
}
