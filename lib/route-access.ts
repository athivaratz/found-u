import { isKnownRoute } from "@/lib/known-routes";
import { AUTH_ROUTES, isAuthPublicPath, isSetupPublicPath } from "@/lib/auth-routes";

const PUBLIC_PATHS = ["/", "/banned"] as const;

export function isPublicRoute(pathname: string): boolean {
  return (
    (PUBLIC_PATHS as readonly string[]).includes(pathname) ||
    isAuthPublicPath(pathname) ||
    isSetupPublicPath(pathname) ||
    !isKnownRoute(pathname)
  );
}

export function isProtectedRoute(pathname: string): boolean {
  return pathname.length > 0 && !isPublicRoute(pathname);
}

export function isAuthOnlyRoute(pathname: string): boolean {
  return pathname === AUTH_ROUTES.hub || pathname === AUTH_ROUTES.login;
}
