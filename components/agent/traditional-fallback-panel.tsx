"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { thaiCopy } from "@/lib/copy/thai-student";
import type { AgentFallbackPayload } from "@/lib/agent/fallback";
import { cn } from "@/lib/utils";

const routeLabels: Record<string, string> = {
  list: thaiCopy.fallback.list,
  tracking: thaiCopy.fallback.tracking,
  lost: thaiCopy.fallback.lost,
  found: thaiCopy.fallback.found,
};

type TraditionalFallbackPanelProps = {
  payload?: AgentFallbackPayload | null;
  className?: string;
};

export function TraditionalFallbackPanel({
  payload,
  className,
}: TraditionalFallbackPanelProps) {
  const message = payload?.message || thaiCopy.agent.aiDown;

  return (
    <div
      className={cn(
        "rounded-2xl border border-status-warning/30 bg-status-warning-light/80 p-4 agent-glass",
        className
      )}
    >
      <div className="flex gap-3">
        <AlertTriangle className="w-5 h-5 text-status-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-text-primary text-sm">
            {thaiCopy.fallback.title}
          </h3>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">{message}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {(payload?.suggestedRoutes || []).map((route) => (
              <Link
                key={route.href}
                href={route.href}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-bg-card border border-border-light hover:border-line-green/40 hover:text-line-green transition-colors"
              >
                {routeLabels[route.labelKey] || route.href}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
