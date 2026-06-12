import { NextRequest, NextResponse } from "next/server";
import { checkAuthEligibility } from "@/lib/auth-eligibility";
import { verifyAuthRequest } from "@/lib/nfc-server";

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get("mode") === "google" ? "google_sign_in" : "secondary";
  const result = await checkAuthEligibility(authUser.uid, mode, authUser.email);

  if (!result.eligible) {
    return NextResponse.json({ error: result.message }, { status: 403 });
  }

  return NextResponse.json({ eligible: true, studentId: result.studentId });
}
