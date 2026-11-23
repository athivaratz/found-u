import { ApiError, apiFetch } from "@/lib/api-client";
import { readAuthBootstrapCache } from "@/lib/auth-bootstrap-cache";
import type { AppUser } from "@/lib/types";

export type AuthChangeEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";

export type User = {
  id: string;
  uid: string;
  aud: "authenticated";
  role: "authenticated";
  email?: string;
  email_confirmed_at?: string;
  phone?: string;
  confirmed_at?: string;
  last_sign_in_at?: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities?: unknown[];
  created_at: string;
  updated_at?: string;
  is_anonymous?: boolean;
  displayName?: string;
  photoURL?: string;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
};

type AuthChangeCallback = (user: User | null, event: AuthChangeEvent) => void;

type SessionStatus = {
  isAdmin?: boolean;
  profile?: AppUser | null;
};

const listeners = new Set<AuthChangeCallback>();

function emit(event: AuthChangeEvent) {
  for (const listener of listeners) listener(auth.currentUser, event);
}

function userFromProfile(profile: Partial<AppUser> & { uid: string }): User {
  return {
    id: profile.uid,
    uid: profile.uid,
    aud: "authenticated",
    role: "authenticated",
    email: profile.email,
    app_metadata: {},
    user_metadata: { display_name: profile.displayName },
    created_at: profile.createdAt ? new Date(profile.createdAt).toISOString() : new Date(0).toISOString(),
    displayName: profile.displayName,
    photoURL: profile.photoURL,
    async getIdToken() {
      return "";
    },
  };
}

class AuthCompat {
  currentUser: User | null = null;
  private inflight: Promise<void> | null = null;

  async refreshLocal() {
    const cached = readAuthBootstrapCache();
    if (!cached) {
      this.currentUser = null;
      return;
    }
    this.currentUser = userFromProfile({ uid: cached.uid, email: "", displayName: "" });
  }

  async refreshNetwork() {
    try {
      const status = await apiFetch<SessionStatus>("/api/auth/session-status");
      const profile = status.profile;
      if (profile?.uid) {
        this.currentUser = userFromProfile(profile);
        return;
      }
      this.currentUser = null;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        this.currentUser = null;
        return;
      }
      throw error;
    }
  }

  async refresh() {
    if (!this.inflight) {
      this.inflight = this.refreshNetwork().finally(() => {
        this.inflight = null;
      });
    }
    await this.inflight;
  }
}

export const auth = new AuthCompat();

export async function noteSignedIn(): Promise<{ user: User | null; error: Error | null }> {
  try {
    await auth.refreshNetwork();
    if (!auth.currentUser) {
      return { user: null, error: new Error("เซิร์ฟเวอร์ไม่ได้เปิดเซสชัน") };
    }
    emit("SIGNED_IN");
    return { user: auth.currentUser, error: null };
  } catch (error) {
    return { user: null, error: error instanceof Error ? error : new Error("เข้าสู่ระบบไม่สำเร็จ") };
  }
}

export async function signInWithStudentCustomToken(customToken: string) {
  void customToken;
  return { user: null, error: new Error("Custom token auth is no longer supported") };
}

export async function signOut() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST", json: {} });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) {
      auth.currentUser = null;
      emit("SIGNED_OUT");
      return { error: error instanceof Error ? error : new Error("ออกจากระบบไม่สำเร็จ") };
    }
  }
  auth.currentUser = null;
  emit("SIGNED_OUT");
  return { error: null };
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

export async function reloadCurrentUser(options?: { network?: boolean }): Promise<User | null> {
  if (options?.network === false) {
    await auth.refreshLocal();
  } else {
    await auth.refresh();
  }
  return auth.currentUser;
}

export function onAuthChange(callback: AuthChangeCallback) {
  listeners.add(callback);
  void auth.refresh().then(() => {
    callback(auth.currentUser, "INITIAL_SESSION");
  });
  return () => {
    listeners.delete(callback);
  };
}

export async function getSessionToken(): Promise<string | null> {
  return null;
}
