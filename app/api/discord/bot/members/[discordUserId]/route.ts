import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DiscordConfigurationError,
  getDiscordGuildId,
  getManagedDiscordRoleIds,
  isDiscordBotAuthorized,
  isDiscordId,
  resolveDiscordRoleIds,
} from "@/lib/discord/verification";

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ discordUserId: string }> }
) {
  if (!isDiscordBotAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { discordUserId } = await context.params;
  const guildId = request.nextUrl.searchParams.get("guildId")?.trim() || "";
  if (!isDiscordId(discordUserId) || !isDiscordId(guildId)) {
    return NextResponse.json({ error: "Discord ID ไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    if (guildId !== getDiscordGuildId()) {
      return NextResponse.json({ error: "Guild นี้ไม่ได้รับอนุญาต" }, { status: 403 });
    }

    const managedRoleIds = getManagedDiscordRoleIds();
    const admin = createAdminClient();
    const { data: link, error: linkError } = await admin
      .from("discord_links")
      .select("id, account_id")
      .eq("guild_id", guildId)
      .eq("discord_user_id", discordUserId)
      .maybeSingle();
    if (linkError) throw linkError;

    if (!link) {
      return NextResponse.json({ verified: false, expectedRoleIds: [], managedRoleIds });
    }

    const { data: account, error: accountError } = await admin
      .from("accounts")
      .select("role, grade_level, room_number, is_student_verified, status, ban_status")
      .eq("id", link.account_id)
      .maybeSingle();
    if (accountError) throw accountError;

    if (!account || !isEligible(account)) {
      return NextResponse.json({ verified: false, expectedRoleIds: [], managedRoleIds });
    }

    const expectedRoleIds = resolveDiscordRoleIds(account);
    const { error: updateError } = await admin
      .from("discord_links")
      .update({ role_ids: expectedRoleIds, verified_at: new Date().toISOString() })
      .eq("id", link.id);
    if (updateError) throw updateError;

    return NextResponse.json({ verified: true, expectedRoleIds, managedRoleIds });
  } catch (error) {
    if (error instanceof DiscordConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Resolve Discord member roles error:", error);
    return NextResponse.json({ error: "อ่านข้อมูลยืนยันตัวตนไม่สำเร็จ" }, { status: 500 });
  }
}
