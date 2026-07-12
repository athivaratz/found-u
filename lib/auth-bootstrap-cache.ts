const AUTH_BOOTSTRAP_KEY = "found-u-auth-bootstrap";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type AuthBootstrapCache = {
  uid: string;
  sessionFlags: {
    mustSetupPin: boolean;
    hasPin: boolean;
    isAdmin: boolean;
    isStudentVerified: boolean;
  };
  fetchedAt: number;
};

export function readAuthBootstrapCache(): AuthBootstrapCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_BOOTSTRAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthBootstrapCache;
    if (!parsed?.uid || typeof parsed.fetchedAt !== "number") return null;
    if (Date.now() - parsed.fetchedAt > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAuthBootstrapCache(cache: AuthBootstrapCache): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(AUTH_BOOTSTRAP_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota / private mode
  }
}

export function clearAuthBootstrapCache(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(AUTH_BOOTSTRAP_KEY);
  } catch {
    // ignore
  }
}
