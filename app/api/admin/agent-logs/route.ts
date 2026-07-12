import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanupAgentChatLogsOlderThan } from "@/lib/agent/agent-chat-log";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (data?.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const truncatedOnly = searchParams.get("truncated") === "1";
  const sessionId = searchParams.get("sessionId");
  const userId = searchParams.get("userId");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  const admin = createAdminClient();
  let query = admin
    .from("agent_chat_logs")
    .select(
      "id, user_id, session_id, provider, model, truncated, finish_reason, duration_ms, steps, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (truncatedOnly) query = query.eq("truncated", true);
  if (sessionId) query = query.eq("session_id", sessionId);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) {
    console.error("[admin/agent-logs] query failed:", error);
    const status =
      error.code === "PGRST205"
        ? 503
        : error.code === "42501"
          ? 503
          : 500;
    const message =
      error.code === "PGRST205"
        ? "ตาราง agent_chat_logs ยังไม่มีในฐานข้อมูล — รัน migration ก่อน"
        : error.code === "42501"
          ? "ไม่มีสิทธิ์อ่าน agent_chat_logs — ตรวจ GRANT ให้ service_role"
          : error.message;
    return NextResponse.json({ error: message, code: error.code }, { status });
  }

  return NextResponse.json({ logs: data ?? [] });
}

export async function DELETE() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const deleted = await cleanupAgentChatLogsOlderThan(7);
    return NextResponse.json({ deleted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cleanup failed" },
      { status: 500 }
    );
  }
}
