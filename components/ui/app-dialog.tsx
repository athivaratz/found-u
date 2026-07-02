"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveModal } from "@/components/ui/responsive-modal";

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
  const { icon: Icon, iconClass, ringClass } = variantStyles[variant];

  const handleClose = () => {
    (onCancel ?? onConfirm)();
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={handleClose}
      showCloseButton={!showCancel}
      size="md"
      footer={
        <div className={cn("flex gap-3", showCancel ? "flex-row" : "flex-col")}>
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
      }
    >
      <div className="flex flex-col items-center text-center py-2">
        <div
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center mb-4 border",
            ringClass
          )}
        >
          <Icon className={cn("w-7 h-7", iconClass)} />
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">{title}</h2>
        <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
          {message}
        </p>
      </div>
    </ResponsiveModal>
  );
}
