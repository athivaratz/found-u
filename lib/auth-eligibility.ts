import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail, studentIdToAuthEmail } from "@/lib/student-auth-server";

export type AuthEligibilityMode = "secondary" | "google_sign_in";

export type AuthEligibilityResult =
  | { eligible: true; studentId: string }
  | { eligible: false; message: string };

/**
 * Secondary auth (Google sign-in, Passkey, PIN) requires a prior password login
 * and an established link between student_accounts and auth.users.
 */
export async function checkAuthEligibility(
  userId: string,
  mode: AuthEligibilityMode = "secondary",
  googleEmail?: string | null
): Promise<AuthEligibilityResult> {
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("student_accounts")
    .select("student_id, linked_uid, linked_google_email, has_logged_in_once, status")
    .eq("linked_uid", userId)
    .maybeSingle();

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

  if (mode === "google_sign_in") {
    if (!account.linked_google_email) {
      return {
        eligible: false,
        message: "กรุณาเชื่อมบัญชี Google ในการตั้งค่าก่อน",
      };
    }
    if (googleEmail && normalizeEmail(account.linked_google_email) !== normalizeEmail(googleEmail)) {
      return {
        eligible: false,
        message: "บัญชี Google ไม่ตรงกับที่เชื่อมไว้",
      };
    }
  }

  return { eligible: true, studentId: account.student_id };
}

export async function checkStudentIdEligibleForSecondaryAuth(
  studentId: string
): Promise<AuthEligibilityResult> {
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("student_accounts")
    .select("student_id, linked_uid, has_logged_in_once, status")
    .eq("student_id", studentId)
    .maybeSingle();

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

  return { eligible: true, studentId: account.student_id };
}

export function getGoogleEmailFromUser(user: {
  email?: string | null;
  identities?: { provider?: string; identity_data?: Record<string, unknown> }[] | null;
}): string | null {
  const googleIdentity = user.identities?.find((identity) => identity.provider === "google");
  const fromIdentity = googleIdentity?.identity_data?.email;
  if (typeof fromIdentity === "string" && fromIdentity.trim()) {
    return normalizeEmail(fromIdentity);
  }
  if (user.email && !user.email.includes("@students.")) {
    return normalizeEmail(user.email);
  }
  return null;
}

export async function revokeIneligibleOAuthUser(userId: string, email?: string | null): Promise<void> {
  const admin = createAdminClient();
  await admin.auth.admin.signOut(userId, "global");

  const syntheticEmail = email && email.includes("@students.") ? normalizeEmail(email) : null;
  const googleEmail = email && !syntheticEmail ? normalizeEmail(email) : null;

  if (googleEmail) {
    const { data: orphan } = await admin
      .from("student_accounts")
      .select("student_id")
      .eq("linked_uid", userId)
      .maybeSingle();
    if (!orphan) {
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // User may already be removed
      }
    }
  }
}

export function studentAuthEmailForId(studentId: string): string {
  return studentIdToAuthEmail(studentId);
}
