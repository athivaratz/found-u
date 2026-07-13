"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import Sidebar from "@/components/layout/sidebar";
import BottomNav from "@/components/layout/bottom-nav";
import Header from "@/components/layout/header";
import { ManualModeBar } from "@/components/layout/manual-mode-bar";
import {
  shellDesktopMain,
  shellDesktopPadding,
  shellMobileOnly,
  shellDesktopOnly,
  shellSidebarInset,
} from "@/components/layout/shell-layout";

export type StudentShellMaxWidth = "sm" | "md" | "lg" | "full";

const maxWidthClasses: Record<StudentShellMaxWidth, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  full: "max-w-4xl",
};

export type StudentAppShellProps = {
  children: ReactNode;
  /** Mobile sticky header with back button */
  headerTitle?: string;
  headerBackHref?: string;
  showBottomNav?: boolean;
  maxWidth?: StudentShellMaxWidth;
  className?: string;
  mainClassName?: string;
};

export function StudentAppShell({
  children,
  headerTitle,
  headerBackHref = "/home",
  showBottomNav = true,
  maxWidth = "lg",
  className,
  mainClassName,
}: StudentAppShellProps) {
  const contentClass = cn("mx-auto w-full", maxWidthClasses[maxWidth]);

  return (
    <div
      className={cn(
        "bg-bg-secondary transition-colors",
        "h-dvh max-h-dvh overflow-hidden flex flex-col",
        "shell-desktop:h-auto shell-desktop:max-h-none shell-desktop:min-h-screen shell-desktop:overflow-visible",
        className
      )}
    >
      {/* Mobile */}
      <div
        className={cn(
          shellMobileOnly,
          "flex flex-1 flex-col min-h-0 min-w-0",
          showBottomNav && "main-with-bottom-nav"
        )}
      >
        <ManualModeBar />
        {headerTitle ? (
          <Header title={headerTitle} showBack backHref={headerBackHref} />
        ) : null}
        <main
          className={cn(
            "flex-1 min-h-0 overflow-y-auto overscroll-contain page-padding py-4 min-w-0",
            mainClassName
          )}
        >
          <div className={contentClass}>{children}</div>
        </main>
        {showBottomNav ? <BottomNav /> : null}
      </div>

      {/* Desktop */}
      <div className={cn(shellDesktopOnly, "flex-1 min-h-screen min-w-0")}>
        <Sidebar />
        <main
          className={cn(
            shellDesktopMain,
            shellSidebarInset,
            shellDesktopPadding,
            "min-w-0 overflow-x-clip",
            mainClassName
          )}
        >
          <div className={contentClass}>{children}</div>
        </main>
      </div>
    </div>
  );
}
