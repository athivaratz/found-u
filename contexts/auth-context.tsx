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
import { getAuthSessionStatus, postStudentLogin } from "@/lib/student-auth-api";
import type { AppSettings, AppUser, BanStatus } from "@/lib/types";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";

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

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  appSettings: AppSettings;
  appSettingsReady: boolean;
  loading: boolean;
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
  signInWithStudentId: (studentId: string, password: string) => Promise<{ mustChangePassword: boolean; mustSetupPin: boolean }>;
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
    void auth.refreshLocal().then(() => {
      const localUser = auth.currentUser;
      const cached = readAuthBootstrapCache();
      if (!localUser || !cached || cached.uid !== localUser.id) return;

      bootstrapDoneRef.current = true;
      lastSyncedUserIdRef.current = cached.uid;
      setUser(localUser);
      setSessionFlags(cached.sessionFlags);
      setSessionReady(true);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    const clearSilentSyncTimer = () => {
      if (silentSyncTimerRef.current) {
        clearTimeout(silentSyncTimerRef.current);
        silentSyncTimerRef.current = null;
      }
    };

    const scheduleSilentSync = (uid: string) => {
      clearSilentSyncTimer();
      silentSyncTimerRef.current = setTimeout(() => {
        silentSyncTimerRef.current = null;
        if (isCancelled()) return;
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

    const blockingSync = async (sessionUser: User | null) => {
      if (isCancelled()) return;
      setUser(sessionUser);

      if (!sessionUser) {
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
      }

      const ok = await fetchAndApplySessionStatus(sessionUser.id, { force: blocking });
      if (!ok) {
        console.error("Session sync error");
        if (!isCancelled() && blocking) {
          setSessionFlags(EMPTY_SESSION_FLAGS);
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
    try {
      const result = await postStudentLogin(studentId, password);
      const uid = auth.currentUser?.id;
      try {
        if (uid) {
          const ok = await fetchAndApplySessionStatus(uid, { force: true });
          if (!ok) throw new Error("session status failed");
        } else {
          const status = await getAuthSessionStatus();
          applySessionStatus(status);
        }
      } catch {
        applySessionStatus({ mustSetupPin: result.mustSetupPin, hasPin: !result.mustSetupPin });
      }
      if (uid) {
        lastSyncedUserIdRef.current = uid;
      }
      bootstrapDoneRef.current = true;
      setSessionReady(true);
      setLoading(false);
      return {
        mustChangePassword: result.mustChangePassword,
        mustSetupPin: Boolean(result.mustSetupPin),
      };
    } finally {
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
