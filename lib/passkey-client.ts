import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { ApiError, apiFetch } from "@/lib/api-client";
import { noteSignedIn } from "@/lib/auth";

type SessionFlags = {
  mustChangePassword: boolean;
  mustSetupPin: boolean;
  studentId?: string;
  nickname?: string;
  uid?: string;
};

function flagsFrom(data: Record<string, unknown>): SessionFlags {
  return {
    mustChangePassword: Boolean(data.mustChangePassword),
    mustSetupPin: Boolean(data.mustSetupPin),
    studentId: typeof data.studentId === "string" ? data.studentId : undefined,
    nickname: typeof data.nickname === "string" ? data.nickname : undefined,
    uid: typeof data.uid === "string" ? data.uid : undefined,
  };
}

export async function signInWithPasskey(studentId?: string): Promise<SessionFlags> {
  const started = await apiFetch<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"]; challengeKey: string }>(
    "/api/auth/passkey/login",
    { method: "POST", json: studentId ? { studentId } : {} }
  );
  const assertion = await startAuthentication({ optionsJSON: started.options });
  const verified = await apiFetch<Record<string, unknown>>("/api/auth/passkey/login", {
    method: "PUT",
    json: { challengeKey: started.challengeKey, response: assertion, studentId },
  });
  const session = await noteSignedIn();
  if (session.error) throw session.error;
  return flagsFrom(verified);
}

export async function registerPasskey(): Promise<void> {
  const started = await apiFetch<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"]; challengeKey: string }>(
    "/api/auth/passkey/register",
    { method: "POST", json: {} }
  );
  const credential = await startRegistration({ optionsJSON: started.options });
  await apiFetch("/api/auth/passkey/register", {
    method: "PUT",
    json: { challengeKey: started.challengeKey, response: credential },
  });
}

export async function getPasskeyStatus() {
  try {
    const data = await apiFetch<{ hasPasskey?: boolean; count?: number }>("/api/auth/passkey/register");
    return {
      hasPasskey: Boolean(data.hasPasskey),
      count: data.count ?? 0,
      latestDeviceLabel: data.hasPasskey ? "อุปกรณ์นี้" : undefined,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { hasPasskey: false, count: 0, latestDeviceLabel: undefined };
    }
    throw error;
  }
}

export async function deletePasskey() {
  await apiFetch("/api/auth/passkey/register", { method: "DELETE" });
  return { success: true };
}
