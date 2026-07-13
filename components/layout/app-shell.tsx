"use client";

import Sidebar from "@/components/layout/sidebar";
import { ManualModeBar } from "@/components/layout/manual-mode-bar";
import { shellSidebarInset } from "@/components/layout/shell-layout";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
}

/** Manual shell with sidebar — pages own horizontal padding inside children. */
export default function AppShell({ children }: AppShellProps) {
  return (
    <div
      className={cn(
        "bg-bg-secondary transition-colors",
        "h-dvh max-h-dvh overflow-hidden flex flex-col",
        "shell-desktop:h-auto shell-desktop:max-h-none shell-desktop:min-h-screen shell-desktop:overflow-visible shell-desktop:flex-row"
      )}
    >
      <Sidebar />
      <main
        className={cn(
          "flex flex-1 flex-col min-h-0 min-w-0",
          shellSidebarInset
        )}
      >
        <ManualModeBar />
        <div
          className={cn(
            "flex-1 min-h-0 w-full overflow-y-auto overflow-x-clip overscroll-contain",
            "main-with-bottom-nav shell-desktop:pb-0"
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
