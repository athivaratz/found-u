import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuthRequest } from "@/lib/nfc-server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  getStudentAccount,
  normalizeEmail,
  STUDENT_ACCOUNTS_COLLECTION,
  syncAppUserFromStudent,
} from "@/lib/student-auth-server";

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const firebaseUser = await adminAuth.getUser(authUser.uid);
    const googleProvider = firebaseUser.providerData.find(
      (p) => p.providerId === "google.com"
    );

    if (!googleProvider?.email) {
      return NextResponse.json(
        { error: "กรุณาเชื่อมบัญชี Google จากปุ่มด้านล่างก่อน" },
        { status: 400 }
      );
    }

    const googleEmail = normalizeEmail(googleProvider.email);
    const userDoc = await adminDb.collection("users").doc(authUser.uid).get();
    const userData = userDoc.data();
    const studentId = userData?.studentId as string | undefined;

    if (!studentId) {
      await adminDb.collection("users").doc(authUser.uid).set(
        {
          email: googleEmail,
          photoURL: googleProvider.photoURL || userData?.photoURL || null,
          authMethods: FieldValue.arrayUnion("google"),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return NextResponse.json({ success: true, email: googleEmail });
    }

    const account = await getStudentAccount(studentId);
    if (!account) {
      return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });
    }

    if (
      account.linkedGoogleEmail &&
      account.linkedGoogleEmail !== googleEmail &&
      account.linkedUid &&
      account.linkedUid !== authUser.uid
    ) {
      return NextResponse.json(
        { error: "บัญชี Google นี้ถูกผูกกับเลขประจำตัวอื่นแล้ว" },
        { status: 409 }
      );
    }

    await adminDb.collection(STUDENT_ACCOUNTS_COLLECTION).doc(studentId).set(
      {
        linkedUid: authUser.uid,
        linkedGoogleEmail: googleEmail,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const existingMethods = (userData?.authMethods as string[] | undefined) || [];
    const authMethods = Array.from(new Set([...existingMethods, "google"]));

    await syncAppUserFromStudent(authUser.uid, account, {
      email: googleEmail,
      displayName:
        firebaseUser.displayName || `${account.firstName} ${account.lastName}`,
      photoURL: googleProvider.photoURL || firebaseUser.photoURL,
      authMethods: authMethods as ("google" | "password" | "pin" | "passkey")[],
    });

    return NextResponse.json({ success: true, email: googleEmail });
  } catch (err) {
    console.error("Connect Google error:", err);
    return NextResponse.json({ error: "เชื่อมบัญชี Google ไม่สำเร็จ" }, { status: 500 });
  }
}
