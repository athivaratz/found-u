/**
 * OpenRouter response completeness harness for Found-U agent.
 *
 * Usage:
 *   bun --env-file=.env.local scripts/test-openrouter-response.ts
 *   bun --env-file=.env.local scripts/test-openrouter-response.ts --agent
 *   bun --env-file=.env.local scripts/test-openrouter-response.ts --only=baidu-lock-none
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { createOpenRouterInjectingFetch } from "../lib/agent/openrouter-routing";
import { createFoundUAgent } from "../lib/agent/create-agent";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "../lib/types";
import type { OpenRouterRequestExtras } from "../lib/agent/openrouter-routing";

const MODEL =
  process.env.OPENROUTER_TEST_MODEL || "deepseek/deepseek-v4-flash";

const PROMPTS = {
  greeting: "เฮ้ย ฮัลโหล ๆ เฮ้ย",
  listItems:
    "เช็ครายการที่ยังไม่ได้รับคืน แล้วสรุปให้ฟังเป็นภาษาไทยแบบสมบูรณ์ อย่าตัดกลางคำ",
} as const;

type Scenario = {
  id: string;
  label: string;
  settings: Partial<AppSettings>;
  extras?: OpenRouterRequestExtras;
  maxTokens?: number;
  stream?: boolean;
};

function buildSettings(patch: Partial<AppSettings>): AppSettings {
  return { ...DEFAULT_APP_SETTINGS, ...patch };
}

const SCENARIOS: Scenario[] = [
  {
    id: "baseline-sort-latency",
    label: "DB-like: no lock, sort latency, reasoning medium",
    settings: {
      agentOpenRouterModel: MODEL,
      agentOpenRouterLockProvider: false,
      agentOpenRouterProviderSort: "latency",
      agentOpenRouterReasoningEffort: "medium",
      agentMaxOutputTokens: 2048,
    },
  },
  {
    id: "reasoning-none",
    label: "No lock + reasoning none",
    settings: {
      agentOpenRouterModel: MODEL,
      agentOpenRouterLockProvider: false,
      agentOpenRouterProviderSort: "latency",
      agentOpenRouterReasoningEffort: "none",
      agentMaxOutputTokens: 2048,
    },
  },
  {
    id: "baidu-lock-none",
    label: "Lock baidu/fp8, reasoning none, no fallback",
    settings: {
      agentOpenRouterModel: MODEL,
      agentOpenRouterLockProvider: true,
      agentOpenRouterProviderOrder: ["baidu/fp8"],
      agentOpenRouterAllowFallbacks: false,
      agentOpenRouterReasoningEffort: "none",
      agentMaxOutputTokens: 2048,
    },
  },
  {
    id: "deepinfra-lock-none",
    label: "Lock deepinfra/fp4, reasoning none",
    settings: {
      agentOpenRouterModel: MODEL,
      agentOpenRouterLockProvider: true,
      agentOpenRouterProviderOrder: ["deepinfra/fp4"],
      agentOpenRouterAllowFallbacks: false,
      agentOpenRouterReasoningEffort: "none",
      agentMaxOutputTokens: 2048,
    },
  },
  {
    id: "gmicloud-lock-none",
    label: "Lock gmicloud/fp8, reasoning none",
    settings: {
      agentOpenRouterModel: MODEL,
      agentOpenRouterLockProvider: true,
      agentOpenRouterProviderOrder: ["gmicloud/fp8"],
      agentOpenRouterAllowFallbacks: false,
      agentOpenRouterReasoningEffort: "none",
      agentMaxOutputTokens: 2048,
    },
  },
  {
    id: "baidu-lock-stream",
    label: "Lock baidu/fp8 + stream (AI SDK)",
    settings: {
      agentOpenRouterModel: MODEL,
      agentOpenRouterLockProvider: true,
      agentOpenRouterProviderOrder: ["baidu/fp8"],
      agentOpenRouterAllowFallbacks: false,
      agentOpenRouterReasoningEffort: "none",
      agentMaxOutputTokens: 2048,
    },
    stream: true,
  },
  {
    id: "baidu-lock-high-tokens",
    label: "Lock baidu/fp8, max 4096 output",
    settings: {
      agentOpenRouterModel: MODEL,
      agentOpenRouterLockProvider: true,
      agentOpenRouterProviderOrder: ["baidu/fp8"],
      agentOpenRouterAllowFallbacks: false,
      agentOpenRouterReasoningEffort: "none",
      agentMaxOutputTokens: 4096,
    },
  },
];

type ProbeResult = {
  id: string;
  ok: boolean;
  provider?: string;
  finishReason?: string;
  nativeFinishReason?: string;
  textLen: number;
  textPreview: string;
  textTail: string;
  fullText: string;
  looksTruncated: boolean;
  completionTokens?: number;
  reasoningTokens?: number;
  error?: string;
  ms: number;
};

/** True when the response likely ended mid-word or mid-sentence. */
function looksTruncatedThai(text: string, finishReason?: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (finishReason === "length") return true;

  // Ends cleanly: punctuation, polite particle, emoji, or closing paren/bracket.
  const endsCleanly =
    /(?:ครับ|ค่ะ|คะ|นะ|ไหม|แล้ว|จ้า|คับ|!|\?|\.|…|"|'|\)|\]|😊|🙂|👍|✅|🫤|🧐)$/.test(
      t
    );
  if (endsCleanly) return false;

  // Suspicious: ends on Thai consonant/vowel with no closing particle (often mid-word).
  if (/[\u0E01-\u0E2E\u0E30-\u0E3A\u0E40-\u0E4E]$/.test(t) && t.length > 30) {
    return true;
  }

  const badEndings = [
    "ค้",
    "หัวข",
    "ช่วยค้",
    "แถ",
    "ที่ย",
    "หร",
    "ซึ",
    "ของหา",
    "เลยคร",
    "ในระบบเลยคร",
    "ช่วยค้",
    "สรุป",
    "ตรวจ",
  ];
  return badEndings.some((s) => t.endsWith(s));
}

