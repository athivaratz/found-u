"use client";

import { usePathname } from "next/navigation";
import { isLightweightShellPath } from "@/lib/auth-routes";
import { FullAppProviders } from "@/components/providers/full-app-providers";

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-clip bg-bg-secondary transition-colors">
      <div className="w-full max-w-full bg-bg-primary transition-colors">{children}</div>
    </div>
  );
}

export function SetupAwareProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";

  if (isLightweightShellPath(pathname)) {
    return <AppShell>{children}</AppShell>;
  }

  return <FullAppProviders>{children}</FullAppProviders>;
}
