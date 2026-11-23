import { ApiError, apiFetch } from "@/lib/api-client";
import { noteSignedIn } from "@/lib/auth";
import type { AppUser } from "@/lib/types";
import { resolvePostLoginPath } from "@/lib/auth-routes";

export { resolvePostLoginPath };

type SessionPayload = {
  mustChangePassword: boolean;
  mustSetupPin?: boolean;
  studentId?: string;
  nickname?: string;
  uid?: string;
};

function flags(data: Record<string, unknown>): SessionPayload {
  return {
    mustChangePassword: Boolean(data.mustChangePassword),
    mustSetupPin: Boolean(data.mustSetupPin),
    studentId: typeof data.studentId === "string" ? data.studentId : undefined,
    nickname: typeof data.nickname === "string" ? data.nickname : undefined,
    uid: typeof data.uid === "string" ? data.uid : undefined,
  };
}

async function openSession(path: string, json: unknown, fallback: string): Promise<SessionPayload> {
  let data: Record<string, unknown>;
  try {
    data = await apiFetch<Record<string, unknown>>(path, { method: "POST", json });
  } catch (error) {
    if (error instanceof ApiError) {
      const wrapped = new Error(error.code || fallback) as Error & { needsRegistration?: boolean };
      wrapped.needsRegistration = Boolean(error.payload.needsRegistration);
      throw wrapped;
    }
    throw error;
  }
  if (typeof data.studentId === "string") {
    const { setRememberedDevice } = await import("@/lib/auth-device-memory");
    setRememberedDevice({
      studentId: data.studentId,
      nickname: typeof data.nickname === "string" ? data.nickname : undefined,
    });
  }
  const session = await noteSignedIn();
  if (session.error) throw session.error;
  return flags(data);
}

export async function postStudentLogin(studentId: string, password: string) {
  return openSession("/api/auth/login", { studentId, password }, "เข้าสู่ระบบไม่สำเร็จ");
}

export async function postPinLogin(studentId: string, pin: string) {
  return openSession("/api/auth/pin/login", { studentId, pin }, "เข้าสู่ระบบไม่สำเร็จ");
}

export async function postResetPasswordWithPin(studentId: string, pin: string, newPassword: string) {
  const data = await apiFetch<Record<string, unknown>>("/api/auth/reset-password-with-pin", {
    method: "POST",
    json: { studentId, pin, newPassword },
  });
  const session = await noteSignedIn();
  if (session.error) throw session.error;
  return { success: true, mustChangePassword: Boolean(data.mustChangePassword) };
}

export async function lookupRegistration(studentId: string) {
  return apiFetch<{
    found: boolean;
    canRegister?: boolean;
    alreadyRegistered?: boolean;
    message?: string;
    studentId?: string;
    firstName?: string;
    lastName?: string;
    gradeLevel?: string | null;
    roomNumber?: string | null;
    registrationToken?: string;
  }>(`/api/auth/register/lookup?studentId=${encodeURIComponent(studentId)}`);
}

export async function completeRegistration(input: {
  studentId: string;
  registrationToken: string;
  password: string;
  pin: string;
}) {
  return openSession("/api/auth/register/complete", input, "สมัครสมาชิกไม่สำเร็จ");
}

export async function postResetPassword(studentId: string, schoolPassword: string, newPassword: string) {
  const data = await apiFetch<Record<string, unknown>>("/api/auth/reset-password", {
    method: "POST",
    json: { studentId, schoolPassword, newPassword },
  });
  const session = await noteSignedIn();
  if (session.error) throw session.error;
  return { success: true, mustChangePassword: Boolean(data.mustChangePassword) };
}

export async function postChangePassword(currentPassword: string, newPassword: string) {
  return apiFetch("/api/auth/change-password", {
    method: "POST",
    json: { currentPassword, newPassword },
  });
}

export async function postVerifyPassword(password: string) {
  return apiFetch<{ success: boolean }>("/api/auth/verify-password", {
    method: "POST",
    json: { password },
  });
}

export async function postVerifyPin(pin: string) {
  return apiFetch<{ success: boolean }>("/api/auth/verify-pin", {
    method: "POST",
    json: { pin },
  });
}

export async function getAuthSessionStatus() {
  return apiFetch<{
    isAdmin: boolean;
    isStudentVerified: boolean;
    whitelisted?: boolean;
    mustChangePassword?: boolean;
    mustSetupPin?: boolean;
    hasPin?: boolean;
    studentId?: string | null;
    role?: string | null;
    profile?: AppUser | null;
  }>("/api/auth/session-status");
}

export async function getDeviceProfile(studentId: string) {
  return apiFetch<{
    exists: boolean;
    studentId?: string;
    nickname?: string;
    firstName?: string;
    hasLoggedInOnce?: boolean;
    hasPin?: boolean;
    quickUnlockAvailable?: boolean;
  }>(`/api/auth/device-profile?studentId=${encodeURIComponent(studentId)}`);
}

export async function postSetupPin(pin: string) {
  return apiFetch<{ success: boolean }>("/api/auth/pin/setup", {
    method: "POST",
    json: { pin },
  });
}

export async function getPasskeyStatus() {
  const { getPasskeyStatus: load } = await import("@/lib/passkey-client");
  return load();
}

export async function deletePasskey() {
  const { deletePasskey: remove } = await import("@/lib/passkey-client");
  return remove();
}

export async function postPasskeyLogin() {
  const { signInWithPasskey } = await import("@/lib/passkey-client");
  return signInWithPasskey();
}

export async function registerPasskey() {
  const { registerPasskey: enroll } = await import("@/lib/passkey-client");
  await enroll();
}
