import { AUTH_ROUTES } from "@/lib/auth-routes";

const STORAGE_KEY = "found-u-return-to";

const ALLOWED_PREFIXES = [
  "/home",
  "/lost",
  "/found",
  "/tracking",
  "/nfc",
  "/settings",
  "/discord",
  "/assistant",
  "/admin",
] as const;

/** Pathname only. Query strings are kept by callers; they must not affect the allowlist. */
function returnPathname(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (/[\u0000-\u001F\u007F\\]/.test(path)) return null;

  const withoutHash = path.split("#", 1)[0] ?? "";
  const pathname = withoutHash.split("?", 1)[0] ?? "";
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("://")) {
    return null;
  }
  return pathname;
}

export function isAllowedReturnPath(path: string): boolean {
  const pathname = returnPathname(path);
  if (!pathname) return false;
  if (pathname === AUTH_ROUTES.hub || pathname.startsWith("/auth")) return false;
  if (pathname === "/setup" || pathname.startsWith("/setup/")) return false;
  if (pathname === "/banned") return false;
  // /list collapsed → treat as /home
  const normalized = pathname === "/list" || pathname.startsWith("/list/") ? "/home" : pathname;
  return ALLOWED_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

/** Safe in-app path to resume after login, including a tracking `?code=` query. */
export function canonicalizeReturnPath(path: string): string | null {
  if (!isAllowedReturnPath(path)) return null;
  const withoutHash = path.split("#", 1)[0] ?? "";
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const search = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  if (pathname === "/list" || pathname.startsWith("/list/")) return "/home";
  return `${pathname}${search}`;
}

export function saveReturnTo(path: string): void {
  if (typeof window === "undefined") return;
  const normalized = canonicalizeReturnPath(path);
  if (!normalized) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, normalized);
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
  const fromQueryPath = fromQuery ? canonicalizeReturnPath(fromQuery) : null;
  if (fromQueryPath) {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return fromQueryPath;
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
