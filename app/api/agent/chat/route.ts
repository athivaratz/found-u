import { NextRequest } from "next/server";
import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  checkAndRecordRateLimitAtomic,
  getAppSettingsAdmin,
} from "@/lib/ai-rate-limit";
import { buildAgentRequestContext } from "@/lib/agent/context-pruner";
import { createFoundUAgent } from "@/lib/agent/create-agent";
import {
  buildFallbackPayload,
  isProviderError,
} from "@/lib/agent/fallback";
import { withProviderFallback } from "@/lib/agent/provider-router";
import { warnHallucinatedTrackingCodes } from "@/lib/agent/hallucination-guard";
import { isAdminUser } from "@/lib/nfc-server";
import type { MemoryFact } from "@/lib/chat/types";
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
    const memoryFacts = (body.memoryFacts || []) as MemoryFact[];
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;

    const settings = await getAppSettingsAdmin();
    const mergedSettings = { ...DEFAULT_APP_SETTINGS, ...settings };

    const ctx = buildAgentRequestContext(messages, mergedSettings);
    const pruned = ctx.modelMessages;

    if (ctx.droppedCount > 0 || sessionId) {
      console.info("[chat/context]", {
        sessionId,
        totalMessages: messages.length,
        dropped: ctx.droppedCount,
        estimatedTokens: ctx.estimatedTokens,
        strategy: mergedSettings.agentContextStrategy ?? "hybrid",
      });
    }

    warnHallucinatedTrackingCodes(pruned);

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

    const maxFacts = mergedSettings.agentMemoryMaxFacts ?? 5;
    const safeFacts = memoryFacts
      .filter((f) => f.userId === user.id)
      .slice(0, maxFacts);

    const { result: streamResponse } = await withProviderFallback(
      mergedSettings,
      async (provider, model) => {
        const isAdmin = await isAdminUser(user.id);
        const agent = createFoundUAgent({
          model,
          settings: mergedSettings,
          userId: user.id,
          isAdmin,
          memoryFacts: safeFacts,
        });

        return createAgentUIStreamResponse({
          agent,
          uiMessages: pruned,
          headers: {
            "X-Agent-Provider": provider,
            ...(sessionId ? { "X-Chat-Session-Id": sessionId } : {}),
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
