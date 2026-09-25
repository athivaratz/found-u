import { createAdminClient } from "@/lib/supabase/admin";

export function buildSupabasePublicUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  const normalizedPath = path.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/${bucket}/${normalizedPath}`;
}

export async function uploadToSupabaseBucket(
  bucket: string,
  path: string,
  file: Blob,
  contentType: string
): Promise<string> {
  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await admin.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true,
  });

  if (error) throw error;
  return buildSupabasePublicUrl(bucket, path);
}

export async function deleteFromSupabaseBucket(
  bucket: string,
  path: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).remove([path]);
  if (error) throw error;
}
