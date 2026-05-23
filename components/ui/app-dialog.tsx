"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppDialogVariant = "info" | "warning" | "error" | "success";

interface AppDialogProps {
  open: boolean;
  title: string;
  message: string;
  variant?: AppDialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  showCancel?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

const variantStyles: Record<
  AppDialogVariant,
  { icon: typeof Info; iconClass: string; ringClass: string }
> = {
  info: {
    icon: Info,
    iconClass: "text-blue-500",
    ringClass: "bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/30",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-amber-500",
    ringClass: "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/30",
  },
  error: {
    icon: AlertTriangle,
    iconClass: "text-red-500",
    ringClass: "bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/30",
  },
  success: {
    icon: CheckCircle2,
    iconClass: "text-[#06C755]",
    ringClass: "bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900/30",
  },
};

export function AppDialog({
  open,
  title,
  message,
  variant = "info",
  confirmLabel = "ตกลง",
  cancelLabel = "ยกเลิก",
  showCancel = false,
  onConfirm,
  onCancel,
}: AppDialogProps) {
  if (!open) return null;

  const { icon: Icon, iconClass, ringClass } = variantStyles[variant];

  return (
    <div className="overlay-modal fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="relative bg-bg-card border border-border-light rounded-2xl p-6 shadow-2xl max-w-md w-full animate-scale-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
      >
        <div className="flex flex-col items-center text-center">
          <div
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center mb-4 border",
              ringClass
            )}
          >
            <Icon className={cn("w-7 h-7", iconClass)} />
          </div>
          <h2 id="app-dialog-title" className="text-lg font-semibold text-text-primary mb-2">
            {title}
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{message}</p>
        </div>

        <div className={cn("mt-6 flex gap-3", showCancel ? "flex-row" : "flex-col")}>
          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl font-medium border border-border-light text-text-secondary hover:bg-bg-secondary transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "py-3 rounded-xl font-medium text-white transition-colors",
              showCancel ? "flex-1" : "w-full",
              variant === "error" ? "bg-red-500 hover:bg-red-600" : "bg-[#06C755] hover:bg-[#05b34d]"
            )}
          >
            {confirmLabel}
          </button>
        </div>

        {!showCancel && (
          <button
            type="button"
            onClick={onCancel ?? onConfirm}
            className="absolute top-4 right-4 p-1 rounded-lg text-text-tertiary hover:bg-bg-secondary"
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
