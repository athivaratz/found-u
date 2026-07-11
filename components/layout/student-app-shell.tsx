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
    <div className={cn("min-h-screen bg-bg-secondary transition-colors", className)}>
      {/* Mobile */}
      <div className={cn("md:hidden flex flex-col min-h-screen", showBottomNav && "main-with-bottom-nav")}>
        <ManualModeBar />
        {headerTitle ? (
          <Header title={headerTitle} showBack backHref={headerBackHref} />
        ) : null}
        <main className={cn("flex-1 page-padding py-4 min-w-0 overflow-x-clip", mainClassName)}>
          <div className={contentClass}>{children}</div>
        </main>
        {showBottomNav ? <BottomNav /> : null}
      </div>

      {/* Desktop */}
      <div className="hidden md:flex min-h-screen">
        <Sidebar />
        <main className={cn(shellDesktopMain, shellSidebarInset, shellDesktopPadding, "min-w-0 overflow-x-clip", mainClassName)}>
          <div className={contentClass}>{children}</div>
        </main>
      </div>
    </div>
  );
}
