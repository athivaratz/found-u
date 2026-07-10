"use client";

import { useCallback, useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(callback: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function useReducedMotion(): boolean {
  const subscribe = useCallback(
    (callback: () => void) => subscribeToReducedMotion(callback),
    []
  );
  const getSnapshot = useCallback(() => getReducedMotionSnapshot(), []);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
