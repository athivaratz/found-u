import { AUTH_ROUTES } from "@/lib/auth-routes";

const STORAGE_KEY = "found-u-return-to";

const ALLOWED_PREFIXES = [
  "/home",
  "/lost",
  "/found",
  "/tracking",
  "/list",
  "/nfc",
  "/settings",
  "/assistant",
  "/admin",
] as const;

export function isAllowedReturnPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path === AUTH_ROUTES.hub || path.startsWith("/auth")) return false;
  if (path === "/setup" || path.startsWith("/setup/")) return false;
  if (path === "/banned") return false;
  return ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

export function saveReturnTo(path: string): void {
  if (typeof window === "undefined") return;
  if (!isAllowedReturnPath(path)) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    // ignore quota / private mode
  }
}

export function peekReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && isAllowedReturnPath(stored)) return stored;
  } catch {
    // ignore
  }
  return null;
}

export function consumeReturnTo(fallback = "/home"): string {
  if (typeof window === "undefined") return fallback;

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("returnTo");
  if (fromQuery && isAllowedReturnPath(fromQuery)) {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return fromQuery;
  }

  const stored = peekReturnTo();
  if (stored) {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return stored;
  }

  return fallback;
}

export function captureReturnToFromQuery(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("returnTo");
  if (fromQuery && isAllowedReturnPath(fromQuery)) {
    saveReturnTo(fromQuery);
  }
}
