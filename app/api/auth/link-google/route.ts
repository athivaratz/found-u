import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuthRequest } from "@/lib/nfc-server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  getStudentAccount,
  isAdminWhitelisted,
  isValidStudentId,
  normalizeEmail,
  normalizeStudentId,
  promoteAdminUser,
  STUDENT_ACCOUNTS_COLLECTION,
  syncAppUserFromStudent,
  verifyStudentPassword,
} from "@/lib/student-auth-server";

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser || !authUser.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const studentId = normalizeStudentId(body.studentId || "");
    const password = body.password || "";

    if (!isValidStudentId(studentId)) {
      return NextResponse.json({ error: "เลขประจำตัวต้องเป็นตัวเลข 5 หลัก" }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "กรุณากรอกรหัสผ่าน" }, { status: 400 });
    }

    const verified = await verifyStudentPassword(studentId, password);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: 401 });
    }

    const { account } = verified;
    const googleEmail = normalizeEmail(authUser.email);

    if (
      account.linkedGoogleEmail &&
      account.linkedGoogleEmail !== googleEmail &&
      account.linkedUid &&
      account.linkedUid !== authUser.uid
    ) {
      return NextResponse.json(
        { error: "เลขประจำตัวนี้ถูกผูกกับบัญชี Google อื่นแล้ว" },
        { status: 409 }
      );
    }

    await adminDb.collection(STUDENT_ACCOUNTS_COLLECTION).doc(studentId).set(
      {
        linkedUid: authUser.uid,
        linkedGoogleEmail: googleEmail,
        hasLoggedInOnce: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const firebaseUser = await adminAuth.getUser(authUser.uid);
    await syncAppUserFromStudent(authUser.uid, account, {
      email: googleEmail,
      displayName: firebaseUser.displayName || `${account.firstName} ${account.lastName}`,
      photoURL: firebaseUser.photoURL,
      authMethods: ["google", "password"],
    });

    return NextResponse.json({
      success: true,
      studentId,
      mustChangePassword: account.mustChangePassword,
    });
  } catch (err) {
    console.error("Link Google error:", err);
    return NextResponse.json({ error: "ลงทะเบียนไม่สำเร็จ" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser || !authUser.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = normalizeEmail(authUser.email);
  const whitelisted = await isAdminWhitelisted(email);

  if (whitelisted) {
    const firebaseUser = await adminAuth.getUser(authUser.uid);
    await promoteAdminUser(
      authUser.uid,
      email,
      firebaseUser.displayName || email,
      firebaseUser.photoURL
    );
    return NextResponse.json({ isAdmin: true, isStudentVerified: true, whitelisted: true });
  }

  const userDoc = await adminDb.collection("users").doc(authUser.uid).get();
  const data = userDoc.data();

  return NextResponse.json({
    isAdmin: data?.role === "admin",
    isStudentVerified: data?.isStudentVerified === true || data?.role === "admin",
    whitelisted: false,
    mustChangePassword: data?.mustChangePassword === true,
    studentId: data?.studentId || null,
  });
}
