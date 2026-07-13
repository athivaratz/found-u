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
    <div className="min-h-screen bg-bg-secondary shell-desktop:flex">
      <Sidebar />
      <main className={cn("flex min-h-screen flex-1 flex-col min-w-0", shellSidebarInset)}>
        <ManualModeBar />
        <div className="flex-1 w-full min-h-0">{children}</div>
      </main>
    </div>
  );
}
