import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAuthRequest } from "@/lib/nfc-server";
import { parseJsonBody } from "@/lib/parse-request";
import { verifyPinSchema } from "@/lib/validations/auth";
import { getStudentAccount, verifySecret } from "@/lib/student-auth-server";

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = await parseJsonBody(request, verifyPinSchema);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const admin = createAdminClient();
    const { data: profileData } = await admin
      .from("accounts")
      .select("student_id")
      .eq("id", authUser.uid)
      .maybeSingle();
    const profile = profileData as { student_id?: string | null } | null;
    const studentId = profile?.student_id;
    if (!studentId) return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 400 });

    const account = await getStudentAccount(studentId);
    if (!account) return NextResponse.json({ error: "ไม่พบบัญชีนักเรียน" }, { status: 404 });
    if (!account.pinHash) {
      return NextResponse.json({ error: "ยังไม่ได้ตั้ง PIN — ใช้รหัสผ่านแทน" }, { status: 400 });
    }
    if (!verifySecret(parsed.data.pin, account.pinHash)) {
      return NextResponse.json({ error: "PIN ไม่ถูกต้อง" }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Verify PIN error:", err);
    return NextResponse.json({ error: "ตรวจสอบ PIN ไม่สำเร็จ" }, { status: 500 });
  }
}
