import { NextResponse } from "next/server";
import { generateText } from "ai";
import { getAppSettingsAdmin } from "@/lib/ai-rate-limit";
import {
  getAgentModel,
  isProviderConfigured,
  type AgentProviderName,
} from "@/lib/agent/provider-router";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";

function resolveModelLabel(
  provider: AgentProviderName,
  settings: typeof DEFAULT_APP_SETTINGS
) {
  if (provider === "openrouter") {
    return (
      settings.agentOpenRouterModel ||
      process.env.OPENROUTER_MODEL ||
      "google/gemini-2.0-flash-exp:free"
    );
  }
  return settings.agentModel || "gemini-2.0-flash";
}

export async function POST(request: Request) {
  let mergedSettings = { ...DEFAULT_APP_SETTINGS, ...(await getAppSettingsAdmin()) };
  try {
    const body = await request.json();
    if (body?.settings && typeof body.settings === "object") {
      mergedSettings = { ...mergedSettings, ...body.settings };
    }
  } catch {
    // use database settings only
  }
  return runProviderTests(mergedSettings);
}

export async function GET() {
  const mergedSettings = { ...DEFAULT_APP_SETTINGS, ...(await getAppSettingsAdmin()) };
  return runProviderTests(mergedSettings);
}

async function runProviderTests(mergedSettings: typeof DEFAULT_APP_SETTINGS) {
  const results: Record<
    string,
    { configured: boolean; ok: boolean; model?: string; error?: string }
  > = {
    gemini: { configured: isProviderConfigured("gemini"), ok: false },
    openrouter: { configured: isProviderConfigured("openrouter"), ok: false },
  };

  for (const provider of ["gemini", "openrouter"] as const) {
    const modelLabel = resolveModelLabel(provider, mergedSettings);
    results[provider].model = modelLabel;

    if (!results[provider].configured) {
      results[provider].error = "API key not configured";
      continue;
    }
    try {
      const model = getAgentModel(provider, mergedSettings);
      await generateText({
        model,
        prompt: "Reply with OK only.",
        maxOutputTokens: 8,
      });
      results[provider].ok = true;
    } catch (error) {
      results[provider].error =
        error instanceof Error ? error.message : "Connection failed";
    }
  }

  return NextResponse.json({
    providers: results,
    settingsSource: "database",
  });
}
