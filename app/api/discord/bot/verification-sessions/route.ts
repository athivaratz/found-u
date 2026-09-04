import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DiscordConfigurationError,
  buildDiscordVerificationUrl,
  createDiscordVerificationToken,
  getDiscordGuildId,
  hashDiscordVerificationToken,
  isDiscordBotAuthorized,
  isDiscordId,
  readDiscordRoleIds,
} from "@/lib/discord/verification";
import { parseJsonBody } from "@/lib/parse-request";

const verificationSessionSchema = z.object({
  guildId: z.string().trim(),
  discordUserId: z.string().trim(),
});

function botUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function configurationError(error: unknown) {
  if (error instanceof DiscordConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  if (!isDiscordBotAuthorized(request)) return botUnauthorized();

  const parsed = await parseJsonBody(request, verificationSessionSchema);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { guildId, discordUserId } = parsed.data;
  if (!isDiscordId(guildId) || !isDiscordId(discordUserId)) {
    return NextResponse.json({ error: "Discord ID ไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    if (guildId !== getDiscordGuildId()) {
      return NextResponse.json({ error: "Guild นี้ไม่ได้รับอนุญาต" }, { status: 403 });
    }

    const admin = createAdminClient();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    // Keep only the latest link usable for this Discord member. Older links are
    // retained for auditability but cannot be redeemed.
    const { error: expireError } = await admin
      .from("discord_verification_sessions")
      .update({ status: "expired", failure_reason: "superseded" })
      .eq("guild_id", guildId)
      .eq("discord_user_id", discordUserId)
      .eq("status", "pending");
    if (expireError) throw expireError;

    for (let attempt = 0; attempt < 3; attempt++) {
      const token = createDiscordVerificationToken();
      const { data, error } = await admin
        .from("discord_verification_sessions")
        .insert({
          token_hash: hashDiscordVerificationToken(token),
          guild_id: guildId,
          discord_user_id: discordUserId,
          expires_at: expiresAt,
        })
        .select("id, expires_at")
        .single();

      if (!error && data) {
        return NextResponse.json({
          sessionId: data.id,
          verificationUrl: buildDiscordVerificationUrl(token, request.nextUrl.origin),
          expiresAt: data.expires_at,
        });
      }

      if (error?.code !== "23505" || attempt === 2) throw error;
    }

    return NextResponse.json({ error: "สร้างลิงก์ยืนยันไม่สำเร็จ" }, { status: 500 });
  } catch (error) {
    const configResponse = configurationError(error);
    if (configResponse) return configResponse;
    console.error("Create Discord verification session error:", error);
    return NextResponse.json({ error: "สร้างลิงก์ยืนยันไม่สำเร็จ" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isDiscordBotAuthorized(request)) return botUnauthorized();

  try {
    const guildId = getDiscordGuildId();
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") || "50");
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const admin = createAdminClient();
    const now = new Date().toISOString();

    // Expire stale unredeemed URLs without exposing their status to the bot.
    await admin
      .from("discord_verification_sessions")
      .update({ status: "expired", failure_reason: "expired" })
      .eq("guild_id", guildId)
      .eq("status", "pending")
      .lt("expires_at", now);

    const { data, error } = await admin
      .from("discord_verification_sessions")
      .select("id, guild_id, discord_user_id, role_ids")
      .eq("guild_id", guildId)
      .eq("status", "verified")
      .order("verified_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    return NextResponse.json({
      sessions: (data || []).map((session) => ({
        id: session.id,
        guildId: session.guild_id,
        discordUserId: session.discord_user_id,
        roleIds: readDiscordRoleIds(session.role_ids),
      })),
    });
  } catch (error) {
    const configResponse = configurationError(error);
    if (configResponse) return configResponse;
    console.error("List Discord verification sessions error:", error);
    return NextResponse.json({ error: "อ่านคิวการยืนยันไม่สำเร็จ" }, { status: 500 });
  }
}
