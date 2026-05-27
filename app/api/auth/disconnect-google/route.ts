import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuthRequest } from "@/lib/nfc-server";
import { adminDb } from "@/lib/firebase-admin";
import {
  STUDENT_ACCOUNTS_COLLECTION,
  studentIdToAuthEmail,
} from "@/lib/student-auth-server";

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userDoc = await adminDb.collection("users").doc(authUser.uid).get();
    const studentId = userDoc.data()?.studentId as string | undefined;

    if (studentId) {
      await adminDb.collection(STUDENT_ACCOUNTS_COLLECTION).doc(studentId).set(
        {
          linkedGoogleEmail: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    const userUpdates: Record<string, unknown> = {
      authMethods: FieldValue.arrayRemove("google"),
      photoURL: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (studentId) {
      userUpdates.email = studentIdToAuthEmail(studentId);
    }

    await adminDb.collection("users").doc(authUser.uid).set(userUpdates, { merge: true });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Disconnect Google error:", err);
    return NextResponse.json({ error: "ยกเลิกการเชื่อม Google ไม่สำเร็จ" }, { status: 500 });
  }
}
