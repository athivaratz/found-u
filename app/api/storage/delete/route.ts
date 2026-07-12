import { NextRequest, NextResponse } from "next/server";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parse-request";
import { ITEM_UPLOADS_BUCKET } from "@/lib/setup/constants";
import { deleteFromSupabaseBucket } from "@/lib/setup/wizard-db";
import { isR2Configured, resolveUploadBackend } from "@/lib/storage/upload-backend";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const deleteUploadSchema = z.object({
  path: z.string().trim().min(1).optional(),
  url: z.string().trim().url().optional(),
});

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

function normalizePath(path: string): string {
  const trimmed = path.replace(/^\/+/, "");
  if (!trimmed || trimmed.includes("..")) {
    throw new Error("Invalid path");
  }
  return trimmed;
}

function getR2Client() {
  const accountId = getRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function extractPathFromR2Url(url: string): string | null {
  const baseUrl = process.env.R2_PUBLIC_BASE_URL;
  if (!baseUrl) return null;
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (!url.startsWith(normalizedBase)) return null;
  return url.slice(normalizedBase.length + 1);
}

function extractPathFromSupabaseUrl(url: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) return null;
  const marker = `/storage/v1/object/public/${ITEM_UPLOADS_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return url.slice(index + marker.length);
}

function resolveDeletePath(url?: string, path?: string): string {
  if (path) return normalizePath(path);
  if (!url) throw new Error("path or url required");

  const fromR2 = extractPathFromR2Url(url);
  if (fromR2) return normalizePath(fromR2);

  const fromSupabase = extractPathFromSupabaseUrl(url);
  if (fromSupabase) return normalizePath(fromSupabase);

  throw new Error("Unsupported delete URL");
}

function assertDeleteAuthorized(userId: string, path: string): void {
  if (path.startsWith(`avatars/${userId}/`)) return;
  if (path.startsWith("found-items/")) return;
  throw new Error("Unauthorized delete path");
}

async function deleteViaR2(path: string): Promise<void> {
  const bucket = getRequiredEnv("R2_BUCKET_NAME");
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: path,
    })
  );
}

async function deleteViaSupabase(path: string): Promise<void> {
  await deleteFromSupabaseBucket(ITEM_UPLOADS_BUCKET, path);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = await parseJsonBody(request, deleteUploadSchema);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const path = resolveDeletePath(parsed.data.url, parsed.data.path);
    assertDeleteAuthorized(user.id, path);

    const backend = resolveUploadBackend();
    if (backend === "r2" && isR2Configured()) {
      await deleteViaR2(path);
    } else {
      await deleteViaSupabase(path);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Storage delete error:", error);
    const message = error instanceof Error ? error.message : "Delete failed";
    const status = message.includes("Unauthorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
