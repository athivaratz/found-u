import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail, studentIdToAuthEmail } from "@/lib/student-auth-server";

export type AuthEligibilityMode = "secondary";

export type AuthEligibilityResult =
  | { eligible: true; studentId: string }
  | { eligible: false; message: string };

/**
 * Secondary auth (Passkey, PIN) requires a prior password login
 * and an established link between accounts and auth.users.
 */
export async function checkAuthEligibility(
  userId: string,
  mode: AuthEligibilityMode = "secondary",
  secondaryIdentity?: string | null
): Promise<AuthEligibilityResult> {
  const admin = createAdminClient();
  const { data: account, error } = await admin
    .from("accounts")
    .select("student_id, linked_uid, has_logged_in_once, status")
    .or(`linked_uid.eq.${userId},id.eq.${userId}`)
    .maybeSingle();

  if (error) {
    console.error("checkAuthEligibility query failed:", error);
    throw error;
  }

  if (!account) {
    return {
      eligible: false,
      message: "กรุณาเข้าสู่ระบบด้วยเลขประจำตัวและรหัสผ่านก่อน แล้วจึงใช้วิธีอื่นได้",
    };
  }

  if (account.status === "disabled") {
    return { eligible: false, message: "บัญชีนี้ถูกปิดใช้งาน" };
  }

  if (!account.has_logged_in_once) {
    return {
      eligible: false,
      message: "กรุณาเข้าสู่ระบบด้วยรหัสผ่านอย่างน้อยหนึ่งครั้งก่อนใช้วิธีอื่น",
    };
  }
  if (!account.student_id) {
    return {
      eligible: false,
      message: "ไม่พบเลขประจำตัวในระบบ",
    };
  }

  void mode;
  void secondaryIdentity;

  return { eligible: true, studentId: account.student_id };
}

export async function checkStudentIdEligibleForSecondaryAuth(
  studentId: string
): Promise<AuthEligibilityResult> {
  const admin = createAdminClient();
  const { data: account, error } = await admin
    .from("accounts")
    .select("student_id, linked_uid, has_logged_in_once, status")
    .eq("student_id", studentId)
    .maybeSingle();

  if (error) {
    console.error("checkStudentIdEligibleForSecondaryAuth query failed:", error);
    throw error;
  }

  if (!account) {
    return { eligible: false, message: "ไม่พบเลขประจำตัวในระบบ" };
  }
  if (account.status === "disabled") {
    return { eligible: false, message: "บัญชีนี้ถูกปิดใช้งาน" };
  }
  if (!account.has_logged_in_once || !account.linked_uid) {
    return {
      eligible: false,
      message: "กรุณาเข้าสู่ระบบด้วยรหัสผ่านก่อนใช้วิธีอื่น",
    };
  }
  if (!account.student_id) {
    return { eligible: false, message: "ไม่พบเลขประจำตัวในระบบ" };
  }

  return { eligible: true, studentId: account.student_id };
}

export async function revokeIneligibleOAuthUser(userId: string, email?: string | null): Promise<void> {
  const admin = createAdminClient();
  await admin.auth.admin.signOut(userId, "global");

  const syntheticEmail = email && email.includes("@students.") ? normalizeEmail(email) : null;
  if (!syntheticEmail) return;
}

export function studentAuthEmailForId(studentId: string): string {
  return studentIdToAuthEmail(studentId);
}
