import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAuthRequest } from "@/lib/nfc-server";

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("auth_methods")
    .eq("id", authUser.uid)
    .maybeSingle();

  const existing = Array.isArray(profile?.auth_methods) ? (profile.auth_methods as string[]) : [];
  const authMethods = Array.from(new Set([...existing, "passkey"]));

  await admin
    .from("profiles")
    .update({ auth_methods: authMethods, updated_at: new Date().toISOString() })
    .eq("id", authUser.uid);

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("auth_methods")
    .eq("id", authUser.uid)
    .maybeSingle();

  const existing = Array.isArray(profile?.auth_methods) ? (profile.auth_methods as string[]) : [];
  const authMethods = existing.filter((method) => method !== "passkey");

  await admin
    .from("profiles")
    .update({ auth_methods: authMethods, updated_at: new Date().toISOString() })
    .eq("id", authUser.uid);

  return NextResponse.json({ success: true });
}
