import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAuthRequest } from "@/lib/nfc-server";
import { parseJsonBody } from "@/lib/parse-request";
import { pinSetupSchema } from "@/lib/validations/auth";
import { hashSecret } from "@/lib/student-auth-server";

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = await parseJsonBody(request, pinSetupSchema.pick({ pin: true }));
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const admin = createAdminClient();
    const { data: profileData } = await admin
      .from("accounts")
      .select("student_id, auth_methods")
      .eq("id", authUser.uid)
      .maybeSingle();
    const profile = profileData as { student_id?: string | null; auth_methods?: unknown } | null;
    const studentId = profile?.student_id;
    if (!studentId) {
      return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 400 });
    }

    const { error: pinUpdateError } = await admin
      .from("accounts")
      .update({
        pin_hash: hashSecret(parsed.data.pin),
        updated_at: new Date().toISOString(),
      })
      .eq("student_id", studentId);
    if (pinUpdateError) throw pinUpdateError;

    const authMethods = Array.isArray(profile?.auth_methods)
      ? [...new Set([...(profile.auth_methods as string[]), "pin"])]
      : ["pin"];
    const { error: profileUpdateError } = await admin
      .from("accounts")
      .update({
        auth_methods: authMethods,
        updated_at: new Date().toISOString(),
      })
      .eq("id", authUser.uid);
    if (profileUpdateError) throw profileUpdateError;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PIN setup error:", err);
    return NextResponse.json({ error: "ตั้ง PIN ไม่สำเร็จ" }, { status: 500 });
  }
}
