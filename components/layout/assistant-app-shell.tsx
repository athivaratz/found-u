"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  shellAssistantDesktopPadding,
  shellAssistantMaxWidth,
} from "@/components/layout/shell-layout";

export type AssistantAppShellProps = {
  children: ReactNode;
  className?: string;
  mainClassName?: string;
};

/** Full-screen assistant shell — no classic sidebar or bottom nav. */
export function AssistantAppShell({
  children,
  className,
  mainClassName,
}: AssistantAppShellProps) {
  return (
    <div className={cn("min-h-screen bg-bg-secondary transition-colors", className)}>
      <div className="assistant-desktop:hidden h-[100dvh] flex flex-col w-full min-w-0 overflow-hidden">
        {children}
      </div>

      <div
        className={cn(
          "hidden assistant-desktop:flex h-screen w-full overflow-hidden min-h-0 min-w-0",
          shellAssistantDesktopPadding,
          mainClassName
        )}
      >
        <div className={cn("flex flex-1 flex-col min-h-0 w-full mx-auto", shellAssistantMaxWidth)}>
          {children}
        </div>
      </div>
    </div>
  );
}
