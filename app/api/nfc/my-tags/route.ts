import { NextRequest, NextResponse } from "next/server";
import { verifyAuthRequest, getOwnerNfcDashboardAdmin } from "@/lib/nfc-server";

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuthRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await getOwnerNfcDashboardAdmin(user.uid);
    return NextResponse.json(data);
  } catch (error) {
    console.error("NFC my-tags error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
