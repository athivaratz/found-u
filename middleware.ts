import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { enforceSetupGuard } from "@/lib/setup/middleware-guard";

export async function middleware(request: NextRequest) {
  const guardResult = await enforceSetupGuard(request);
  if (guardResult !== "continue") {
    return guardResult;
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
