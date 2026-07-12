"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

export type AppMode = "classic" | "agent";

const STORAGE_MODE_KEY = "foundu-app-mode";
const STORAGE_CLASSIC_ROUTE_KEY = "foundu-last-classic-route";

const CLASSIC_ROUTES = ["/home", "/lost", "/found", "/tracking", "/list", "/nfc", "/settings"];
const AGENT_ROUTE = "/assistant";

function readStoredMode(): AppMode {
  if (typeof window === "undefined") return "classic";
  const stored = localStorage.getItem(STORAGE_MODE_KEY);
  return stored === "agent" ? "agent" : "classic";
}

function readStoredClassicRoute(): string {
  if (typeof window === "undefined") return "/home";
  return sessionStorage.getItem(STORAGE_CLASSIC_ROUTE_KEY) || "/home";
}

function isClassicPath(pathname: string): boolean {
  return CLASSIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function getRouteMode(pathname: string | null): AppMode | null {
  if (!pathname) return null;
  if (pathname === AGENT_ROUTE || pathname.startsWith(`${AGENT_ROUTE}/`)) {
    return "agent";
  }
  if (isClassicPath(pathname)) return "classic";
  return null;
}

type AppModeContextValue = {
  mode: AppMode;
  setMode: (mode: AppMode, options?: { navigate?: boolean }) => void;
  switchToClassic: (targetPath?: string) => void;
  switchToAgent: () => void;
  lastClassicRoute: string;
};

const AppModeContext = createContext<AppModeContextValue | null>(null);

function subscribeToAppModeStorage() {
  return () => {};
}

export function AppModeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const storedMode = useSyncExternalStore(
    subscribeToAppModeStorage,
    readStoredMode,
    () => "classic" as AppMode
  );
  const storedClassicRoute = useSyncExternalStore(
    subscribeToAppModeStorage,
    readStoredClassicRoute,
    () => "/home"
  );
  const [modeOverride, setModeOverride] = useState<AppMode | null>(null);
  const [classicRouteOverride, setClassicRouteOverride] = useState<string | null>(null);

  const routeMode = getRouteMode(pathname);
  const mode = routeMode ?? modeOverride ?? storedMode;
  const lastClassicRoute =
    (pathname && isClassicPath(pathname) ? pathname : null) ??
    classicRouteOverride ??
    storedClassicRoute;

  const persistMode = useCallback((next: AppMode) => {
    localStorage.setItem(STORAGE_MODE_KEY, next);
  }, []);

  const persistClassicRoute = useCallback((route: string) => {
    sessionStorage.setItem(STORAGE_CLASSIC_ROUTE_KEY, route);
  }, []);

  const setMode = useCallback(
    (next: AppMode, options?: { navigate?: boolean }) => {
      if (options?.navigate === false) {
        setModeOverride(next);
      } else {
        setModeOverride(null);
      }
      persistMode(next);

      if (options?.navigate === false) return;

      if (next === "agent") {
        router.push(AGENT_ROUTE);
      } else {
        const target = classicRouteOverride ?? storedClassicRoute ?? "/home";
        router.push(target);
      }
    },
    [router, classicRouteOverride, storedClassicRoute, persistMode]
  );

  const switchToClassic = useCallback(
    (targetPath?: string) => {
      const target = targetPath || lastClassicRoute || "/home";
      persistClassicRoute(target);
      setClassicRouteOverride(target);
      setModeOverride(null);
      persistMode("classic");
      router.push(target);
    },
    [router, lastClassicRoute, persistClassicRoute, persistMode]
  );

  const switchToAgent = useCallback(() => {
    setModeOverride(null);
    persistMode("agent");
    router.push(AGENT_ROUTE);
  }, [router, persistMode]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      switchToClassic,
      switchToAgent,
      lastClassicRoute,
    }),
    [mode, setMode, switchToClassic, switchToAgent, lastClassicRoute]
  );

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode() {
  const ctx = useContext(AppModeContext);
  if (!ctx) {
    throw new Error("useAppMode must be used within AppModeProvider");
  }
  return ctx;
}
