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
  const avatar =
    (user.user_metadata?.avatar_url as string | undefined) || "";
  const blockedGoogleAvatar =
    avatar.includes("lh3.googleusercontent.com") || avatar.includes(".googleusercontent.com");
  return Object.assign(user, {
    uid: user.id,
    displayName:
      (user.user_metadata?.display_name as string | undefined) ||
      (user.user_metadata?.full_name as string | undefined) ||
      "",
    photoURL: blockedGoogleAvatar ? "" : avatar,
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

  async refreshLocal() {
    const supabase = getClient();
    const { data: sessionData } = await supabase.auth.getSession();
    this._currentSession = sessionData.session;
    this._currentUser = toCompatUser(sessionData.session?.user ?? null, sessionData.session);
  }

  async refreshNetwork() {
    const supabase = getClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data: sessionData } = await supabase.auth.getSession();
    this._currentSession = sessionData.session;
    this._currentUser = toCompatUser(userData.user, sessionData.session);
  }

  async refresh() {
    await this.refreshLocal();
    await this.refreshNetwork();
  }

  setSession(session: Session | null) {
    this._currentSession = session;
    this._currentUser = toCompatUser(session?.user || null, session);
  }
}

export const auth = new AuthCompat();

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

export async function reloadCurrentUser(options?: {
  network?: boolean;
}): Promise<User | null> {
  if (options?.network === false) {
    await auth.refreshLocal();
  } else {
    await auth.refresh();
  }
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
