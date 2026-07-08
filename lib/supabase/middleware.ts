import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { applySetupOkCookie } from "@/lib/setup/middleware-guard";
import { SETUP_OK_COOKIE } from "@/lib/setup/constants";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  if (user && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    const redirect = NextResponse.redirect(url);
    if (request.cookies.get(SETUP_OK_COOKIE)?.value !== "1") {
      applySetupOkCookie(redirect);
    }
    return redirect;
  }

  if (request.cookies.get(SETUP_OK_COOKIE)?.value !== "1") {
    applySetupOkCookie(supabaseResponse);
  }

  return supabaseResponse;
}
