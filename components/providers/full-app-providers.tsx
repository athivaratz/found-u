"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { AppModeProvider } from "@/contexts/app-mode-context";
import { DataProvider } from "@/contexts/DataContext";
import AuthGuard from "@/components/auth/auth-guard";
import { BfcacheRestoreHandler } from "@/components/bfcache-restore-handler";

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-clip bg-bg-secondary transition-colors">
      <div className="w-full max-w-full bg-bg-primary transition-colors">{children}</div>
    </div>
  );
}

export function FullAppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppModeProvider>
        <BfcacheRestoreHandler />
        <DataProvider>
          <AuthGuard>
            <AppShell>{children}</AppShell>
          </AuthGuard>
        </DataProvider>
      </AppModeProvider>
    </AuthProvider>
  );
}
