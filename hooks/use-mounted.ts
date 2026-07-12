"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

/** True after the first client paint — use before reading browser-only state (theme, localStorage). */
export function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
