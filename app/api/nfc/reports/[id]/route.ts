import { NextRequest, NextResponse } from "next/server";
import { verifyAuthRequest, updateNfcFoundReportStatusAdmin } from "@/lib/nfc-server";

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
    const { status } = body as { status?: "viewed" | "resolved" };

    if (status !== "viewed" && status !== "resolved") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await updateNfcFoundReportStatusAdmin(id, user.uid, status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "report_not_found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === "forbidden") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    console.error("NFC report update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
