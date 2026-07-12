export function resolvePostgresUrl(): string | null {
  const nonPooling = process.env.POSTGRES_URL_NON_POOLING;
  const pooled = process.env.POSTGRES_URL;
  if (!isPlaceholderEnvValue(nonPooling)) return nonPooling!.trim();
  if (!isPlaceholderEnvValue(pooled)) return pooled!.trim();
  return null;
}

/** Deploy-time placeholder like "-" from Vercel prompt — treat as unset */
export function isPlaceholderEnvValue(value?: string | null): boolean {
  const trimmed = value?.trim();
  return !trimmed || trimmed === "-" || trimmed === "—" || trimmed === "_";
}

export function hasSupabaseClientEnv(): boolean {
  return Boolean(
    !isPlaceholderEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      !isPlaceholderEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function hasSupabaseAdminEnv(): boolean {
  return Boolean(
    !isPlaceholderEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      !isPlaceholderEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

/** All three required for post-setup app + middleware (avoids redirect loop) */
export function hasMinimumSetupEnv(): boolean {
  return hasSupabaseClientEnv() && hasSupabaseAdminEnv();
}
