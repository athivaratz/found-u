// The browser does not pick a storage backend. PHP signs an R2 URL and
// the file goes straight there. There is no Supabase bucket fallback.

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const EDITOR_IMAGE_BYTES = 5 * 1024 * 1024;

export function normalizeImageType(type: string): string | null {
  const value = type.trim().toLowerCase();
  if (value === "image/jpg") return "image/jpeg";
  return (IMAGE_TYPES as readonly string[]).includes(value) ? value : null;
}
