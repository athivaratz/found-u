"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  auth,
  type User,
  onAuthChange,
  reloadCurrentUser,
  signOut,
} from "@/lib/auth";
import { getTimeoutRemaining, isUserBanned } from "@/lib/database";
import { getAuthSessionStatus, postStudentLogin } from "@/lib/student-auth-api";
import type { AppSettings, AppUser, BanStatus } from "@/lib/types";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import { deferAfterFirstPaint } from "@/lib/bfcache";
import { clearAgentMessagesForUser } from "@/lib/agent/storage-keys";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [appSettingsReady, setAppSettingsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthActionLoading, setIsAuthActionLoading] = useState(false);
  const [sessionFlags, setSessionFlags] = useState({
    mustSetupPin: false,
    hasPin: false,
    isAdmin: false,
    isStudentVerified: false,
  });

  const applySessionStatus = (status: {
    mustSetupPin?: boolean;
    hasPin?: boolean;
    isAdmin?: boolean;
    isStudentVerified?: boolean;
    profile?: AppUser | null;
  }) => {
    const hasPin = Boolean(status.hasPin);
    setSessionFlags({
      hasPin,
      mustSetupPin: Boolean(status.mustSetupPin) && !hasPin,
      isAdmin: Boolean(status.isAdmin),
      isStudentVerified: Boolean(status.isStudentVerified),
    });
    if (status.profile) {
      setAppUser(status.profile);
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
    setSessionReady(false);
    await reloadCurrentUser();
    await refreshUserProfile();
    try {
      const status = await getAuthSessionStatus();
      applySessionStatus(status);
    } catch {
      setSessionFlags({ mustSetupPin: false, hasPin: false, isAdmin: false, isStudentVerified: false });
    } finally {
      setSessionReady(true);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const syncSessionForUser = async (sessionUser: User | null) => {
      if (cancelled) return;
      setUser(sessionUser);

      if (!sessionUser) {
        setAppUser(null);
        setSessionFlags({ mustSetupPin: false, hasPin: false, isAdmin: false, isStudentVerified: false });
        setSessionReady(true);
        setLoading(false);
        return;
      }

      setSessionReady(false);
      try {
        const status = await getAuthSessionStatus();
        if (!cancelled) applySessionStatus(status);
      } catch (error) {
        console.error("Session sync error:", error);
        if (!cancelled) setSessionFlags({ mustSetupPin: false, hasPin: false, isAdmin: false, isStudentVerified: false });
      } finally {
        if (!cancelled) {
          setSessionReady(true);
          setLoading(false);
        }
      }
    };

    const unsubscribe = onAuthChange((sessionUser) => {
      void syncSessionForUser(sessionUser);
    });

    void reloadCurrentUser({ network: false }).then((existing) => {
      if (cancelled || existing) return;
      void syncSessionForUser(null);
    });

    deferAfterFirstPaint(() => {
      void auth.refreshNetwork();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
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
      try {
        const status = await getAuthSessionStatus();
        applySessionStatus(status);
      } catch {
        applySessionStatus({ mustSetupPin: result.mustSetupPin, hasPin: !result.mustSetupPin });
      }
      setSessionReady(true);
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
      const uid = user?.id;
      if (uid) clearAgentMessagesForUser(uid);
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
  const authLoading = loading || (!!user && !sessionReady);

  return (
    <AuthContext.Provider
      value={{
        user,
        appUser,
        appSettings,
        appSettingsReady,
        loading: authLoading,
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
