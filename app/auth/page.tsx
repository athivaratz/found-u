"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Shield } from "lucide-react";
import { AuthCard, AuthCardHeader, AuthShell } from "@/components/auth/auth-shell";
import {
  authFieldStackClass,
  authPrimaryButtonClass,
  authSecondaryButtonClass,
} from "@/components/auth/auth-ui";
import { AUTH_ROUTES } from "@/lib/auth-routes";
import { AUTH_COPY } from "@/lib/auth-copy";
import { isAllowedReturnPath } from "@/lib/auth-return-to";
import { AuthLoadingScreen } from "@/components/auth/auth-loading-screen";

export default function AuthHubPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <AuthHubPageContent />
    </Suspense>
  );
}

function AuthHubPageContent() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const destination = returnTo && isAllowedReturnPath(returnTo) ? returnTo : null;
  const withReturnTo = (path: string) =>
    destination ? `${path}?returnTo=${encodeURIComponent(destination)}` : path;

  return (
    <AuthShell subtitle="เลือกวิธีเข้าใช้งาน">
      <AuthCard>
        <AuthCardHeader
          icon={<Shield />}
          title={AUTH_COPY.hubTitle}
          description={AUTH_COPY.hubDescription}
        />
        <div className={authFieldStackClass}>
          <Link href={withReturnTo(AUTH_ROUTES.register)} className={authPrimaryButtonClass}>
            {AUTH_COPY.registerFirstTime}
          </Link>
          <Link href={withReturnTo(AUTH_ROUTES.login)} className={authSecondaryButtonClass}>
            {AUTH_COPY.signIn}
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
