import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuthRequest } from "@/lib/nfc-server";
import { adminDb } from "@/lib/firebase-admin";

const SHOWN_NAME_MAX = 40;

export async function PATCH(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const shownName = (body.shownName as string | undefined)?.trim() ?? "";

    if (shownName.length > SHOWN_NAME_MAX) {
      return NextResponse.json(
        { error: `ชื่อที่แสดงต้องไม่เกิน ${SHOWN_NAME_MAX} ตัวอักษร` },
        { status: 400 }
      );
    }

    await adminDb.collection("users").doc(authUser.uid).update({
      shownName: shownName || FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, shownName: shownName || null });
  } catch (error) {
    console.error("profile update error:", error);
    return NextResponse.json({ error: "อัปเดตโปรไฟล์ไม่สำเร็จ" }, { status: 500 });
  }
}
