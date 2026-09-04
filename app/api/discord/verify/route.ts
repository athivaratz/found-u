import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DiscordConfigurationError,
  hashDiscordVerificationToken,
  isValidDiscordVerificationToken,
  resolveDiscordRoleIds,
} from "@/lib/discord/verification";
import { parseJsonBody } from "@/lib/parse-request";

const verifySchema = z.object({ token: z.string().trim() });

function isEligible(account: {
  role: "user" | "admin";
  is_student_verified: boolean;
  status: "active" | "disabled";
  ban_status: string;
}): boolean {
  return (
    account.status === "active" &&
    account.ban_status === "none" &&
    (account.role === "admin" || account.is_student_verified)
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJsonBody(request, verifySchema);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isValidDiscordVerificationToken(parsed.data.token)) {
    return NextResponse.json({ error: "ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุแล้ว" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: session, error: sessionError } = await admin
      .from("discord_verification_sessions")
      .select("id, guild_id, discord_user_id, status, expires_at")
      .eq("token_hash", hashDiscordVerificationToken(parsed.data.token))
      .maybeSingle();
    if (sessionError) throw sessionError;

    if (!session || session.status !== "pending" || session.expires_at <= now) {
      if (session?.status === "pending") {
        await admin
          .from("discord_verification_sessions")
          .update({ status: "expired", failure_reason: "expired" })
          .eq("id", session.id);
      }
      return NextResponse.json({ error: "ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุแล้ว" }, { status: 400 });
    }

    const { data: account, error: accountError } = await admin
      .from("accounts")
      .select("id, role, grade_level, room_number, is_student_verified, status, ban_status")
      .eq("id", user.id)
      .maybeSingle();
    if (accountError) throw accountError;

    if (!account || !isEligible(account)) {
      return NextResponse.json(
        { error: "บัญชี Found-U นี้ยังไม่ผ่านการยืนยัน หรือไม่สามารถเชื่อมต่อ Discord ได้" },
        { status: 403 }
      );
    }

    const roleIds = resolveDiscordRoleIds(account);
    const { data: discordOwner, error: ownerError } = await admin
      .from("discord_links")
      .select("id, account_id")
      .eq("guild_id", session.guild_id)
      .eq("discord_user_id", session.discord_user_id)
      .maybeSingle();
    if (ownerError) throw ownerError;

    if (discordOwner && discordOwner.account_id !== user.id) {
      return NextResponse.json(
        { error: "บัญชี Discord นี้เชื่อมกับ Found-U บัญชีอื่นอยู่แล้ว" },
        { status: 409 }
      );
    }

    const { data: previousLink, error: previousLinkError } = await admin
      .from("discord_links")
      .select("id, discord_user_id")
      .eq("guild_id", session.guild_id)
      .eq("account_id", user.id)
      .maybeSingle();
    if (previousLinkError) throw previousLinkError;

    if (previousLink && previousLink.discord_user_id !== session.discord_user_id) {
      const { error: unlinkError } = await admin
        .from("discord_links")
        .delete()
        .eq("id", previousLink.id);
      if (unlinkError) throw unlinkError;
    }

    const { error: linkError } = await admin.from("discord_links").upsert(
      {
        guild_id: session.guild_id,
        discord_user_id: session.discord_user_id,
        account_id: user.id,
        role_ids: roleIds,
        verified_at: now,
      },
      { onConflict: "guild_id,discord_user_id" }
    );
    if (linkError) throw linkError;

    const { data: verifiedSession, error: verifyError } = await admin
      .from("discord_verification_sessions")
      .update({
        account_id: user.id,
        role_ids: roleIds,
        status: "verified",
        verified_at: now,
        failure_reason: null,
      })
      .eq("id", session.id)
      .eq("status", "pending")
      .gt("expires_at", now)
      .select("id")
      .maybeSingle();
    if (verifyError) throw verifyError;
    if (!verifiedSession) {
      return NextResponse.json({ error: "ลิงก์ยืนยันหมดอายุแล้ว กรุณาสร้างลิงก์ใหม่ใน Discord" }, { status: 400 });
    }

    return NextResponse.json({ verified: true, roleCount: roleIds.length });
  } catch (error) {
    if (error instanceof DiscordConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Verify Discord account error:", error);
    return NextResponse.json({ error: "ยืนยันบัญชี Discord ไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
