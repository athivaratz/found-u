import { NextResponse } from "next/server";
import { generateText } from "ai";
import { getAppSettingsAdmin } from "@/lib/ai-rate-limit";
import {
  getAgentModel,
  isProviderConfigured,
  type AgentProviderName,
} from "@/lib/agent/provider-router";
import { resolveAiCredentials } from "@/lib/ai/credentials-resolver";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";

type ProviderTestResult = {
  configured: boolean;
  ok: boolean;
  model?: string;
  error?: string;
};

function resolveModelLabel(
  provider: AgentProviderName,
  settings: typeof DEFAULT_APP_SETTINGS,
  credentials: Awaited<ReturnType<typeof resolveAiCredentials>>
) {
  if (provider === "openrouter") {
    return (
      settings.agentOpenRouterModel ||
      credentials.openrouterModel ||
      "google/gemini-2.0-flash-exp:free"
    );
  }
  return settings.agentModel || "gemini-2.0-flash";
}

async function isAdminUser(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("accounts").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin";
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isAdminUser(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

async function testSingleProvider(
  provider: AgentProviderName,
  mergedSettings: typeof DEFAULT_APP_SETTINGS,
  credentials: Awaited<ReturnType<typeof resolveAiCredentials>>
): Promise<ProviderTestResult> {
  const modelLabel = resolveModelLabel(provider, mergedSettings, credentials);
  const result: ProviderTestResult = {
    configured: isProviderConfigured(provider, credentials),
    ok: false,
    model: modelLabel,
  };

  if (!result.configured) {
    result.error = "API key not configured";
    return result;
  }

  try {
    const model = getAgentModel(provider, mergedSettings, credentials);
    await generateText({
      model,
      prompt: "Reply with OK only.",
      maxOutputTokens: 8,
    });
    result.ok = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Connection failed";
  }

  return result;
}

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  let mergedSettings = { ...DEFAULT_APP_SETTINGS, ...(await getAppSettingsAdmin()) };
  let providerFilter: AgentProviderName | undefined;

  try {
    const body = await request.json();
    if (body?.settings && typeof body.settings === "object") {
      mergedSettings = { ...mergedSettings, ...body.settings };
    }
    if (body?.provider === "gemini" || body?.provider === "openrouter") {
      providerFilter = body.provider;
    }
  } catch {
    // use database settings only
  }

  return runProviderTests(mergedSettings, providerFilter);
}

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const mergedSettings = { ...DEFAULT_APP_SETTINGS, ...(await getAppSettingsAdmin()) };
  const { searchParams } = new URL(request.url);
  const providerParam = searchParams.get("provider");
  const providerFilter =
    providerParam === "gemini" || providerParam === "openrouter"
      ? providerParam
      : undefined;

  return runProviderTests(mergedSettings, providerFilter);
}

async function runProviderTests(
  mergedSettings: typeof DEFAULT_APP_SETTINGS,
  providerFilter?: AgentProviderName
) {
  const credentials = await resolveAiCredentials();
  const providers: AgentProviderName[] = providerFilter
    ? [providerFilter]
    : ["gemini", "openrouter"];

  const results: Record<string, ProviderTestResult> = {};

  for (const provider of providers) {
    results[provider] = await testSingleProvider(provider, mergedSettings, credentials);
  }

  return NextResponse.json({
    providers: results,
    settingsSource: credentials.source,
  });
}
