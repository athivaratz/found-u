"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { AUTH_ROUTES } from "@/lib/auth-routes";

interface StudentRegistrationModalProps {
  open: boolean;
}

export function StudentRegistrationModal({ open }: StudentRegistrationModalProps) {
  const router = useRouter();
  const { user } = useAuth();

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 overlay-modal overlay-modal-top flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm z-[100]">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
        <GraduationCap className="w-10 h-10 text-[#06C755] mx-auto mb-3" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center">
          ยืนยันบัญชีนักเรียน
        </h2>
        <p className="text-sm text-gray-500 text-center mt-2 mb-6">
          บัญชีของคุณยังไม่ได้ยืนยัน กรุณาสมัครหรือเชื่อมบัญชีนักเรียนเพื่อใช้งานต่อ
        </p>
        <Link
          href={AUTH_ROUTES.register}
          className="block w-full py-3 bg-[#06C755] text-white rounded-xl font-semibold text-center hover:bg-[#05a847] transition-colors"
        >
          ไปหน้าสมัครสมาชิก
        </Link>
        <button
          type="button"
          onClick={() => router.replace(AUTH_ROUTES.login)}
          className="w-full mt-3 py-3 rounded-xl border border-border-light font-medium text-text-secondary hover:bg-bg-secondary transition-colors"
        >
          เข้าสู่ระบบด้วยบัญชีอื่น
        </button>
      </div>
    </div>
  );
}
