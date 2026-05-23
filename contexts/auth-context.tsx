"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type User } from "firebase/auth";
import { onAuthChange, signInWithGoogle, signInWithStudentCustomToken, signOut } from "@/lib/auth";
import { subscribeToUser, subscribeToAppSettings, isUserBanned, getTimeoutRemaining } from "@/lib/firestore";
import { getAuthSessionStatus, postStudentLogin } from "@/lib/student-auth-api";
import type { AppUser, BanStatus, AppSettings } from "@/lib/types";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  appSettings: AppSettings;
  appSettingsReady: boolean;
  loading: boolean;
  isAuthActionLoading: boolean;
  isAdmin: boolean;
  isStudentVerified: boolean;
  hasSeenTutorial: boolean;
  mustChangePassword: boolean;
  isBanned: boolean;
  banStatus: BanStatus;
  banReason: string | undefined;
  timeoutRemaining: number;
  signIn: () => Promise<void>;
  signInWithStudentId: (studentId: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  signInWithCustomToken: (customToken: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [appSettingsReady, setAppSettingsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAuthActionLoading, setIsAuthActionLoading] = useState(false);
  const [sessionVerified, setSessionVerified] = useState(false);

  const refreshSession = async (firebaseUser?: User | null) => {
    const u = firebaseUser ?? user;
    if (!u) {
      setSessionVerified(false);
      return;
    }
    try {
      const token = await u.getIdToken();
      await getAuthSessionStatus(token);
      setSessionVerified(true);
    } catch {
      setSessionVerified(true);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          await getAuthSessionStatus(token);
          setSessionVerified(true);
        } catch (error) {
          console.error("Session sync error:", error);
          setSessionVerified(true);
        }
      } else {
        setAppUser(null);
        setSessionVerified(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setAppUser(null);
      return;
    }

    const unsubscribe = subscribeToUser(user.uid, (userData) => {
      setAppUser(userData);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    const unsubscribe = subscribeToAppSettings((settings) => {
      setAppSettings(settings);
      setAppSettingsReady(true);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    setIsAuthActionLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        const authError = error as { message?: string; code?: string };
        if (
          authError.message === "Sign-in already in progress" ||
          authError.code === "auth/popup-closed-by-user"
        ) {
          return;
        }
        throw error;
      }
      await refreshSession();
    } finally {
      setIsAuthActionLoading(false);
    }
  };

  const signInWithStudentId = async (studentId: string, password: string) => {
    setIsAuthActionLoading(true);
    try {
      const { customToken, mustChangePassword } = await postStudentLogin(studentId, password);
      const { error } = await signInWithStudentCustomToken(customToken);
      if (error) throw error;
      return { mustChangePassword };
    } finally {
      setIsAuthActionLoading(false);
    }
  };

  const signInWithCustomTokenHandler = async (customToken: string) => {
    setIsAuthActionLoading(true);
    try {
      const { error } = await signInWithStudentCustomToken(customToken);
      if (error) throw error;
    } finally {
      setIsAuthActionLoading(false);
    }
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

  const isAdmin = appUser?.role === "admin";
  const isStudentVerified =
    isAdmin || appUser?.isStudentVerified === true || !!appUser?.studentId;

  const isBanned = appUser ? isUserBanned(appUser) : false;
  const timeoutRemaining = appUser ? getTimeoutRemaining(appUser) : 0;
  const mustChangePassword = appUser?.mustChangePassword === true;

  return (
    <AuthContext.Provider
      value={{
        user,
        appUser,
        appSettings,
        appSettingsReady,
        loading,
        isAuthActionLoading,
        isAdmin,
        isStudentVerified,
        hasSeenTutorial: appUser?.hasSeenTutorial || false,
        mustChangePassword,
        isBanned,
        banStatus: appUser?.banStatus || "none",
        banReason: appUser?.banReason,
        timeoutRemaining,
        signIn,
        signInWithStudentId,
        signInWithCustomToken: signInWithCustomTokenHandler,
        logout,
        refreshSession,
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
