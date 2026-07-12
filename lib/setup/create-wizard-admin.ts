"use server";

import {
  ensureAuthUserForStudent,
  getStudentAccount,
  hashSecret,
  isValidSchoolPassword,
  isValidStudentId,
  normalizeStudentId,
  promoteAdminUser,
  studentIdToAuthEmail,
  syncAppUserFromStudent,
} from "@/lib/student-auth-server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SetupWizardAdminInput = {
  studentId: string;
  password: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
};

export async function createSetupWizardAdmin(
  input: SetupWizardAdminInput
): Promise<{ studentId: string; uid: string }> {
  const id = normalizeStudentId(input.studentId);
  if (!isValidStudentId(id)) {
    throw new Error("เลขประจำตัวไม่ถูกต้อง");
  }
  if (!isValidSchoolPassword(input.password)) {
    throw new Error("รหัสผ่านต้องเป็นตัวอักษรหรือตัวเลข 7–8 ตัว");
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("accounts")
    .select("id")
    .eq("student_id", id)
    .maybeSingle();

  if (existing) {
    throw new Error("เลขประจำตัวนี้มีในระบบแล้ว — ใช้เลขอื่น");
  }

  const firstName = input.firstName?.trim() || "Admin";
  const lastName = input.lastName?.trim() || "Found-U";
  const nickname = input.nickname?.trim() || "Admin";
  const displayName = `${firstName} ${lastName}`.trim();
  const passwordHash = hashSecret(input.password);
  const now = new Date().toISOString();

  const uid = await ensureAuthUserForStudent(id, displayName, input.password, {
    verifyPasswordLogin: false,
  });

  const { error: insertError } = await admin.from("accounts").insert({
    id: uid,
    student_id: id,
    linked_uid: uid,
    email: studentIdToAuthEmail(id),
    display_name: displayName,
    first_name: firstName,
    last_name: lastName,
    nickname,
    school_password_hash: passwordHash,
    current_password_hash: passwordHash,
    must_change_password: false,
    has_logged_in_once: false,
    status: "active",
    updated_at: now,
    created_at: now,
  });
  if (insertError) throw insertError;

  const account = await getStudentAccount(id);
  if (!account) throw new Error("สร้างบัญชีแอดมินไม่สำเร็จ");

  await syncAppUserFromStudent(uid, { ...account, linkedUid: uid });
  await promoteAdminUser(uid, studentIdToAuthEmail(id), displayName);
  await admin
    .from("accounts")
    .update({
      student_id: id,
      first_name: firstName,
      last_name: lastName,
      nickname,
      is_student_verified: true,
      updated_at: now,
    })
    .eq("id", uid);

  return { studentId: id, uid };
}
