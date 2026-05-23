import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuthRequest } from "@/lib/nfc-server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  getStudentAccount,
  hashSecret,
  isValidNewPassword,
  STUDENT_ACCOUNTS_COLLECTION,
  verifySecret,
} from "@/lib/student-auth-server";

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const currentPassword = body.currentPassword as string;
    const newPassword = body.newPassword as string;

    if (!isValidNewPassword(newPassword)) {
      return NextResponse.json(
        { error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัว และมีทั้งตัวอักษรและตัวเลข" },
        { status: 400 }
      );
    }

    const userDoc = await adminDb.collection("users").doc(authUser.uid).get();
    const studentId = userDoc.data()?.studentId as string | undefined;
    if (!studentId) {
      return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 400 });
    }

    const account = await getStudentAccount(studentId);
    if (!account) {
      return NextResponse.json({ error: "ไม่พบบัญชีนักเรียน" }, { status: 404 });
    }

    if (!verifySecret(currentPassword, account.currentPasswordHash)) {
      return NextResponse.json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" }, { status: 401 });
    }

    const newHash = hashSecret(newPassword);
    await adminDb.collection(STUDENT_ACCOUNTS_COLLECTION).doc(studentId).set(
      {
        currentPasswordHash: newHash,
        mustChangePassword: false,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await adminAuth.updateUser(authUser.uid, { password: newPassword }).catch(() => {
      // Google-linked users may not use password provider
    });
    await adminDb.collection("users").doc(authUser.uid).set(
      {
        mustChangePassword: false,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Change password error:", err);
    return NextResponse.json({ error: "เปลี่ยนรหัสผ่านไม่สำเร็จ" }, { status: 500 });
  }
}
