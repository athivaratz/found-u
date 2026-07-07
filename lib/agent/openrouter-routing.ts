import {
  AGENT_DEFAULT_MAX_OUTPUT_TOKENS,
  type AppSettings,
} from "@/lib/types";

const FLAKY_OPENROUTER_PROVIDER_PREFIXES = ["baidu/"] as const;
const MIN_AGENT_OUTPUT_TOKENS = 1024;

export type OpenRouterReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type OpenRouterProviderSort = "price" | "throughput" | "latency";

/** OpenRouter `provider` object injected into chat completion requests. */
export type OpenRouterProviderRouting = {
  order?: string[];
  only?: string[];
  ignore?: string[];
  allow_fallbacks?: boolean;
  sort?: OpenRouterProviderSort;
  require_parameters?: boolean;
};

export type OpenRouterRequestExtras = {
  provider?: OpenRouterProviderRouting;
  reasoning?: { effort: OpenRouterReasoningEffort };
};

function isFlakyOpenRouterProvider(slug: string): boolean {
  return FLAKY_OPENROUTER_PROVIDER_PREFIXES.some((prefix) =>
    slug.startsWith(prefix)
  );
}

/**
 * Apply verified OpenRouter agent defaults on top of DB/admin settings.
 * Fixes reasoning burn, low max_tokens, and brittle single-provider locks.
 */
export function normalizeOpenRouterAgentSettings(
  settings: AppSettings
): AppSettings {
  if (settings.agentProvider !== "openrouter") return settings;

  const next: AppSettings = { ...settings };

  const effort = settings.agentOpenRouterReasoningEffort;
  if (effort !== "none") {
    next.agentOpenRouterReasoningEffort = "none";
  }

  const maxOut = settings.agentMaxOutputTokens;
  if (maxOut == null || maxOut < MIN_AGENT_OUTPUT_TOKENS) {
    next.agentMaxOutputTokens = AGENT_DEFAULT_MAX_OUTPUT_TOKENS;
  }

  const order = (settings.agentOpenRouterProviderOrder ?? []).filter(Boolean);
  const lock = settings.agentOpenRouterLockProvider ?? false;
  if (
    lock &&
    order.length > 0 &&
    order.every((slug) => isFlakyOpenRouterProvider(slug))
  ) {
    next.agentOpenRouterLockProvider = false;
    next.agentOpenRouterAllowFallbacks = true;
    if (!next.agentOpenRouterProviderSort) {
      next.agentOpenRouterProviderSort = "latency";
    }
  }

  return next;
}

export function parseOpenRouterModelId(
  modelId: string
): { author: string; slug: string } | null {
  const trimmed = modelId.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) return null;
  return {
    author: trimmed.slice(0, slash),
    slug: trimmed.slice(slash + 1),
  };
}

export function buildOpenRouterRequestExtras(
  settings: AppSettings
): OpenRouterRequestExtras | undefined {
  const extras: OpenRouterRequestExtras = {};
  const provider = buildOpenRouterProviderRouting(settings);
  if (provider) extras.provider = provider;

  const effort = settings.agentOpenRouterReasoningEffort;
  if (effort && effort !== "none") {
    extras.reasoning = { effort };
  } else if (effort === "none") {
    extras.reasoning = { effort: "none" };
  }

  return Object.keys(extras).length > 0 ? extras : undefined;
}

export function buildOpenRouterProviderRouting(
  settings: AppSettings
): OpenRouterProviderRouting | undefined {
  const lock = settings.agentOpenRouterLockProvider ?? false;
  const order = (settings.agentOpenRouterProviderOrder ?? []).filter(Boolean);
  const ignore = (settings.agentOpenRouterProviderIgnore ?? []).filter(Boolean);
  const allowFallbacks = settings.agentOpenRouterAllowFallbacks;

  if (!lock && order.length === 0 && ignore.length === 0) {
    const sort = settings.agentOpenRouterProviderSort;
    return sort ? { sort } : undefined;
  }

  const routing: OpenRouterProviderRouting = {};

  if (order.length > 0) {
    routing.order = order;
    if (lock) {
      routing.only = order;
    }
  }

  if (ignore.length > 0) {
    routing.ignore = ignore;
  }

  if (lock) {
    routing.allow_fallbacks = allowFallbacks ?? false;
  } else if (typeof allowFallbacks === "boolean") {
    routing.allow_fallbacks = allowFallbacks;
  }

  const sort = settings.agentOpenRouterProviderSort;
  if (!lock && sort && order.length === 0) {
    routing.sort = sort;
  }

  return Object.keys(routing).length > 0 ? routing : undefined;
}

/** Merge OpenRouter-specific fields into an OpenAI-compatible request body. */
export function mergeOpenRouterIntoRequestBody(
  body: Record<string, unknown>,
  settings: AppSettings
): Record<string, unknown> {
  const extras = buildOpenRouterRequestExtras(settings);
  if (!extras) return body;

  const merged = { ...body };
  if (extras.provider) {
    merged.provider = extras.provider;
  }
  if (extras.reasoning) {
    merged.reasoning = extras.reasoning;
  }
  return merged;
}

async function readFetchBody(body: BodyInit): Promise<string | null> {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(body));
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return await body.text();
  }
  if (body instanceof ReadableStream) {
    return await new Response(body).text();
  }
  return null;
}

function headersWithoutContentLength(
  headers: HeadersInit | undefined
): Headers {
  const next = new Headers(headers);
  next.delete("content-length");
  return next;
}

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function shouldInjectOpenRouterRouting(url: string): boolean {
  return url.includes("openrouter.ai") && url.includes("/chat/completions");
}

export function createOpenRouterInjectingFetch(
  settings: AppSettings
): typeof fetch {
  const baseFetch = globalThis.fetch.bind(globalThis);

  return async (input, init) => {
    const url = resolveFetchUrl(input);
    if (!shouldInjectOpenRouterRouting(url)) {
      return baseFetch(input, init);
    }

    const request = input instanceof Request ? input : null;
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();

    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return baseFetch(input, init);
    }

    const rawBody = init?.body ?? request?.body;
    if (!rawBody) {
      return baseFetch(input, init);
    }

    try {
      const raw = await readFetchBody(rawBody);
      if (!raw) return baseFetch(input, init);

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const merged = mergeOpenRouterIntoRequestBody(parsed, settings);
      const nextBody = JSON.stringify(merged);
      const headers = headersWithoutContentLength(
        init?.headers ?? request?.headers
      );

      if (request && !init) {
        return baseFetch(url, {
          method: request.method,
          headers,
          body: nextBody,
          redirect: request.redirect,
          signal: request.signal,
          credentials: request.credentials,
          cache: request.cache,
          mode: request.mode,
        });
      }

      return baseFetch(input, {
        ...init,
        headers,
        body: nextBody,
      });
    } catch {
      return baseFetch(input, init);
    }
  };
}
