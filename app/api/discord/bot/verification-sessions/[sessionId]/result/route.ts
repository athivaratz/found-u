import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DiscordConfigurationError,
  getDiscordGuildId,
  isDiscordBotAuthorized,
  isDiscordId,
} from "@/lib/discord/verification";
import { parseJsonBody } from "@/lib/parse-request";

const resultSchema = z.object({
  guildId: z.string().trim(),
  fulfilled: z.boolean(),
  failureReason: z.string().trim().min(1).max(300).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  if (!isDiscordBotAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, resultSchema);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { sessionId } = await context.params;
  const { guildId, fulfilled, failureReason } = parsed.data;
  if (!isDiscordId(guildId) || !/^[\da-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    if (guildId !== getDiscordGuildId()) {
      return NextResponse.json({ error: "Guild นี้ไม่ได้รับอนุญาต" }, { status: 403 });
    }

    const admin = createAdminClient();
    const patch = fulfilled
      ? { status: "fulfilled" as const, fulfilled_at: new Date().toISOString(), failure_reason: null }
      : { failure_reason: failureReason || "Discord role sync failed" };
    const { data, error } = await admin
      .from("discord_verification_sessions")
      .update(patch)
      .eq("id", sessionId)
      .eq("guild_id", guildId)
      .eq("status", "verified")
      .select("id")
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ updated: Boolean(data) });
  } catch (error) {
    if (error instanceof DiscordConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Record Discord verification result error:", error);
    return NextResponse.json({ error: "บันทึกผลการมอบ Role ไม่สำเร็จ" }, { status: 500 });
  }
}
