"use client";

import { useCallback, useState } from "react";
import { AppDialog, type AppDialogVariant } from "@/components/ui/app-dialog";

type DialogOptions = {
  title: string;
  message: string;
  variant?: AppDialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
};

type DialogState = DialogOptions & {
  mode: "alert" | "confirm";
  resolve: (value: boolean) => void;
};

export function useAppDialog() {
  const [state, setState] = useState<DialogState | null>(null);

  const close = useCallback((result: boolean) => {
    setState((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const showAlert = useCallback((options: DialogOptions) => {
    return new Promise<void>((resolve) => {
      setState({
        ...options,
        mode: "alert",
        resolve: () => resolve(),
      });
    });
  }, []);

  const showConfirm = useCallback((options: DialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({
        ...options,
        mode: "confirm",
        resolve,
      });
    });
  }, []);

  const dialog = state ? (
    <AppDialog
      open
      title={state.title}
      message={state.message}
      variant={state.variant}
      confirmLabel={state.confirmLabel ?? (state.mode === "confirm" ? "ยืนยัน" : "ตกลง")}
      cancelLabel={state.cancelLabel ?? "ยกเลิก"}
      showCancel={state.mode === "confirm"}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null;

  return { showAlert, showConfirm, dialog };
}
