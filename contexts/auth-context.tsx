"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  auth,
  type AuthChangeEvent,
  type User,
  onAuthChange,
  reloadCurrentUser,
  signOut,
} from "@/lib/auth";
import {
  clearAuthBootstrapCache,
  readAuthBootstrapCache,
  writeAuthBootstrapCache,
} from "@/lib/auth-bootstrap-cache";
import { getTimeoutRemaining, isUserBanned } from "@/lib/database";
import {
  getAuthSessionStatus,
  postPasskeyLogin,
  postPinLogin,
  postStudentLogin,
} from "@/lib/student-auth-api";
import type { AppSettings, AppUser, BanStatus } from "@/lib/types";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import { hasSupabaseClientEnv } from "@/lib/setup/db-url";

const SILENT_SYNC_DEBOUNCE_MS = 400;
const SESSION_STATUS_CACHE_TTL_MS = 45_000;

type SessionStatusPayload = {
  mustSetupPin?: boolean;
  hasPin?: boolean;
  isAdmin?: boolean;
  isStudentVerified?: boolean;
  profile?: AppUser | null;
};

type SessionFlags = {
  mustSetupPin: boolean;
  hasPin: boolean;
  isAdmin: boolean;
  isStudentVerified: boolean;
};

type LoginResult = {
  mustChangePassword: boolean;
  mustSetupPin: boolean;
};

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  appSettings: AppSettings;
  appSettingsReady: boolean;
  loading: boolean;
  authHydrating: boolean;
  sessionReady: boolean;
  isAuthActionLoading: boolean;
  isAdmin: boolean;
  isStudentVerified: boolean;
  hasSeenTutorial: boolean;
  mustChangePassword: boolean;
  mustSetupPin: boolean;
  hasPin: boolean;
  isBanned: boolean;
  banStatus: BanStatus;
  banReason: string | undefined;
  timeoutRemaining: number;
  signInWithStudentId: (studentId: string, password: string) => Promise<LoginResult>;
  signInWithPin: (studentId: string, pin: string) => Promise<LoginResult>;
  signInWithPasskey: () => Promise<LoginResult>;
  signInWithCustomToken: (_customToken: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const EMPTY_SESSION_FLAGS: SessionFlags = {
  mustSetupPin: false,
  hasPin: false,
  isAdmin: false,
  isStudentVerified: false,
};

function readInitialBootstrapCache() {
  if (typeof window === "undefined") return null;
  return readAuthBootstrapCache();
}

function flagsFromStatus(status: SessionStatusPayload): SessionFlags {
  const hasPin = Boolean(status.hasPin);
  return {
    hasPin,
    mustSetupPin: Boolean(status.mustSetupPin) && !hasPin,
    isAdmin: Boolean(status.isAdmin),
    isStudentVerified: Boolean(status.isStudentVerified),
  };
}

function flagsFromLoginResponse(mustSetupPin?: boolean): SessionFlags {
  const needsPin = Boolean(mustSetupPin);
  return {
    hasPin: !needsPin,
    mustSetupPin: needsPin,
    isAdmin: false,
    isStudentVerified: false,
  };
}

function hasValidBootstrapForUser(uid: string): boolean {
  const cached = readAuthBootstrapCache();
  return Boolean(cached && cached.uid === uid);
}

function shouldSyncSilently(
  event: AuthChangeEvent,
  sessionUser: User,
  lastSyncedUid: string | null,
  bootstrapDone: boolean
): boolean {
  const sameUser = lastSyncedUid === sessionUser.id;

  if (event === "TOKEN_REFRESHED") {
    return bootstrapDone ? sameUser : true;
  }
  if (event === "USER_UPDATED") {
    return sameUser && bootstrapDone;
  }
  if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
    return sameUser && bootstrapDone;
  }
  return false;
}

