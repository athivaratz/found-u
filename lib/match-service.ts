import { apiFetch, ApiError } from "@/lib/api-client";
import { getMatchConfidence, type MatchScore } from "@/lib/matching";
import type { AppSettings, FoundItem, LostItem } from "@/lib/types";
import { coerceAppSettings } from "@/lib/database";

export type MatchAiConfig = {
  model?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
};

export type FormattedMatch = MatchScore & {
  key: string;
  confidence: "high" | "medium" | "low";
  scorePercentage: number;
};

type MatchBody = {
  matches?: FormattedMatch[];
  pool?: { lost: number; found: number; highConfidence: number };
  history?: Array<{
    key: string;
    lostItem: LostItem;
    foundItem: FoundItem;
    matchedAt: string;
  }>;
};

function asMatches(rows: FormattedMatch[] | undefined): FormattedMatch[] {
  return (rows ?? []).map((match) => ({
    ...match,
    key: match.key || `${match.lostItem?.id}_${match.foundItem?.id}`,
    confidence: match.confidence || getMatchConfidence(match.score),
    scorePercentage: match.scorePercentage ?? Math.round((match.score || 0) * 100),
  }));
}

export async function getAppSettingsAdmin(): Promise<AppSettings> {
  const body = await apiFetch<{ settings?: Record<string, unknown> }>("/api/settings");
  return coerceAppSettings(body.settings ?? {});
}

export async function loadMatchableLostItems(): Promise<LostItem[]> {
  const body = await apiFetch<{ items?: LostItem[] }>("/api/lost-items?status=searching");
  return body.items ?? [];
}

export async function loadMatchableFoundItems(): Promise<FoundItem[]> {
  const body = await apiFetch<{ items?: FoundItem[] }>("/api/found-items");
  return body.items ?? [];
}

export async function suggestForItem(options: {
  type: "lost" | "found";
  itemId: string;
  useAI?: boolean;
  settings?: AppSettings | null;
}): Promise<FormattedMatch[]> {
  void options.settings;
  const body = await apiFetch<MatchBody>("/api/match", {
    method: "POST",
    json: {
      type: options.type,
      itemId: options.itemId,
      useAI: Boolean(options.useAI),
    },
  });
  return asMatches(body.matches);
}

export async function suggestAll(options?: {
  useAI?: boolean;
  settings?: AppSettings | null;
}): Promise<{
  matches: FormattedMatch[];
  pool: { lost: number; found: number; highConfidence: number };
}> {
  void options?.settings;
  const body = await apiFetch<MatchBody>("/api/match/batch", {
    method: "POST",
    json: { useAI: Boolean(options?.useAI) },
  });
  const matches = asMatches(body.matches);
  return {
    matches,
    pool: body.pool ?? {
      lost: 0,
      found: 0,
      highConfidence: matches.filter((m) => m.confidence === "high").length,
    },
  };
}

export type ConfirmMatchResult =
  | { ok: true; lostId: string; foundId: string }
  | { ok: false; error: string };

async function mutate(
  path: string,
  lostId: string,
  foundId: string
): Promise<ConfirmMatchResult> {
  try {
    await apiFetch(path, { method: "POST", json: { lostId, foundId } });
    return { ok: true, lostId, foundId };
  } catch (error) {
    const message = error instanceof ApiError ? error.code : "request_failed";
    return { ok: false, error: message };
  }
}

export function confirmMatch(lostId: string, foundId: string): Promise<ConfirmMatchResult> {
  return mutate("/api/match/confirm", lostId, foundId);
}

export function unmatchPair(lostId: string, foundId: string): Promise<ConfirmMatchResult> {
  return mutate("/api/match/unmatch", lostId, foundId);
}

export async function rejectPair(
  lostId: string,
  foundId: string,
  _dismissedBy?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await mutate("/api/match/reject", lostId, foundId);
  return result.ok ? { ok: true } : result;
}

export type ConfirmedMatchPair = {
  key: string;
  lostItem: LostItem;
  foundItem: FoundItem;
  matchedAt: Date;
};

export async function listConfirmedMatches(limit = 50): Promise<ConfirmedMatchPair[]> {
  const body = await apiFetch<MatchBody>(`/api/match/batch?limit=${limit}`);
  return (body.history ?? []).map((row) => ({
    key: row.key,
    lostItem: row.lostItem,
    foundItem: row.foundItem,
    matchedAt: new Date(row.matchedAt),
  }));
}

export function serializeMatchForJson(match: FormattedMatch) {
  return {
    key: match.key,
    score: match.score,
    scorePercentage: match.scorePercentage,
    confidence: match.confidence,
    reasons: match.reasons,
    lostItem: match.lostItem,
    foundItem: match.foundItem,
  };
}
