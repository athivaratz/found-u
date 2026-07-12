import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { probeOpenRouterChat } from "@/lib/agent/openrouter-api";
import {
  resolveAiCredentials,
  getOpenRouterApiKey,
  getOpenRouterModel,
} from "@/lib/ai/credentials-resolver";
import {
  buildOpenRouterRequestExtras,
  type OpenRouterRequestExtras,
} from "@/lib/agent/openrouter-routing";
import { normalizeAgentSettings } from "@/lib/agent/normalize-agent-settings";
import { getAppSettingsAdmin } from "@/lib/ai-rate-limit";
import {
  AGENT_DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
} from "@/lib/types";

async function isAdminUser(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("accounts")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return data?.role === "admin";
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await isAdminUser(user.id))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

function pickSettings(body: Record<string, unknown> | null): AppSettings {
  const fromBody =
    body?.settings && typeof body.settings === "object"
      ? (body.settings as AppSettings)
      : {};
  return { ...DEFAULT_APP_SETTINGS, ...fromBody };
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const credentials = await resolveAiCredentials();
  const openRouterKey = getOpenRouterApiKey(credentials);
  if (!openRouterKey) {
    return NextResponse.json(
      { ok: false, error: "OpenRouter API key is not configured" },
      { status: 503 }
    );
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  const dbSettings = await getAppSettingsAdmin();
  const settings = normalizeAgentSettings({
    ...DEFAULT_APP_SETTINGS,
    ...dbSettings,
    ...pickSettings(body),
  });

  const modelId =
    (typeof body?.model === "string" ? body.model : null) ||
    settings.agentOpenRouterModel ||
    getOpenRouterModel(credentials) ||
    DEFAULT_APP_SETTINGS.agentOpenRouterModel!;

  const prompt =
    typeof body?.prompt === "string"
      ? body.prompt
      : "ตอบเป็นภาษาไทยสั้นๆ ว่า OK";

  const extras: OpenRouterRequestExtras | undefined =
    body?.routing && typeof body.routing === "object"
      ? (body.routing as OpenRouterRequestExtras)
      : buildOpenRouterRequestExtras(settings);

  const result = await probeOpenRouterChat({
    modelId,
    prompt,
    maxTokens: settings.agentMaxOutputTokens ?? AGENT_DEFAULT_MAX_OUTPUT_TOKENS,
    extras,
    apiKey: openRouterKey,
  });

  return NextResponse.json(result);
}
