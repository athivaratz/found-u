import { hasSupabaseClientEnv, resolvePostgresUrl } from "@/lib/setup/db-url";
import { hydrateDatabase, type HydrationResult } from "@/lib/setup/hydrator";

export type DatabaseReadyState = {
  ready: boolean;
  reason?: HydrationResult["reason"] | "missing_supabase_env" | "build_skip";
  error?: string;
  mode?: HydrationResult["mode"];
};

let cachedState: DatabaseReadyState | null = null;
let hydrationPromise: Promise<DatabaseReadyState> | null = null;

function isBuildWithoutDatabase(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  );
}

export async function ensureDatabaseReady(): Promise<DatabaseReadyState> {
  if (cachedState) return cachedState;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    if (!hasSupabaseClientEnv()) {
      cachedState = { ready: false, reason: "missing_supabase_env" };
      return cachedState;
    }

    if (!resolvePostgresUrl()) {
      if (isBuildWithoutDatabase()) {
        cachedState = { ready: false, reason: "build_skip" };
        return cachedState;
      }
      console.warn(
        "[setup] POSTGRES_URL_NON_POOLING not set — skipping runtime hydration (use db:push for local dev)"
      );
      cachedState = { ready: false, reason: "missing_env" };
      return cachedState;
    }

    const result = await hydrateDatabase();
    cachedState = {
      ready: result.ok,
      reason: result.reason,
      error: result.error,
      mode: result.mode,
    };
    return cachedState;
  })();

  try {
    return await hydrationPromise;
  } finally {
    hydrationPromise = null;
  }
}

export function getCachedDatabaseReadyState(): DatabaseReadyState | null {
  return cachedState;
}
