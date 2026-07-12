import { tryDecryptSecret } from "@/lib/setup/credentials-crypto";
import { getAiCredentialsData } from "@/lib/setup/wizard-db";
import type { AiCredentialsData } from "@/lib/setup/schemas/setup-status";

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
  const geminiApiKey = process.env.GEMMA_API_KEY?.trim() || undefined;
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

function resolveFromDbRecord(record: AiCredentialsData): ResolvedAiCredentials {
  if (record.provider === "none") {
    return resolveFromEnv();
  }

  const geminiApiKey = tryDecryptSecret(record.gemini_api_key_encrypted);
  const openrouterApiKey = tryDecryptSecret(record.openrouter_api_key_encrypted);
  const openrouterModel =
    record.openrouter_model?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    "google/gemini-2.0-flash-exp:free";

  if (!geminiApiKey && !openrouterApiKey) {
    return resolveFromEnv();
  }

  return {
    geminiApiKey,
    openrouterApiKey,
    openrouterModel,
    provider: record.provider,
    source: "database",
  };
}

export async function resolveAiCredentials(): Promise<ResolvedAiCredentials> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const record = await getAiCredentialsData();
    const resolved = record ? resolveFromDbRecord(record) : resolveFromEnv();
    cached = { value: resolved, expiresAt: now + CACHE_TTL_MS };
    return resolved;
  } catch (error) {
    console.warn("[credentials-resolver] DB read failed, falling back to env:", error);
    const resolved = resolveFromEnv();
    cached = { value: resolved, expiresAt: now + CACHE_TTL_MS };
    return resolved;
  }
}

export function clearAiCredentialsCache(): void {
  cached = null;
}

export function getGeminiApiKey(credentials: ResolvedAiCredentials): string | undefined {
  return credentials.geminiApiKey ?? process.env.GEMMA_API_KEY?.trim();
}

export function getOpenRouterApiKey(credentials: ResolvedAiCredentials): string | undefined {
  return credentials.openrouterApiKey ?? process.env.OPENROUTER_API_KEY?.trim();
}

export function getOpenRouterModel(credentials: ResolvedAiCredentials): string {
  return (
    credentials.openrouterModel ||
    process.env.OPENROUTER_MODEL?.trim() ||
    "google/gemini-2.0-flash-exp:free"
  );
}
