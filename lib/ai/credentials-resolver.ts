// AI keys that used to live in the wizard database are sodium ciphertext in
// PHP now. P8 reads them on the server. This process only sees env.

export type ResolvedAiCredentials = {
  geminiApiKey?: string;
  openrouterApiKey?: string;
  openrouterModel?: string;
  provider: "gemini" | "openrouter" | "auto" | "none";
  source: "database" | "env" | "none";
};

const CACHE_TTL_MS = 45_000;

let cached: { value: ResolvedAiCredentials; expiresAt: number } | null = null;

function resolveFromEnv(): ResolvedAiCredentials {
  const geminiApiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GEMMA_API_KEY?.trim() || undefined;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY?.trim() || undefined;
  const openrouterModel =
    process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.0-flash-exp:free";

  if (geminiApiKey || openrouterApiKey) {
    return {
      geminiApiKey,
      openrouterApiKey,
      openrouterModel,
      provider: geminiApiKey && openrouterApiKey ? "auto" : geminiApiKey ? "gemini" : "openrouter",
      source: "env",
    };
  }

  return {
    provider: "none",
    source: "none",
  };
}

export async function resolveAiCredentials(): Promise<ResolvedAiCredentials> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const resolved = resolveFromEnv();
  cached = { value: resolved, expiresAt: now + CACHE_TTL_MS };
  return resolved;
}

export function clearAiCredentialsCache(): void {
  cached = null;
}

export function getGeminiApiKey(credentials: ResolvedAiCredentials): string | undefined {
  return credentials.geminiApiKey;
}

export function getOpenRouterApiKey(credentials: ResolvedAiCredentials): string | undefined {
  return credentials.openrouterApiKey;
}

export function getOpenRouterModel(credentials: ResolvedAiCredentials): string {
  return credentials.openrouterModel || "google/gemini-2.0-flash-exp:free";
}
