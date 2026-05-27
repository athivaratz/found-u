import { NextResponse } from "next/server";
import { expireOverdueFoundItemsAdmin } from "@/lib/found-handover-expiry-server";

export async function POST() {
  try {
    const expired = await expireOverdueFoundItemsAdmin();
    return NextResponse.json({ expired });
  } catch (error) {
    console.error("expire-overdue error:", error);
    return NextResponse.json({ error: "Failed to expire overdue items" }, { status: 500 });
  }
}
