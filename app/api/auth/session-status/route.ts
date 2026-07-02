import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapAccountRowToAppUser } from "@/lib/database";
import { verifyAuthRequest } from "@/lib/nfc-server";
import {
  accountNeedsPinSetup,
  getStudentAccount,
  isAdminWhitelisted,
  normalizeEmail,
  promoteAdminUser,
  reconcileStudentAuthState,
  resolveAccountForAuthUser,
} from "@/lib/student-auth-server";
export async function GET(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser || !authUser.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const email = normalizeEmail(authUser.email);
  const whitelisted = await isAdminWhitelisted(email);

  if (whitelisted) {
    const { data: authData } = await admin.auth.admin.getUserById(authUser.uid);
    await promoteAdminUser(
      authUser.uid,
      email,
      (authData.user?.user_metadata?.display_name as string | undefined) || email,
      (authData.user?.user_metadata?.avatar_url as string | undefined) || undefined
    );
    return NextResponse.json({ isAdmin: true, isStudentVerified: true, whitelisted: true });
  }

  const { data: authData } = await admin.auth.admin.getUserById(authUser.uid);
  const profile = await resolveAccountForAuthUser(authUser.uid, {
    student_id: authData.user?.user_metadata?.student_id as string | undefined,
  });

  let hasPin = false;
  let mustSetupPin = false;
  const studentId = profile?.student_id;
  if (studentId) {
    const account = await getStudentAccount(studentId);
    if (account) {
      await reconcileStudentAuthState(profile!.id, account);
      const refreshed = await getStudentAccount(studentId);
      const finalAccount = refreshed ?? account;
      hasPin = !!finalAccount.pinHash;
      mustSetupPin = accountNeedsPinSetup(finalAccount);
    }
  }

  return NextResponse.json({
    isAdmin: profile?.role === "admin",
    isStudentVerified: profile?.is_student_verified === true || profile?.role === "admin",
    whitelisted: false,
    mustChangePassword: profile?.must_change_password === true,
    mustSetupPin,
    hasPin,
    studentId: studentId || null,
    role: profile?.role ?? null,
    profile: profile ? mapAccountRowToAppUser(profile) : null,
  });
}
