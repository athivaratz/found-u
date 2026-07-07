import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentStreamCollector } from "@/lib/agent/agent-ui-stream";

export async function persistAgentChatLog(
  collector: AgentStreamCollector
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("agent_chat_logs").insert({
    user_id: collector.userId,
    session_id: collector.sessionId ?? null,
    provider: collector.provider,
    model: collector.modelId,
    settings_snapshot: collector.settingsSnapshot,
    routing: collector.routing ?? null,
    request_messages: collector.requestMessages,
    response_parts: collector.responseParts ?? null,
    steps: collector.steps,
    truncated: collector.truncated ?? false,
    finish_reason: collector.finishReason ?? null,
    duration_ms: collector.durationMs ?? null,
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
}

export async function cleanupAgentChatLogsOlderThan(days = 7): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("agent_chat_logs")
    .delete()
    .lt("created_at", cutoff)
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}
