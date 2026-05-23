import { NextRequest, NextResponse } from "next/server";
import { verifyAuthRequest, isAdminUser } from "@/lib/nfc-server";
import { adminDb } from "@/lib/firebase-admin";
import {
  ADMIN_WHITELIST_COLLECTION,
  STUDENT_ACCOUNTS_COLLECTION,
  normalizeEmail,
} from "@/lib/student-auth-server";
import { FieldValue } from "firebase-admin/firestore";

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminUser(authUser.uid))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [studentsSnap, whitelistSnap, linkedSnap] = await Promise.all([
    adminDb.collection(STUDENT_ACCOUNTS_COLLECTION).count().get(),
    adminDb.collection(ADMIN_WHITELIST_COLLECTION).get(),
    adminDb.collection(STUDENT_ACCOUNTS_COLLECTION).where("hasLoggedInOnce", "==", true).count().get(),
  ]);

  const disabledSnap = await adminDb
    .collection(STUDENT_ACCOUNTS_COLLECTION)
    .where("status", "==", "disabled")
    .count()
    .get();

  return NextResponse.json({
    totalStudents: studentsSnap.data().count,
    loggedInCount: linkedSnap.data().count,
    disabledCount: disabledSnap.data().count,
    whitelist: whitelistSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
}

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminUser(authUser.uid))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const email = normalizeEmail(body.email || "");
  const note = body.note as string | undefined;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "อีเมลไม่ถูกต้อง" }, { status: 400 });
  }

  await adminDb.collection(ADMIN_WHITELIST_COLLECTION).doc(email).set({
    email,
    note: note || null,
    addedBy: authUser.uid,
    addedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true, email });
}

export async function DELETE(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminUser(authUser.uid))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = normalizeEmail(request.nextUrl.searchParams.get("email") || "");
  if (!email) return NextResponse.json({ error: "ต้องระบุ email" }, { status: 400 });

  await adminDb.collection(ADMIN_WHITELIST_COLLECTION).doc(email).delete();
  return NextResponse.json({ success: true });
}
