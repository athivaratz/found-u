import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { hasSupabaseClientEnv } from "@/lib/setup/db-url";

export function isSupabaseBrowserConfigured(): boolean {
  return hasSupabaseClientEnv();
}

export function createClient() {
  if (!hasSupabaseClientEnv()) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        experimental: { passkey: true },
      },
    }
  );
}
