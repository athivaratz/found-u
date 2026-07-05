export const AGENT_FALLBACK_ROUTES = [
  { href: "/list", labelKey: "list" as const },
  { href: "/tracking", labelKey: "tracking" as const },
  { href: "/lost", labelKey: "lost" as const },
  { href: "/found", labelKey: "found" as const },
];

export type AgentFallbackPayload = {
  fallback: true;
  reason: "rate_limit" | "provider_error" | "timeout" | "unknown";
  message: string;
  suggestedRoutes: typeof AGENT_FALLBACK_ROUTES;
};

export function isProviderError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; message?: string; name?: string };
  if (e.status === 429 || (e.status !== undefined && e.status >= 500)) return true;
  const msg = (e.message || "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("resource exhausted") ||
    msg.includes("timeout") ||
    msg.includes("overloaded") ||
    msg.includes("503") ||
    msg.includes("429")
  );
}

export function buildFallbackPayload(
  reason: AgentFallbackPayload["reason"],
  message: string
): AgentFallbackPayload {
  return {
    fallback: true,
    reason,
    message,
    suggestedRoutes: AGENT_FALLBACK_ROUTES,
  };
}
