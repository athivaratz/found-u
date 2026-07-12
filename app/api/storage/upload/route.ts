import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parse-request";
import { ITEM_UPLOADS_BUCKET } from "@/lib/setup/constants";
import { uploadToSupabaseBucket } from "@/lib/setup/wizard-db";
import { isR2Configured, resolveUploadBackend } from "@/lib/storage/upload-backend";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const presignUploadSchema = z.object({
  path: z.string().trim().min(1, "กรุณาระบุ path"),
  contentType: z.string().trim().min(1, "กรุณาระบุ contentType").optional(),
});

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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

function buildAuthorizedPath(userId: string, clientPath: string): string {
  const normalized = normalizePath(clientPath);
  const parts = normalized.split("/");
  const prefix = parts[0];

  if (prefix === "avatars") {
    const ownerId = parts[1];
    if (ownerId !== userId) {
      throw new Error("Unauthorized avatar path");
    }
    return `avatars/${userId}/${Date.now()}.jpg`;
  }

  if (prefix === "found-items") {
    const itemId = parts[1];
    if (!itemId || !/^[a-zA-Z0-9_-]+$/.test(itemId)) {
      throw new Error("Invalid item path");
    }
    return `found-items/${itemId}/${Date.now()}.jpg`;
  }

  throw new Error("Invalid upload path prefix");
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

function buildR2PublicUrl(path: string) {
  const baseUrl = getRequiredEnv("R2_PUBLIC_BASE_URL");
  return `${baseUrl.replace(/\/+$/, "")}/${path}`;
}

async function uploadViaR2(file: File, path: string) {
  const bucket = getRequiredEnv("R2_BUCKET_NAME");
  const client = getR2Client();
  const buffer = Buffer.from(await file.arrayBuffer());

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: path,
    ContentType: file.type || "application/octet-stream",
    Body: buffer,
  });

  await client.send(command);
  return { publicUrl: buildR2PublicUrl(path), path };
}

async function presignViaR2(path: string, contentType: string) {
  const bucket = getRequiredEnv("R2_BUCKET_NAME");
  const client = getR2Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: path,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 });
  const publicUrl = buildR2PublicUrl(path);
  return { uploadUrl, publicUrl, path };
}

async function uploadViaSupabase(file: File, path: string) {
  const publicUrl = await uploadToSupabaseBucket(
    ITEM_UPLOADS_BUCKET,
    path,
    file,
    file.type || "application/octet-stream"
  );
  return { publicUrl, path };
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

    const backend = resolveUploadBackend();
    const contentTypeHeader = request.headers.get("content-type") || "";

    if (contentTypeHeader.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      const clientPath = (formData.get("path") as string) || "";

      if (!file || !clientPath) {
        return NextResponse.json({ error: "File and path are required" }, { status: 400 });
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "File too large" }, { status: 400 });
      }

      const path = buildAuthorizedPath(user.id, clientPath);

      const result =
        backend === "r2" && isR2Configured()
          ? await uploadViaR2(file, path)
          : await uploadViaSupabase(file, path);

      return NextResponse.json({ ...result, backend });
    }

    const parsed = await parseJsonBody(request, presignUploadSchema);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    if (backend !== "r2" || !isR2Configured()) {
      return NextResponse.json(
        {
          error: "Presigned upload is only available with R2 backend",
          backend,
        },
        { status: 400 }
      );
    }

    const path = buildAuthorizedPath(user.id, parsed.data.path);
    const contentType = parsed.data.contentType || "application/octet-stream";
    const result = await presignViaR2(path, contentType);
    return NextResponse.json({ ...result, backend });
  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : "Upload configuration error";
    const status = message.includes("Unauthorized") || message.includes("Invalid") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
