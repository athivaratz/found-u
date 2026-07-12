import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchOpenRouterEndpoints } from "@/lib/agent/openrouter-api";
import {
  resolveAiCredentials,
  getOpenRouterApiKey,
  getOpenRouterModel,
} from "@/lib/ai/credentials-resolver";
import { getAppSettingsAdmin } from "@/lib/ai-rate-limit";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";

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

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const credentials = await resolveAiCredentials();
  const settings = { ...DEFAULT_APP_SETTINGS, ...(await getAppSettingsAdmin()) };
  const modelId =
    searchParams.get("model")?.trim() ||
    settings.agentOpenRouterModel ||
    getOpenRouterModel(credentials) ||
    DEFAULT_APP_SETTINGS.agentOpenRouterModel!;

  const openRouterKey = getOpenRouterApiKey(credentials);
  if (!openRouterKey) {
    return NextResponse.json(
      { error: "OpenRouter API key is not configured", modelId, endpoints: [] },
      { status: 503 }
    );
  }

  try {
    const result = await fetchOpenRouterEndpoints(modelId, openRouterKey);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load endpoints",
        modelId,
        endpoints: [],
      },
      { status: 502 }
    );
  }
}
