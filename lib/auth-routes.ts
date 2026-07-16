export const SETUP_ROUTES = {
  setup: "/setup",
} as const;

export const AUTH_ROUTES = {
  hub: "/auth",
  login: "/auth/login",
  register: "/auth/register",
  forgotPin: "/auth/login/forgot-pin",
  resetPassword: "/auth/login/reset-password",
  changePassword: "/auth/change-password",
  setupPin: "/auth/setup-pin",
  ...SETUP_ROUTES,
} as const;

export const SETUP_PUBLIC_PATHS = [SETUP_ROUTES.setup] as const;

export function isSetupPublicPath(pathname: string): boolean {
  return (
    (SETUP_PUBLIC_PATHS as readonly string[]).includes(pathname) ||
    pathname.startsWith("/setup/")
  );
}

export const AUTH_PUBLIC_PATHS = [
  AUTH_ROUTES.hub,
  AUTH_ROUTES.login,
  AUTH_ROUTES.register,
  AUTH_ROUTES.changePassword,
  AUTH_ROUTES.setupPin,
  AUTH_ROUTES.forgotPin,
  AUTH_ROUTES.resetPassword,
] as const;

export function isAuthPublicPath(pathname: string): boolean {
  return (
    (AUTH_PUBLIC_PATHS as readonly string[]).includes(pathname) ||
    pathname.startsWith("/auth/")
  );
}

/** Routes that skip AuthProvider / DataProvider / AuthGuard (no useAuth on page) */
export const LIGHTWEIGHT_SHELL_EXACT_PATHS = [
  "/",
  AUTH_ROUTES.hub,
  AUTH_ROUTES.register,
  AUTH_ROUTES.forgotPin,
  AUTH_ROUTES.resetPassword,
] as const;

export function isLightweightShellPath(pathname: string): boolean {
  return (
    isSetupPublicPath(pathname) ||
    (LIGHTWEIGHT_SHELL_EXACT_PATHS as readonly string[]).includes(pathname)
  );
}

export function resolvePostLoginPath(payload: {
  mustChangePassword?: boolean;
  mustSetupPin?: boolean;
  returnTo?: string;
}): string {
  if (payload.mustChangePassword) return AUTH_ROUTES.changePassword;
  if (payload.mustSetupPin) return AUTH_ROUTES.setupPin;
  if (payload.returnTo) return payload.returnTo;
  return "/home";
}
