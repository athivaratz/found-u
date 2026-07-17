import { NextRequest, NextResponse } from "next/server";
import { verifyAuthRequest, isAdminUser } from "@/lib/nfc-server";
import { BLOG_ASSETS_BUCKET } from "@/lib/setup/constants";
import { uploadToSupabaseBucket } from "@/lib/setup/wizard-db";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isAdminUser(authUser.uid))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const folder = String(formData.get("folder") || "general").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "ต้องแนบไฟล์ภาพ" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5MB" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "รองรับเฉพาะ JPEG PNG WEBP GIF" }, { status: 400 });
    }

    const safeFolder = folder.replace(/[^a-z0-9-_]/gi, "") || "general";
    const ext =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : file.type === "image/gif"
            ? "gif"
            : "jpg";
    const path = `${safeFolder}/${Date.now()}.${ext}`;
    const publicUrl = await uploadToSupabaseBucket(
      BLOG_ASSETS_BUCKET,
      path,
      file,
      file.type
    );

    return NextResponse.json({ publicUrl, path });
  } catch (error) {
    console.error("[admin/blog/upload]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "อัปโหลดไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