function createClient(settings: AppSettings) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");

  return createOpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Found-U Agent Test",
    },
    fetch: createOpenRouterInjectingFetch(settings),
  });
}

async function probeDirect(
  scenario: Scenario,
  prompt: string
): Promise<ProbeResult> {
  const settings = buildSettings(scenario.settings);
  const start = Date.now();
  const client = createClient(settings);
  const maxTokens = scenario.maxTokens ?? settings.agentMaxOutputTokens ?? 2048;

  try {
    if (scenario.stream) {
      const result = streamText({
        model: client.chat(MODEL),
        prompt,
        maxOutputTokens: maxTokens,
      });
      let text = "";
      let finishReason: string | undefined;
      for await (const chunk of result.fullStream) {
        if (chunk.type === "text-delta") text += chunk.text;
        if (chunk.type === "finish") finishReason = chunk.finishReason;
      }
      const usage = await result.usage;
      const textPreview = text.slice(0, 120).replace(/\n/g, " ");
      const truncated = looksTruncatedThai(text, finishReason);
      return {
        id: scenario.id,
        ok: text.length > 20 && !truncated && finishReason !== "length",
        finishReason,
        textLen: text.length,
        textPreview,
        textTail: text.slice(-80).replace(/\n/g, " "),
        fullText: text,
        looksTruncated: truncated,
        completionTokens: usage?.outputTokens,
        ms: Date.now() - start,
      };
    }

    const result = await generateText({
      model: client.chat(MODEL),
      prompt,
      maxOutputTokens: maxTokens,
    });

    const text = result.text;
    const usage = result.usage as {
      outputTokens?: number;
      reasoningTokens?: number;
    };

    const truncated = looksTruncatedThai(text, result.finishReason);
    return {
      id: scenario.id,
      ok:
        text.length > 20 &&
        !truncated &&
        result.finishReason !== "length",
      finishReason: result.finishReason,
      textLen: text.length,
      textPreview: text.slice(0, 120).replace(/\n/g, " "),
      textTail: text.slice(-80).replace(/\n/g, " "),
      fullText: text,
      looksTruncated: truncated,
      completionTokens: usage?.outputTokens,
      reasoningTokens: usage?.reasoningTokens,
      ms: Date.now() - start,
    };
  } catch (error) {
    return {
      id: scenario.id,
      ok: false,
      textLen: 0,
      textPreview: "",
      textTail: "",
      fullText: "",
      looksTruncated: true,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - start,
    };
  }
}

