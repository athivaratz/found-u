"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

export type AppMode = "classic" | "agent";

const STORAGE_MODE_KEY = "foundu-app-mode";
const STORAGE_CLASSIC_ROUTE_KEY = "foundu-last-classic-route";
export const AGENT_MESSAGES_KEY = "foundu-agent-messages";

const CLASSIC_ROUTES = ["/home", "/lost", "/found", "/tracking", "/list", "/nfc", "/settings"];
const AGENT_ROUTE = "/assistant";

function readStoredMode(): AppMode {
  if (typeof window === "undefined") return "classic";
  const stored = localStorage.getItem(STORAGE_MODE_KEY);
  return stored === "agent" ? "agent" : "classic";
}

function isClassicPath(pathname: string): boolean {
  return CLASSIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

type AppModeContextValue = {
  mode: AppMode;
  setMode: (mode: AppMode, options?: { navigate?: boolean }) => void;
  switchToClassic: (targetPath?: string) => void;
  switchToAgent: () => void;
  lastClassicRoute: string;
};

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setModeState] = useState<AppMode>("classic");
  const [lastClassicRoute, setLastClassicRoute] = useState("/home");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setModeState(readStoredMode());
    const storedRoute = sessionStorage.getItem(STORAGE_CLASSIC_ROUTE_KEY);
    if (storedRoute) setLastClassicRoute(storedRoute);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !pathname) return;

    if (pathname === AGENT_ROUTE || pathname.startsWith(`${AGENT_ROUTE}/`)) {
      if (mode !== "agent") {
        setModeState("agent");
        localStorage.setItem(STORAGE_MODE_KEY, "agent");
      }
      return;
    }

    if (isClassicPath(pathname)) {
      sessionStorage.setItem(STORAGE_CLASSIC_ROUTE_KEY, pathname);
      setLastClassicRoute(pathname);
      if (mode !== "classic") {
        setModeState("classic");
        localStorage.setItem(STORAGE_MODE_KEY, "classic");
      }
    }
  }, [pathname, hydrated, mode]);

  const setMode = useCallback(
    (next: AppMode, options?: { navigate?: boolean }) => {
      setModeState(next);
      localStorage.setItem(STORAGE_MODE_KEY, next);

      if (options?.navigate === false) return;

      if (next === "agent") {
        router.push(AGENT_ROUTE);
      } else {
        const target =
          sessionStorage.getItem(STORAGE_CLASSIC_ROUTE_KEY) || lastClassicRoute || "/home";
        router.push(target);
      }
    },
    [router, lastClassicRoute]
  );

  const switchToClassic = useCallback(
    (targetPath?: string) => {
      const target = targetPath || lastClassicRoute || "/home";
      sessionStorage.setItem(STORAGE_CLASSIC_ROUTE_KEY, target);
      setLastClassicRoute(target);
      setModeState("classic");
      localStorage.setItem(STORAGE_MODE_KEY, "classic");
      router.push(target);
    },
    [router, lastClassicRoute]
  );

  const switchToAgent = useCallback(() => {
    setModeState("agent");
    localStorage.setItem(STORAGE_MODE_KEY, "agent");
    router.push(AGENT_ROUTE);
  }, [router]);

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
