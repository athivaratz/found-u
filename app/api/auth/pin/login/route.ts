import { NextRequest, NextResponse } from "next/server";
import { loginStudentWithPin, isValidPin, isValidStudentId, normalizeStudentId } from "@/lib/student-auth-server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const studentId = normalizeStudentId(body.studentId || "");
    const pin = body.pin || "";

    if (!isValidStudentId(studentId)) {
      return NextResponse.json({ error: "เลขประจำตัวต้องเป็นตัวเลข 5 หลัก" }, { status: 400 });
    }
    if (!isValidPin(pin)) {
      return NextResponse.json({ error: "PIN ต้องเป็นตัวเลข 6 หลัก" }, { status: 400 });
    }

    const result = await loginStudentWithPin(studentId, pin);
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
    console.error("PIN login error:", err);
    return NextResponse.json({ error: "เข้าสู่ระบบไม่สำเร็จ" }, { status: 500 });
  }
}