async function probeAgent(
  scenario: Scenario,
  prompt: string
): Promise<ProbeResult> {
  const settings = buildSettings({
    ...scenario.settings,
    agentProvider: "openrouter",
    agentMaxSteps: 2,
  });
  const start = Date.now();
  const client = createClient(settings);

  try {
    const agent = createFoundUAgent({
      model: client.chat(MODEL),
      settings,
      userId: "test-user",
      isAdmin: false,
    });

    let text = "";
    let finishReason: string | undefined;
    let errorMsg: string | undefined;

    const result = await agent.stream({ prompt });
    for await (const event of result.fullStream) {
      if (event.type === "text-delta") text += event.text;
      if (event.type === "finish") finishReason = event.finishReason;
      if (event.type === "error") {
        errorMsg =
          event.error instanceof Error
            ? event.error.message
            : String(event.error);
      }
    }

    const truncated = looksTruncatedThai(text, finishReason);
    return {
      id: `${scenario.id}-agent`,
      ok:
        !errorMsg &&
        text.length > 20 &&
        !truncated &&
        finishReason !== "length",
      finishReason,
      textLen: text.length,
      textPreview: text.slice(0, 120).replace(/\n/g, " "),
      textTail: text.slice(-80).replace(/\n/g, " "),
      fullText: text,
      looksTruncated: truncated,
      error: errorMsg,
      ms: Date.now() - start,
    };
  } catch (error) {
    return {
      id: `${scenario.id}-agent`,
      ok: false,
      textLen: 0,
      textPreview: "",
      textTail: "",
      fullText: "",
      looksTruncated: true,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - start,
    };
  }
}

function printResult(
  scenario: Scenario,
  result: ProbeResult,
  verbose: boolean
) {
  const status = result.ok ? "PASS" : "FAIL";
  console.log(
    `\n[${status}] ${scenario.label} (${result.ms}ms)`
  );
  console.log(`  finish: ${result.finishReason ?? "-"} | len: ${result.textLen}`);
  if (result.completionTokens != null) {
    console.log(
      `  tokens out: ${result.completionTokens}` +
        (result.reasoningTokens != null
          ? ` (reasoning: ${result.reasoningTokens})`
          : "")
    );
  }
  if (result.error) console.log(`  error: ${result.error.slice(0, 200)}`);
  if (result.looksTruncated) console.log(`  truncated: yes (heuristic)`);
  console.log(`  head: ${result.textPreview}`);
  console.log(`  tail: …${result.textTail}`);
  if (verbose && result.fullText) {
    console.log("  --- full text ---");
    console.log(result.fullText);
    console.log("  --- end ---");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const useAgent = args.includes("--agent");
  const verbose = args.includes("--verbose") || args.includes("-v");
  const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];
  const promptKey =
    (args.find((a) => a.startsWith("--prompt="))?.split("=")[1] as
      | keyof typeof PROMPTS
      | undefined) ?? "listItems";
  const prompt = PROMPTS[promptKey] ?? PROMPTS.listItems;

  let scenarios = SCENARIOS;
  if (only) {
    scenarios = SCENARIOS.filter((s) => s.id === only || s.id.includes(only));
    if (scenarios.length === 0) {
      console.error(`No scenario matching --only=${only}`);
      process.exit(1);
    }
  }

  console.log("=".repeat(72));
  console.log("Found-U OpenRouter Response Completeness Test");
  console.log(`Model: ${MODEL}`);
  console.log(`Prompt: ${prompt}`);
  console.log(`Mode: ${useAgent ? "ToolLoopAgent" : "generateText/streamText"}`);
  console.log("=".repeat(72));

  const results: Array<{ scenario: Scenario; result: ProbeResult }> = [];

  for (const scenario of scenarios) {
    const result = useAgent
      ? await probeAgent(scenario, prompt)
      : await probeDirect(scenario, prompt);
    results.push({ scenario, result });
    printResult(scenario, result, verbose);
  }

  const passed = results.filter((r) => r.result.ok);
  console.log("\n" + "=".repeat(72));
  console.log(`SUMMARY: ${passed.length}/${results.length} passed`);
  if (passed.length > 0) {
    console.log("\nRecommended scenarios:");
    for (const { scenario, result } of passed) {
      console.log(`  - ${scenario.id} (${result.ms}ms, len=${result.textLen})`);
    }
  } else {
    console.log("\nNo scenario passed. Check API key, model, or provider availability.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
