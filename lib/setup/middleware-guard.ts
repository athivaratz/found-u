import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import {
  SETUP_OK_COOKIE,
  SETUP_OK_COOKIE_MAX_AGE,
} from "@/lib/setup/constants";
import { hasSupabaseClientEnv } from "@/lib/setup/db-url";
import { fetchSetupStatusAnon } from "@/lib/setup/setup-status-server";

const SETUP_EXEMPT_PREFIXES = ["/setup", "/api/setup"] as const;
const SETUP_EXEMPT_EXACT = ["/auth/callback"] as const;

export function isSetupGuardExempt(pathname: string): boolean {
  if ((SETUP_EXEMPT_EXACT as readonly string[]).includes(pathname)) {
    return true;
  }
  return SETUP_EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function applySetupOkCookie(response: NextResponse): void {
  response.cookies.set(SETUP_OK_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SETUP_OK_COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function enforceSetupGuard(
  request: NextRequest
): Promise<NextResponse | "continue"> {
  const pathname = request.nextUrl.pathname;
  if (isSetupGuardExempt(pathname)) {
    return "continue";
  }

  if (!hasSupabaseClientEnv()) {
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.searchParams.set("reason", "missing_env");
    return NextResponse.redirect(url);
  }

  if (request.cookies.get(SETUP_OK_COOKIE)?.value === "1") {
    return "continue";
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // read-only probe for setup status
        },
      },
    }
  );

  const { setupCompleted, error } = await fetchSetupStatusAnon(supabase);

  if (error || !setupCompleted) {
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    if (error) {
      url.searchParams.set("reason", "initializing");
    }
    return NextResponse.redirect(url);
  }

  return "continue";
}
