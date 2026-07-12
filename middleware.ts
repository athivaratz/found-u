import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { enforceSetupGuard } from "@/lib/setup/middleware-guard";
import { hasSupabaseClientEnv } from "@/lib/setup/db-url";

export async function middleware(request: NextRequest) {
  const guardResult = await enforceSetupGuard(request);
  if (guardResult !== "continue") {
    return guardResult;
  }

  // /setup?reason=missing_env must not call Supabase when integration env is absent
  if (!hasSupabaseClientEnv()) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
