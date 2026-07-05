import { NextRequest } from "next/server";
import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  checkAndRecordRateLimitAtomic,
  getAppSettingsAdmin,
} from "@/lib/ai-rate-limit";
import { pruneUiMessages } from "@/lib/agent/context-pruner";
import { createFoundUAgent } from "@/lib/agent/create-agent";
import {
  buildFallbackPayload,
  isProviderError,
} from "@/lib/agent/fallback";
import { withProviderFallback } from "@/lib/agent/provider-router";
import { thaiCopy } from "@/lib/copy/thai-student";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const messages = (body.messages || []) as UIMessage[];

    const settings = await getAppSettingsAdmin();
    const mergedSettings = { ...DEFAULT_APP_SETTINGS, ...settings };
    const pruned = pruneUiMessages(
      messages,
      mergedSettings.agentContextMaxMessages ?? 8
    );

    const rateLimit = await checkAndRecordRateLimitAtomic(
      user.id,
      mergedSettings,
      "agent-chat"
    );

    if (!rateLimit.allowed) {
      return Response.json(
        buildFallbackPayload(
          "rate_limit",
          mergedSettings.aiRateLimitMessage || thaiCopy.agent.rateLimit
        ),
        { status: 429 }
      );
    }

    const { result: streamResponse } = await withProviderFallback(
      mergedSettings,
      async (provider, model) => {
        const agent = createFoundUAgent({
          model,
          settings: mergedSettings,
          userId: user.id,
        });

        return createAgentUIStreamResponse({
          agent,
          uiMessages: pruned,
          headers: {
            "X-Agent-Provider": provider,
          },
        });
      }
    );

    return streamResponse;
  } catch (error) {
    console.error("[agent/chat] error:", error);

    if (isProviderError(error)) {
      return Response.json(
        buildFallbackPayload("provider_error", thaiCopy.agent.aiDown),
        { status: 503 }
      );
    }

    return Response.json(
      buildFallbackPayload("unknown", thaiCopy.agent.aiBusy),
      { status: 500 }
    );
  }
}
