import { NextRequest, NextResponse } from "next/server";
import { verifyAuthRequest, updateNfcTagStatusAdmin } from "@/lib/nfc-server";
import type { NfcTagStatus } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuthRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, lostItemId } = body as { status?: NfcTagStatus; lostItemId?: string };

    if (!status) {
      return NextResponse.json({ error: "status required" }, { status: 400 });
    }

    const allowed: NfcTagStatus[] = ["active", "lost", "returned", "disabled"];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }

    await updateNfcTagStatusAdmin(id, user.uid, status, lostItemId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "tag_not_found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === "forbidden") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    console.error("NFC tag update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
