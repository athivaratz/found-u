export type UploadBackend = "r2" | "supabase";

const R2_ENV_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_BASE_URL",
] as const;

export function isR2Configured(): boolean {
  return R2_ENV_VARS.every((name) => Boolean(process.env[name]?.trim()));
}

export function resolveUploadBackend(): UploadBackend {
  return isR2Configured() ? "r2" : "supabase";
}
