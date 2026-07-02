"use client";

import { useEffect } from "react";

let lockCount = 0;

function applyBodyScrollLock() {
  if (typeof document === "undefined") return;
  document.body.style.overflow = lockCount > 0 ? "hidden" : "";
}

/** Lock document scroll while a modal is open. Supports nested modals via ref counting. */
export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    lockCount += 1;
    applyBodyScrollLock();

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      applyBodyScrollLock();
    };
  }, [locked]);
}
