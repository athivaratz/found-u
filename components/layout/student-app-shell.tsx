"use client";

import type { ReactNode } from "react";
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
  /** Full-screen chat on mobile; sidebar + wide pane on desktop */
  variant?: "default" | "assistant";
  className?: string;
  mainClassName?: string;
};

export function StudentAppShell({
  children,
  headerTitle,
  headerBackHref = "/home",
  showBottomNav = true,
  maxWidth = "lg",
  variant = "default",
  className,
  mainClassName,
}: StudentAppShellProps) {
  const contentClass = cn("mx-auto w-full", maxWidthClasses[maxWidth]);
  const isAssistant = variant === "assistant";

  if (isAssistant) {
    return (
      <div className={cn("min-h-screen bg-bg-secondary transition-colors", className)}>
        {/* Mobile / tablet portrait: immersive full-screen chat */}
        <div className="assistant-desktop:hidden h-[100dvh] flex flex-col w-full min-w-0 overflow-hidden">
          {children}
        </div>

        {/* Desktop / tablet landscape: sidebar + full-height chat column */}
        <div className="hidden assistant-desktop:flex h-screen overflow-hidden">
          <Sidebar />
          <main
            className={cn(
              "flex-1 ml-72 bg-bg-secondary flex flex-col min-h-0 min-w-0 h-screen p-4 assistant-desktop:p-5",
              mainClassName
            )}
          >
            <div className="flex-1 flex flex-col min-h-0 w-full max-w-5xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    );
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
