import {
  parseOpenRouterModelId,
  type OpenRouterRequestExtras,
} from "@/lib/agent/openrouter-routing";

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

export type OpenRouterEndpointInfo = {
  slug: string;
  name: string;
  status?: string;
  contextLength?: number;
  maxCompletionTokens?: number | null;
  pricingPrompt?: string;
  pricingCompletion?: string;
  uptimeLast30m?: number | null;
  supportedParameters?: string[];
};

function openRouterHeaders(): HeadersInit {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    "X-Title": "Found-U Agent",
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickProviderSlug(endpoint: Record<string, unknown>): string {
  const slug =
    endpoint.provider_slug ??
    endpoint.providerSlug ??
    endpoint.slug ??
    endpoint.tag;
  if (typeof slug === "string" && slug.trim()) {
    return slug.trim();
  }
  const name = endpoint.provider_name ?? endpoint.providerName ?? endpoint.name;
  if (typeof name === "string" && name.trim()) {
    return name.trim().toLowerCase().replace(/\s+/g, "-");
  }
  return "unknown";
}

function pickProviderName(endpoint: Record<string, unknown>, slug: string): string {
  const name = endpoint.provider_name ?? endpoint.providerName ?? endpoint.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return slug;
}

export function mapEndpointRow(endpoint: Record<string, unknown>): OpenRouterEndpointInfo {
  const slug = pickProviderSlug(endpoint);
  const pricing = asRecord(endpoint.pricing);
  const uptime = asRecord(endpoint.uptime_last_30m ?? endpoint.uptimeLast30m);

  return {
    slug,
    name: pickProviderName(endpoint, slug),
    status: typeof endpoint.status === "string" ? endpoint.status : undefined,
    contextLength:
      typeof endpoint.context_length === "number"
        ? endpoint.context_length
        : typeof endpoint.contextLength === "number"
          ? endpoint.contextLength
          : undefined,
    maxCompletionTokens:
      typeof endpoint.max_completion_tokens === "number"
        ? endpoint.max_completion_tokens
        : endpoint.max_completion_tokens === null
          ? null
          : undefined,
    pricingPrompt:
      typeof pricing?.prompt === "string" ? pricing.prompt : undefined,
    pricingCompletion:
      typeof pricing?.completion === "string" ? pricing.completion : undefined,
    uptimeLast30m:
      typeof uptime?.p50 === "number"
        ? uptime.p50
        : typeof endpoint.uptime_last_30m === "number"
          ? endpoint.uptime_last_30m
          : null,
    supportedParameters: Array.isArray(endpoint.supported_parameters)
      ? endpoint.supported_parameters.filter((p): p is string => typeof p === "string")
      : undefined,
  };
}

export async function fetchOpenRouterEndpoints(
  modelId: string
): Promise<{ modelId: string; endpoints: OpenRouterEndpointInfo[] }> {
  const parsed = parseOpenRouterModelId(modelId);
  if (!parsed) {
    throw new Error(`Invalid OpenRouter model id: ${modelId}`);
  }

  const url = `${OPENROUTER_API_BASE}/models/${encodeURIComponent(parsed.author)}/${encodeURIComponent(parsed.slug)}/endpoints`;
  const res = await fetch(url, { headers: openRouterHeaders(), cache: "no-store" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter endpoints ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { data?: Record<string, unknown> };
  const data = asRecord(json.data);
  const rawEndpoints = data?.endpoints;
  const endpoints = Array.isArray(rawEndpoints)
    ? rawEndpoints
        .map((row) => asRecord(row))
        .filter((row): row is Record<string, unknown> => row !== null)
        .map(mapEndpointRow)
    : [];

  return { modelId, endpoints };
}

export type OpenRouterProbeResult = {
  ok: boolean;
  model: string;
  text: string;
  finishReason?: string;
  nativeFinishReason?: string;
  provider?: string;
  generationId?: string;
  usage?: Record<string, unknown>;
  routing?: OpenRouterRequestExtras;
  error?: string;
};

export async function probeOpenRouterChat(options: {
  modelId: string;
  prompt: string;
  maxTokens?: number;
  extras?: OpenRouterRequestExtras;
}): Promise<OpenRouterProbeResult> {
  const body: Record<string, unknown> = {
    model: options.modelId,
    stream: false,
    max_tokens: options.maxTokens ?? 64,
    messages: [{ role: "user", content: options.prompt }],
  };

  if (options.extras?.provider) body.provider = options.extras.provider;
  if (options.extras?.reasoning) body.reasoning = options.extras.reasoning;

  const res = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      ...openRouterHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    const err = asRecord(json.error);
    return {
      ok: false,
      model: options.modelId,
      text: "",
      routing: options.extras,
      error:
        (typeof err?.message === "string" ? err.message : null) ||
        `HTTP ${res.status}`,
    };
  }

  const choice = Array.isArray(json.choices)
    ? asRecord(json.choices[0])
    : null;
  const message = choice ? asRecord(choice.message) : null;
  const text = typeof message?.content === "string" ? message.content : "";

  return {
    ok: true,
    model: typeof json.model === "string" ? json.model : options.modelId,
    text,
    finishReason:
      typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined,
    nativeFinishReason:
      typeof choice?.native_finish_reason === "string"
        ? choice.native_finish_reason
        : undefined,
    provider:
      typeof json.provider === "string"
        ? json.provider
        : typeof json.provider_name === "string"
          ? json.provider_name
          : undefined,
    generationId: typeof json.id === "string" ? json.id : undefined,
    usage: asRecord(json.usage) ?? undefined,
    routing: options.extras,
  };
}
