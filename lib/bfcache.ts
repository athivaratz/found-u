let restoredFromBfcache = false;

export function wasRestoredFromBfcache() {
  return restoredFromBfcache;
}

export function subscribeToBfcacheRestore(listener: () => void) {
  if (typeof window === "undefined") return () => {};

  const handler = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    restoredFromBfcache = true;
    listener();
  };

  window.addEventListener("pageshow", handler);
  return () => window.removeEventListener("pageshow", handler);
}

/** Run after first paint so auth/network work does not block bfcache eligibility. */
export function deferAfterFirstPaint(callback: () => void) {
  if (typeof window === "undefined") return;

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 2000 });
    return;
  }

  setTimeout(callback, 1);
}
