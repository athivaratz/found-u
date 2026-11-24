import { apiFetch } from "@/lib/api-client";
import type { FoundItem, LostItem } from "@/lib/types";

export type AdminMatchPair = {
  key: string;
  score: number;
  scorePercentage: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  lostItem: LostItem;
  foundItem: FoundItem;
};

export type ConfirmedHistoryPair = {
  key: string;
  lostItem: LostItem;
  foundItem: FoundItem;
  matchedAt: string | Date;
};

export type MatchBatchResponse = {
  matches: AdminMatchPair[];
  total: number;
  pool: { lost: number; found: number; highConfidence: number };
  useAI: boolean;
  history: ConfirmedHistoryPair[];
};

export async function fetchMatchBatch(
  getToken: () => Promise<string>,
  options?: { useAI?: boolean }
): Promise<MatchBatchResponse> {
  void getToken;
  return apiFetch<MatchBatchResponse>("/api/match/batch", {
    method: "POST",
    json: { useAI: Boolean(options?.useAI), includeHistory: true },
  });
}

export async function fetchItemMatches(
  getToken: () => Promise<string>,
  type: "lost" | "found",
  itemId: string,
  useAI = false
): Promise<AdminMatchPair[]> {
  void getToken;
  const data = await apiFetch<{ matches?: AdminMatchPair[] }>("/api/match", {
    method: "POST",
    json: { type, itemId, useAI },
  });
  return data.matches || [];
}

export async function confirmMatchApi(
  getToken: () => Promise<string>,
  lostId: string,
  foundId: string
): Promise<void> {
  void getToken;
  await apiFetch("/api/match/confirm", { method: "POST", json: { lostId, foundId } });
}

export async function rejectMatchApi(
  getToken: () => Promise<string>,
  lostId: string,
  foundId: string
): Promise<void> {
  void getToken;
  await apiFetch("/api/match/reject", { method: "POST", json: { lostId, foundId } });
}

export async function unmatchPairApi(
  getToken: () => Promise<string>,
  lostId: string,
  foundId: string
): Promise<void> {
  void getToken;
  await apiFetch("/api/match/unmatch", { method: "POST", json: { lostId, foundId } });
}
