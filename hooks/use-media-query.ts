"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Matches @custom-variant shell-desktop in globals.css */
export const SHELL_DESKTOP_MEDIA_QUERY =
  "(min-width: 768px) and (orientation: landscape) and (min-height: 600px)";

function subscribeToMediaQuery(query: string, callback: () => void) {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getMediaQuerySnapshot(query: string) {
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => subscribeToMediaQuery(query, callback),
    [query]
  );
  const getSnapshot = useCallback(() => getMediaQuerySnapshot(query), [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Landscape tablet+ — student shell with sidebar (not plain min-width 768px) */
export function useIsDesktop(): boolean {
  return useMediaQuery(SHELL_DESKTOP_MEDIA_QUERY);
}
