export function resolvePostgresUrl(): string | null {
  return (
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    null
  );
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
