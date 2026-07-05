"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Sidebar from "@/components/layout/sidebar";
import BottomNav from "@/components/layout/bottom-nav";
import Header from "@/components/layout/header";
import { ModeSwitcher } from "@/components/agent/mode-switcher";

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
  const pathname = usePathname();
  const isAssistant = pathname?.startsWith("/assistant");

  if (isAssistant) {
    return <>{children}</>;
  }

  return (
    <div className={cn("min-h-screen bg-bg-secondary transition-colors", className)}>
      {/* Mobile */}
      <div className={cn("md:hidden", showBottomNav && "main-with-bottom-nav")}>
        <div className="sticky top-0 z-40 px-4 py-2 bg-bg-secondary/95 backdrop-blur-md border-b border-border-light/60 flex justify-center">
          <ModeSwitcher variant="compact" />
        </div>
        {headerTitle && (
          <Header title={headerTitle} showBack backHref={headerBackHref} />
        )}
        <main className={cn("page-padding py-4", mainClassName)}>
          <div className={contentClass}>{children}</div>
        </main>
        {showBottomNav && <BottomNav />}
      </div>

      {/* Desktop — scroll via document, not a clipped inner pane */}
      <div className="hidden md:flex min-h-screen">
        <Sidebar />
        <main
          className={cn(
            "flex-1 ml-72 bg-bg-secondary px-8 py-8 min-h-screen",
            mainClassName
          )}
        >
          <div className="flex justify-center mb-6">
            <ModeSwitcher />
          </div>
          <div className={contentClass}>{children}</div>
        </main>
      </div>
    </div>
  );
}
