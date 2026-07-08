"use client";

import { useEffect, useState } from "react";
import type { WizardAdminInput } from "@/lib/setup/validations/wizard-admin";

export type AdminDraft = WizardAdminInput;

type StepSuperadminProps = {
  initial: AdminDraft;
  onChange: (draft: AdminDraft) => void;
  error?: string | null;
};

export function StepSuperadmin({ initial, onChange, error }: StepSuperadminProps) {
  const [draft, setDraft] = useState<AdminDraft>(initial);

  useEffect(() => {
    onChange(draft);
  }, [draft, onChange]);

  function update<K extends keyof AdminDraft>(key: K, value: AdminDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-text-primary">สร้างบัญชีผู้ดูแลระบบ</h2>

      <div>
        <label className="block text-sm font-medium mb-1">เลขแอดมิน (5 หลัก)</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          value={draft.studentId}
          onChange={(e) =>
            update("studentId", e.target.value.replace(/\D/g, "").slice(0, 5))
          }
          className="w-full px-4 py-3 rounded-xl border border-border-light font-mono text-lg tracking-widest"
          placeholder="12345"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">รหัสผ่าน</label>
        <input
          type="password"
          value={draft.password}
          onChange={(e) => update("password", e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-border-light"
          autoComplete="new-password"
        />
        <p className="text-xs text-text-tertiary mt-1">อย่างน้อย 7 ตัวอักษร</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">ยืนยันรหัสผ่าน</label>
        <input
          type="password"
          value={draft.confirmPassword}
          onChange={(e) => update("confirmPassword", e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-border-light"
          autoComplete="new-password"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">ชื่อ (ไม่บังคับ)</label>
          <input
            type="text"
            value={draft.firstName ?? ""}
            onChange={(e) => update("firstName", e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-border-light"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">นามสกุล (ไม่บังคับ)</label>
          <input
            type="text"
            value={draft.lastName ?? ""}
            onChange={(e) => update("lastName", e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-border-light"
          />
        </div>
      </div>

      <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg p-3">
        เก็บรหัสผ่านให้ดี — ใช้ล็อกอินครั้งแรกหลังตั้งค่าเสร็จ
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
