"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";
import { LoadingModal } from "@/components/ui/loading-modal";
import { TutorialSystem } from "@/components/ui/tutorial-system";
import { StudentRegistrationModal } from "@/components/auth/student-registration-modal";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/login/change-password",
  "/login/reset-password",
  "/banned",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/login");
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const {
    user,
    appUser,
    loading,
    isAuthActionLoading,
    isStudentVerified,
    isAdmin,
    hasSeenTutorial,
    mustChangePassword,
    isBanned,
  } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showTutorial, setShowTutorial] = useState(false);

  const needsStudentVerification =
    !!user && !isBanned && !mustChangePassword && !isStudentVerified && !isAdmin;

  useEffect(() => {
    if (loading) return;

    if (!user && !isPublicPath(pathname)) {
      router.push("/login");
      return;
    }

    if (user && pathname === "/") {
      router.push("/home");
      return;
    }

    if (user && pathname === "/login") {
      if (mustChangePassword) {
        router.push("/login/change-password");
      } else if (isStudentVerified || isAdmin) {
        router.push("/home");
      }
      return;
    }

    if (user && mustChangePassword && pathname !== "/login/change-password") {
      router.push("/login/change-password");
      return;
    }

    if (user && isBanned && pathname !== "/banned") {
      router.push("/banned");
      return;
    }

    if (user && !isBanned && pathname === "/banned") {
      router.push("/home");
    }
  }, [
    user,
    loading,
    pathname,
    router,
    mustChangePassword,
    isStudentVerified,
    isAdmin,
    isBanned,
  ]);

  useEffect(() => {
    if (
      !loading &&
      user &&
      isStudentVerified &&
      !hasSeenTutorial &&
      !PUBLIC_PATHS.includes(pathname)
    ) {
      setShowTutorial(true);
    }
  }, [loading, user, isStudentVerified, hasSeenTutorial, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-secondary">
        <div className="flex flex-col items-center">
          <Loader2 className="w-10 h-10 text-line-green animate-spin mb-4" />
          <p className="text-text-secondary">กำลังตรวจสอบสิทธิ์...</p>
        </div>
      </div>
    );
  }

  if (!user && !isPublicPath(pathname)) {
    return null;
  }

  if (user && pathname === "/") {
    return null;
  }

  if (user && isBanned && pathname !== "/banned") {
    return null;
  }

  if (user && mustChangePassword && pathname !== "/login/change-password") {
    return null;
  }

  return (
    <>
      {children}
      <LoadingModal isOpen={isAuthActionLoading} message="กำลังดำเนินการ..." />
      <StudentRegistrationModal open={needsStudentVerification} />

      {showTutorial && appUser && (
        <TutorialSystem
          isOpen={showTutorial}
          userId={appUser.uid}
          onComplete={() => setShowTutorial(false)}
        />
      )}
    </>
  );
}
