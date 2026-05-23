import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuthRequest } from "@/lib/nfc-server";
import { adminDb } from "@/lib/firebase-admin";
import {
  hashSecret,
  isValidPin,
  normalizeStudentId,
  STUDENT_ACCOUNTS_COLLECTION,
} from "@/lib/student-auth-server";

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const pin = body.pin || "";

    if (!isValidPin(pin)) {
      return NextResponse.json({ error: "PIN ต้องเป็นตัวเลข 6 หลัก" }, { status: 400 });
    }

    const userDoc = await adminDb.collection("users").doc(authUser.uid).get();
    const studentId = userDoc.data()?.studentId as string | undefined;
    if (!studentId) {
      return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 400 });
    }

    await adminDb.collection(STUDENT_ACCOUNTS_COLLECTION).doc(normalizeStudentId(studentId)).set(
      {
        pinHash: hashSecret(pin),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await adminDb.collection("users").doc(authUser.uid).set(
      {
        authMethods: FieldValue.arrayUnion("pin"),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PIN setup error:", err);
    return NextResponse.json({ error: "ตั้ง PIN ไม่สำเร็จ" }, { status: 500 });
  }
}
