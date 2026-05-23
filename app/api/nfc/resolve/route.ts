import { NextRequest, NextResponse } from "next/server";
import { resolveNfcTagPublic, verifyAuthRequest } from "@/lib/nfc-server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tag = searchParams.get("tag");

    if (!tag?.trim()) {
      return NextResponse.json({ error: "tag parameter required" }, { status: 400 });
    }

    const resolved = await resolveNfcTagPublic(tag);
    if (!resolved) {
      return NextResponse.json({ error: "tag_not_found" }, { status: 404 });
    }

    const authUser = await verifyAuthRequest(request);
    const isOwner = authUser?.uid === resolved.ownerId;

    return NextResponse.json({
      tag: {
        tagId: resolved.tagId,
        itemName: resolved.itemName,
        category: resolved.category,
        description: resolved.description,
        status: resolved.status,
        isLost: resolved.isLost,
      },
      isOwner,
      ...(isOwner ? { ownerId: resolved.ownerId } : {}),
    });
  } catch (error) {
    console.error("NFC resolve error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
