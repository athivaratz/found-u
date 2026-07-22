import { NextRequest } from "next/server";
import type { UIMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  checkAndRecordRateLimitAtomic,
  getAppSettingsAdmin,
} from "@/lib/ai-rate-limit";
import { buildAgentRequestContext } from "@/lib/agent/context-pruner";
import { createFoundUAgent } from "@/lib/agent/create-agent";
import {
  createFoundUAgentUIStreamResponse,
  type AgentStreamCollector,
} from "@/lib/agent/agent-ui-stream";
import {
  buildFallbackPayload,
  isProviderError,
} from "@/lib/agent/fallback";
import { withProviderFallback, getAgentConfig } from "@/lib/agent/provider-router";
import { resolveAiCredentials } from "@/lib/ai/credentials-resolver";
import { buildOpenRouterRequestExtras } from "@/lib/agent/openrouter-routing";
import { getRuntimeSchoolName } from "@/lib/agent/school-context";
import { normalizeAgentSettings } from "@/lib/agent/normalize-agent-settings";
import { warnHallucinatedTrackingCodes } from "@/lib/agent/hallucination-guard";
import { isAdminUser } from "@/lib/nfc-server";
import type { MemoryFact } from "@/lib/chat/types";
import { thaiCopy } from "@/lib/copy/thai-student";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import { parseClientLocation } from "@/lib/found-location-guard";

export const maxDuration = 60;

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
    const clientLocation = parseClientLocation(body.clientLocation);
    const adminLocationBypass = body.adminLocationBypass === true;

    const settings = await getAppSettingsAdmin();
    const schoolName = await getRuntimeSchoolName();
    const mergedSettings = normalizeAgentSettings({
      ...DEFAULT_APP_SETTINGS,
      ...settings,
    });

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

    if (
      mergedSettings.agentProvider === "openrouter" ||
      mergedSettings.agentProvider === "auto"
    ) {
      console.info("[openrouter/routing]", buildOpenRouterRequestExtras(mergedSettings));
    }

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

    const agentConfig = getAgentConfig(mergedSettings);
    const aiCredentials = await resolveAiCredentials();

    const { result: streamResponse, providerUsed } = await withProviderFallback(
      mergedSettings,
      async (provider, model) => {
        const isAdmin = await isAdminUser(user.id);
        const collector: AgentStreamCollector = {
          steps: [],
          requestMessages: pruned,
          settingsSnapshot: mergedSettings,
          routing: buildOpenRouterRequestExtras(mergedSettings) as
            | Record<string, unknown>
            | undefined,
          provider,
          modelId:
            provider === "openrouter"
              ? mergedSettings.agentOpenRouterModel ?? agentConfig.model
              : mergedSettings.agentModel ?? agentConfig.model,
          sessionId,
          userId: user.id,
          startedAt: Date.now(),
        };

        const agent = createFoundUAgent({
          model,
          settings: mergedSettings,
          userId: user.id,
          isAdmin,
          memoryFacts: safeFacts,
          schoolName,
          clientLocation,
          adminLocationBypass: isAdmin && adminLocationBypass,
          onStepLog: (step) => {
            collector.steps.push(step);
          },
        });

        const response = await createFoundUAgentUIStreamResponse({
          agent,
          uiMessages: pruned,
          originalMessages: messages,
          model,
          settings: mergedSettings,
          headers: {
            "X-Agent-Provider": provider,
            ...(sessionId ? { "X-Chat-Session-Id": sessionId } : {}),
          },
          collector,
        });

        return response;
      },
      aiCredentials
    );

    streamResponse.headers.set("X-Agent-Provider", providerUsed);

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