function needsBlockingUi(
  sessionUser: User | null,
  bootstrapDone: boolean,
  lastSyncedUid: string | null
): boolean {
  if (!sessionUser) return false;
  if (
    hasValidBootstrapForUser(sessionUser.id) &&
    bootstrapDone &&
    lastSyncedUid === sessionUser.id
  ) {
    return false;
  }
  if (!bootstrapDone) return true;
  return lastSyncedUid !== sessionUser.id;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialCache = readInitialBootstrapCache();

  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [appSettingsReady, setAppSettingsReady] = useState(false);
  const [loading, setLoading] = useState(() => !initialCache);
  const [authHydrating, setAuthHydrating] = useState(
    () => typeof window !== "undefined"
  );
  const [sessionReady, setSessionReady] = useState(() => !!initialCache);
  const [isAuthActionLoading, setIsAuthActionLoading] = useState(false);
  const [sessionFlags, setSessionFlags] = useState<SessionFlags>(
    () => initialCache?.sessionFlags ?? EMPTY_SESSION_FLAGS
  );

  const bootstrapDoneRef = useRef(!!initialCache);
  const lastSyncedUserIdRef = useRef<string | null>(initialCache?.uid ?? null);
  const silentSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silentSyncInFlightRef = useRef(false);
  const sessionStatusCacheRef = useRef<{
    uid: string;
    fetchedAt: number;
    status: SessionStatusPayload;
  } | null>(null);
  const sessionFlagsRef = useRef(sessionFlags);
  sessionFlagsRef.current = sessionFlags;
  const signedInViaLoginRef = useRef(false);

  const persistBootstrap = (uid: string, flags: SessionFlags) => {
    writeAuthBootstrapCache({ uid, sessionFlags: flags, fetchedAt: Date.now() });
  };

  const applySessionStatus = (status: SessionStatusPayload) => {
    const flags = flagsFromStatus(status);
    setSessionFlags(flags);
    if (status.profile) {
      setAppUser(status.profile);
    }
    const uid = auth.currentUser?.id ?? user?.id ?? lastSyncedUserIdRef.current;
    if (uid) {
      persistBootstrap(uid, flags);
    }
  };

  const fetchAndApplySessionStatus = async (
    uid: string,
    options?: { force?: boolean }
  ): Promise<boolean> => {
    const force = options?.force ?? false;
    const cached = sessionStatusCacheRef.current;
    if (
      !force &&
      cached &&
      cached.uid === uid &&
      Date.now() - cached.fetchedAt < SESSION_STATUS_CACHE_TTL_MS
    ) {
      applySessionStatus(cached.status);
      return true;
    }

    try {
      const status = await getAuthSessionStatus();
      sessionStatusCacheRef.current = { uid, fetchedAt: Date.now(), status };
      applySessionStatus(status);
      return true;
    } catch {
      return false;
    }
  };

  const clearSilentSyncTimer = () => {
    if (silentSyncTimerRef.current) {
      clearTimeout(silentSyncTimerRef.current);
      silentSyncTimerRef.current = null;
    }
  };

  const scheduleSilentSyncRef = useRef<(uid: string) => void>(() => {});

  scheduleSilentSyncRef.current = (uid: string) => {
    clearSilentSyncTimer();
    silentSyncTimerRef.current = setTimeout(() => {
      silentSyncTimerRef.current = null;
      if (silentSyncInFlightRef.current) return;
      silentSyncInFlightRef.current = true;
      void fetchAndApplySessionStatus(uid)
        .catch(() => {
          // Keep existing flags on background failure.
        })
        .finally(() => {
          silentSyncInFlightRef.current = false;
        });
    }, SILENT_SYNC_DEBOUNCE_MS);
  };

  const finalizeLoginFromResponse = (payload: {
    mustChangePassword: boolean;
    mustSetupPin?: boolean;
  }): LoginResult => {
    const uid = auth.currentUser?.id;
    if (uid) {
      const flags = flagsFromLoginResponse(payload.mustSetupPin);
      setSessionFlags(flags);
      persistBootstrap(uid, flags);
      lastSyncedUserIdRef.current = uid;
    }
    bootstrapDoneRef.current = true;
    setSessionReady(true);
    setLoading(false);
    if (uid) {
      scheduleSilentSyncRef.current(uid);
    }
    return {
      mustChangePassword: payload.mustChangePassword,
      mustSetupPin: Boolean(payload.mustSetupPin),
    };
  };

  const refreshUserProfile = async () => {
    const uid = auth.currentUser?.id ?? user?.id;
    if (!uid) return;
    const { getUser } = await import("@/lib/database");
    const latest = await getUser(uid);
    if (latest) setAppUser(latest);
  };

  const refreshSession = async () => {
    const current = auth.currentUser ?? user;
    if (!current) return;
    await reloadCurrentUser();
    await refreshUserProfile();
    const ok = await fetchAndApplySessionStatus(current.id, { force: true });
    if (!ok) {
      console.error("Session refresh failed");
    }
  };

  useLayoutEffect(() => {
    if (!hasSupabaseClientEnv()) {
      setAuthHydrating(false);
      setLoading(false);
      setSessionReady(true);
      setAppSettingsReady(true);
      return;
    }

    void auth.refreshLocal().then(() => {
      const localUser = auth.currentUser;
      if (localUser) {
        setUser(localUser);
        const cached = readAuthBootstrapCache();
        if (cached && cached.uid === localUser.id) {
          bootstrapDoneRef.current = true;
          lastSyncedUserIdRef.current = cached.uid;
          setSessionFlags(cached.sessionFlags);
          setSessionReady(true);
          setLoading(false);
        }
      }
      setAuthHydrating(false);
    });
  }, []);

  useEffect(() => {
    if (!hasSupabaseClientEnv()) return;

    let cancelled = false;
    const isCancelled = () => cancelled;

    const scheduleSilentSync = (uid: string) => {
      scheduleSilentSyncRef.current(uid);
    };

    const blockingSync = async (sessionUser: User | null) => {
      if (isCancelled()) return;
      setUser(sessionUser);

      if (!sessionUser) {
        clearSilentSyncTimer();
        lastSyncedUserIdRef.current = null;
        sessionStatusCacheRef.current = null;
        clearAuthBootstrapCache();
        setAppUser(null);
        setSessionFlags(EMPTY_SESSION_FLAGS);
        setSessionReady(true);
        setLoading(false);
        bootstrapDoneRef.current = true;
        return;
      }

      const blocking = needsBlockingUi(
        sessionUser,
        bootstrapDoneRef.current,
        lastSyncedUserIdRef.current
      );

      if (blocking) {
        setLoading(true);
        setSessionReady(false);
      } else {
        setSessionReady(true);
        setLoading(false);
      }

      const ok = await fetchAndApplySessionStatus(sessionUser.id, { force: blocking });
      if (!ok) {
        console.error("Session sync error");
        if (!isCancelled() && blocking) {
          scheduleSilentSync(sessionUser.id);
        }
      }

      if (!isCancelled()) {
        lastSyncedUserIdRef.current = sessionUser.id;
        setSessionReady(true);
        if (blocking) {
          setLoading(false);
        }
        bootstrapDoneRef.current = true;
        persistBootstrap(sessionUser.id, sessionFlagsRef.current);
        if (!blocking || !ok) {
          scheduleSilentSync(sessionUser.id);
        }
      }
    };

    const handleAuthChange = async (
      sessionUser: User | null,
      event: AuthChangeEvent
    ) => {
      if (isCancelled()) return;

      if (!sessionUser) {
        clearSilentSyncTimer();
        await blockingSync(null);
        return;
      }

      if (signedInViaLoginRef.current && event === "SIGNED_IN") {
        setUser(sessionUser);
        scheduleSilentSync(sessionUser.id);
        return;
      }

      if (
        shouldSyncSilently(
          event,
          sessionUser,
          lastSyncedUserIdRef.current,
          bootstrapDoneRef.current
        )
      ) {
        setUser(sessionUser);
        if (bootstrapDoneRef.current) {
          scheduleSilentSync(sessionUser.id);
        }
        return;
      }

      clearSilentSyncTimer();
      await blockingSync(sessionUser);
    };

    const unsubscribe = onAuthChange((sessionUser, event) => {
      void handleAuthChange(sessionUser, event);
    });

    void reloadCurrentUser({ network: false }).then((existing) => {
      if (isCancelled() || existing) return;
      void blockingSync(null);
    });

    return () => {
      cancelled = true;
      clearSilentSyncTimer();
      unsubscribe();
    };
    // Auth listener is registered once on mount; deps are intentionally stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setAppUser(null);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void import("@/lib/database").then(({ subscribeToUser }) => {
      if (cancelled) return;
      unsubscribe = subscribeToUser(
        user.id,
        (userData) => setAppUser(userData),
        (error) => console.error("User listener error:", error)
      );
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!hasSupabaseClientEnv()) {
      setAppSettings(DEFAULT_APP_SETTINGS);
      setAppSettingsReady(true);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void import("@/lib/database").then(({ subscribeToAppSettings }) => {
      if (cancelled) return;
      unsubscribe = subscribeToAppSettings((settings) => {
        setAppSettings(settings);
        setAppSettingsReady(true);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const signInWithStudentId = async (studentId: string, password: string) => {
    setIsAuthActionLoading(true);
    signedInViaLoginRef.current = true;
    try {
      const result = await postStudentLogin(studentId, password);
      return finalizeLoginFromResponse(result);
    } finally {
      signedInViaLoginRef.current = false;
      setIsAuthActionLoading(false);
    }
  };

  const signInWithPin = async (studentId: string, pin: string) => {
    setIsAuthActionLoading(true);
    signedInViaLoginRef.current = true;
    try {
      const result = await postPinLogin(studentId, pin);
      return finalizeLoginFromResponse(result);
    } finally {
      signedInViaLoginRef.current = false;
      setIsAuthActionLoading(false);
    }
  };

  const signInWithPasskey = async () => {
    setIsAuthActionLoading(true);
    signedInViaLoginRef.current = true;
    try {
      const result = await postPasskeyLogin();
      return finalizeLoginFromResponse(result);
    } finally {
      signedInViaLoginRef.current = false;
      setIsAuthActionLoading(false);
    }
  };

  const signInWithCustomTokenHandler = async (_customToken: string) => {
    void _customToken;
    throw new Error("Custom token auth was removed. Use Supabase session tokens.");
  };

  const logout = async () => {
    setIsAuthActionLoading(true);
    try {
      const { error } = await signOut();
      if (error) throw error;
    } finally {
      setIsAuthActionLoading(false);
    }
  };

  const isAdmin = appUser?.role === "admin" || sessionFlags.isAdmin;
  const isStudentVerified =
    isAdmin ||
    appUser?.isStudentVerified === true ||
    !!appUser?.studentId ||
    sessionFlags.isStudentVerified;
  const isBanned = appUser ? isUserBanned(appUser) : false;
  const timeoutRemaining = appUser ? getTimeoutRemaining(appUser) : 0;
  const mustChangePassword = appUser?.mustChangePassword === true;
  const mustSetupPin =
    sessionReady &&
    !mustChangePassword &&
    !isAdmin &&
    sessionFlags.mustSetupPin;

  return (
    <AuthContext.Provider
      value={{
        user,
        appUser,
        appSettings,
        appSettingsReady,
        loading,
        authHydrating,
        sessionReady,
        isAuthActionLoading,
        isAdmin,
        isStudentVerified,
        hasSeenTutorial: appUser?.hasSeenTutorial || false,
        mustChangePassword,
        mustSetupPin,
        hasPin: sessionFlags.hasPin,
        isBanned,
        banStatus: appUser?.banStatus || "none",
        banReason: appUser?.banReason,
        timeoutRemaining,
        signInWithStudentId,
        signInWithPin,
        signInWithPasskey,
        signInWithCustomToken: signInWithCustomTokenHandler,
        logout,
        refreshSession,
        refreshUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
