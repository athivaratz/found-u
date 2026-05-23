import { NextRequest, NextResponse } from "next/server";
import {
  loginStudentWithPassword,
  normalizeStudentId,
  isValidStudentId,
} from "@/lib/student-auth-server";

export async function POST(request: NextRequest) {
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

    const result = await loginStudentWithPassword(studentId, password);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, retryAfterMs: result.retryAfterMs },
        { status: result.retryAfterMs ? 429 : 401 }
      );
    }

    return NextResponse.json({
      customToken: result.customToken,
      mustChangePassword: result.mustChangePassword,
    });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "เข้าสู่ระบบไม่สำเร็จ" }, { status: 500 });
  }
}
