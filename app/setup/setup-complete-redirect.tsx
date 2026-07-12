"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

export function SetupCompleteRedirect() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/auth/login?setup=done");
    }, 1500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-bg-primary rounded-2xl border border-border-light p-6 shadow-card text-center space-y-4">
        <CheckCircle2 className="w-12 h-12 text-line-green mx-auto" />
        <h1 className="text-xl font-bold">ตั้งค่าเสร็จสิ้น</h1>
        <p className="text-sm text-text-secondary flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          กำลังพาไปหน้าเข้าสู่ระบบ...
        </p>
      </div>
    </div>
  );
}
