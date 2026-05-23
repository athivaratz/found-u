import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  checkRateLimit,
  ensureFirebaseUserForStudent,
  getStudentAccount,
  hashSecret,
  isValidNewPassword,
  isValidStudentId,
  issueStudentCustomToken,
  normalizeStudentId,
  STUDENT_ACCOUNTS_COLLECTION,
  syncAppUserFromStudent,
  verifySchoolPassword,
} from "@/lib/student-auth-server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const studentId = normalizeStudentId(body.studentId || "");
    const schoolPassword = body.schoolPassword || "";
    const newPassword = body.newPassword || "";

    if (!isValidStudentId(studentId)) {
      return NextResponse.json({ error: "เลขประจำตัวต้องเป็นตัวเลข 5 หลัก" }, { status: 400 });
    }
    if (!schoolPassword || !newPassword) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
    }
    if (!isValidNewPassword(newPassword)) {
      return NextResponse.json(
        { error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัว และมีทั้งตัวอักษรและตัวเลข" },
        { status: 400 }
      );
    }

    const rate = checkRateLimit(`reset:${studentId}`);
    if (!rate.allowed) {
      return NextResponse.json({ error: "ลองบ่อยเกินไป กรุณารอสักครู่" }, { status: 429 });
    }

    const verified = await verifySchoolPassword(studentId, schoolPassword);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: 401 });
    }

    const { account } = verified;
    const newHash = hashSecret(newPassword);
    const displayName = `${account.firstName} ${account.lastName}`;

    await adminDb.collection(STUDENT_ACCOUNTS_COLLECTION).doc(studentId).set(
      {
        currentPasswordHash: newHash,
        mustChangePassword: false,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const uid = account.linkedUid || (await ensureFirebaseUserForStudent(studentId, displayName, newPassword));
    await adminAuth.updateUser(uid, { password: newPassword });

    const updatedAccount = await getStudentAccount(studentId);
    if (updatedAccount) {
      await syncAppUserFromStudent(uid, updatedAccount, { mustChangePassword: false });
    }

    const customToken = await issueStudentCustomToken(uid);
    return NextResponse.json({ success: true, customToken });
  } catch (err) {
    console.error("Reset password error:", err);
    return NextResponse.json({ error: "รีเซ็ตรหัสผ่านไม่สำเร็จ" }, { status: 500 });
  }
}
