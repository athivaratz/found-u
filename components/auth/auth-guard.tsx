"use client";

import { useLayoutEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { LoadingModal } from "@/components/ui/loading-modal";
import { TutorialSystem } from "@/components/ui/tutorial-system";
import { StudentRegistrationModal } from "@/components/auth/student-registration-modal";
import { AUTH_ROUTES, isAuthPublicPath, isSetupPublicPath } from "@/lib/auth-routes";
import { isKnownRoute } from "@/lib/known-routes";

const PUBLIC_PATHS = ["/", "/banned"];

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    isAuthPublicPath(pathname) ||
    isSetupPublicPath(pathname) ||
    !isKnownRoute(pathname)
  );
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const {
    user,
    appUser,
    loading,
    sessionReady,
    isAuthActionLoading,
    isStudentVerified,
    isAdmin,
    hasSeenTutorial,
    mustChangePassword,
    mustSetupPin,
    isBanned,
  } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [tutorialDismissed, setTutorialDismissed] = useState(false);

  const showTutorial =
    !loading &&
    !!user &&
    isStudentVerified &&
    !hasSeenTutorial &&
    !isPublicPath(pathname) &&
    !tutorialDismissed;

  const isProtected = pathname.length > 0 && !isPublicPath(pathname);

  const needsStudentVerification =
    !!user &&
    !!appUser &&
    sessionReady &&
    !isBanned &&
    !mustChangePassword &&
    !mustSetupPin &&
    !isStudentVerified &&
    !isAdmin;

  // Redirect before paint to avoid stacking the previous page with /auth.
  useLayoutEffect(() => {
    if (user && pathname === "/") {
      router.replace("/home");
      return;
    }

    if (!user && isProtected) {
      router.replace(AUTH_ROUTES.hub);
      return;
    }

    if (loading) return;

    if (user && (pathname === AUTH_ROUTES.hub || pathname === AUTH_ROUTES.login)) {
      if (mustChangePassword) {
        router.replace(AUTH_ROUTES.changePassword);
      } else if (mustSetupPin) {
        router.replace(AUTH_ROUTES.setupPin);
      } else if (isStudentVerified || isAdmin) {
        router.replace("/home");
      }
      return;
    }

    if (user && mustChangePassword && pathname !== AUTH_ROUTES.changePassword) {
      router.replace(AUTH_ROUTES.changePassword);
      return;
    }

    if (user && mustSetupPin && !isAdmin && pathname !== AUTH_ROUTES.setupPin) {
      router.replace(AUTH_ROUTES.setupPin);
      return;
    }

    if (user && isBanned && pathname !== "/banned") {
      router.replace("/banned");
      return;
    }

    if (user && !isBanned && pathname === "/banned") {
      router.replace("/home");
    }
  }, [
    user,
    loading,
    pathname,
    router,
    isProtected,
    mustChangePassword,
    mustSetupPin,
    isStudentVerified,
    isAdmin,
    isBanned,
  ]);

  if (user && pathname === "/") {
    return null;
  }

  // Never keep rendering a protected page without a session (even while loading).
  if (isProtected && !user) {
    return null;
  }

  if (!loading && user && isBanned && pathname !== "/banned") {
    return null;
  }

  if (
    !loading &&
    user &&
    mustChangePassword &&
    pathname !== AUTH_ROUTES.changePassword
  ) {
    return null;
  }

  if (
    !loading &&
    user &&
    mustSetupPin &&
    !isAdmin &&
    pathname !== AUTH_ROUTES.setupPin
  ) {
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
          onComplete={() => setTutorialDismissed(true)}
        />
      )}
    </>
  );
}
