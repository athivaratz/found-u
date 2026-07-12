import { hasMinimumSetupEnv, resolvePostgresUrl } from "@/lib/setup/db-url";
import { hydrateDatabase, type HydrationResult } from "@/lib/setup/hydrator";

export type DatabaseReadyState = {
  ready: boolean;
  reason?: HydrationResult["reason"] | "missing_supabase_env" | "build_skip";
  error?: string;
  mode?: HydrationResult["mode"];
};

const CACHE_TTL_MS = 30_000;
const FAILURE_CACHE_TTL_MS = 5_000;

let cachedState: DatabaseReadyState | null = null;
let cacheExpiresAt = 0;
let hydrationPromise: Promise<DatabaseReadyState> | null = null;

function isBuildWithoutDatabase(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  );
}

function setCache(state: DatabaseReadyState): DatabaseReadyState {
  cachedState = state;
  cacheExpiresAt =
    Date.now() + (state.ready ? CACHE_TTL_MS : FAILURE_CACHE_TTL_MS);
  return state;
}

export async function ensureDatabaseReady(): Promise<DatabaseReadyState> {
  if (cachedState && cacheExpiresAt > Date.now()) {
    return cachedState;
  }
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    if (!hasMinimumSetupEnv()) {
      return setCache({ ready: false, reason: "missing_supabase_env" });
    }

    if (!resolvePostgresUrl()) {
      if (isBuildWithoutDatabase()) {
        return setCache({ ready: false, reason: "build_skip" });
      }
      console.warn(
        "[setup] POSTGRES_URL_NON_POOLING not set — skipping runtime hydration (use db:push for local dev)"
      );
      return setCache({ ready: false, reason: "missing_env" });
    }

    const result = await hydrateDatabase();
    return setCache({
      ready: result.ok,
      reason: result.reason,
      error: result.error,
      mode: result.mode,
    });
  })();

  try {
    return await hydrationPromise;
  } finally {
    hydrationPromise = null;
  }
}

export function getCachedDatabaseReadyState(): DatabaseReadyState | null {
  if (cachedState && cacheExpiresAt > Date.now()) {
    return cachedState;
  }
  return null;
}

export function invalidateDatabaseReadyCache(): void {
  cachedState = null;
  cacheExpiresAt = 0;
}
