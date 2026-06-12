import type { Session, SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { setClientSession } from "@/lib/supabase/auth-session";

export type User = SupabaseUser & {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
};

type AuthChangeCallback = (user: User | null) => void;

let supabaseClient: SupabaseClient | null = null;

function getClient() {
  if (!supabaseClient) {
    supabaseClient = createClient();
  }
  return supabaseClient;
}

function toCompatUser(user: SupabaseUser | null, session: Session | null): User | null {
  if (!user) return null;
  return Object.assign(user, {
    uid: user.id,
    displayName:
      (user.user_metadata?.display_name as string | undefined) ||
      (user.user_metadata?.full_name as string | undefined) ||
      "",
    photoURL:
      (user.user_metadata?.avatar_url as string | undefined) ||
      (user.identities?.find((identity) => identity.provider === "google")?.identity_data
        ?.avatar_url as string | undefined) ||
      "",
    async getIdToken(forceRefresh = false) {
      const supabase = getClient();
      if (forceRefresh) {
        await supabase.auth.refreshSession();
      }
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || session?.access_token || "";
    },
  });
}

class AuthCompat {
  private _currentUser: User | null = null;
  private _currentSession: Session | null = null;

  get currentUser() {
    return this._currentUser;
  }

  get currentSession() {
    return this._currentSession;
  }

  async refresh() {
    const supabase = getClient();
    const [{ data: sessionData }, { data: userData }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);
    this._currentSession = sessionData.session;
    this._currentUser = toCompatUser(userData.user, sessionData.session);
  }

  setSession(session: Session | null) {
    this._currentSession = session;
    this._currentUser = toCompatUser(session?.user || null, session);
  }
}

export const auth = new AuthCompat();

function getOAuthCallbackUrl(next = "/home", link = false): string {
  const base =
    (typeof window !== "undefined" ? window.location.origin : null) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const url = new URL("/auth/callback", base);
  url.searchParams.set("next", next);
  if (link) url.searchParams.set("link", "1");
  return url.toString();
}

export async function signInWithGoogle(next = "/home") {
  const supabase = getClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getOAuthCallbackUrl(next),
      queryParams: { prompt: "select_account" },
    },
  });

  if (!error && data.url && typeof window !== "undefined") {
    window.location.assign(data.url);
  }

  return { user: null, error };
}

export async function linkGoogleToCurrentUser(next = "/settings") {
  const token = await getSessionToken();
  if (!token) return { user: null, error: new Error("กรุณาเข้าสู่ระบบก่อน") };

  const supabase = getClient();
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: getOAuthCallbackUrl(next, true),
      queryParams: { prompt: "select_account" },
    },
  });

  if (error) return { user: null, error };
  if (data.url && typeof window !== "undefined") {
    window.location.assign(data.url);
  }
  return { user: null, error: null };
}

export async function unlinkGoogleFromCurrentUser() {
  const token = await getSessionToken();
  if (!token) return { user: null, error: new Error("กรุณาเข้าสู่ระบบก่อน") };
  const res = await fetch("/api/auth/disconnect-google", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) return { user: null, error: new Error(data.error || "ยกเลิกการเชื่อม Google ไม่สำเร็จ") };
  await auth.refresh();
  return { user: auth.currentUser, error: null };
}

export async function signInWithStudentSession(tokens: { access_token: string; refresh_token: string }) {
  try {
    const session = await setClientSession(tokens);
    auth.setSession(session);
    return { user: auth.currentUser, error: null as Error | null };
  } catch (error) {
    return { user: null, error: error as Error };
  }
}

export async function signInWithStudentCustomToken(customToken: string) {
  void customToken;
  return { user: null, error: new Error("Custom token auth is no longer supported") };
}

export async function signOut() {
  const supabase = getClient();
  const { error } = await supabase.auth.signOut();
  auth.setSession(null);
  return { error: error ?? null };
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

export async function reloadCurrentUser(): Promise<User | null> {
  await auth.refresh();
  return auth.currentUser;
}

export function onAuthChange(callback: AuthChangeCallback) {
  const supabase = getClient();
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    auth.setSession(session);
    callback(auth.currentUser);
  });
  return () => subscription.unsubscribe();
}

export async function getSessionToken(): Promise<string | null> {
  const supabase = getClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}
