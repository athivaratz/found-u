import type { SupabaseClient } from "@supabase/supabase-js";
import type { FoundItem, LostItem } from "@/lib/types";
import { mapFoundItemRow, mapLostItemRow } from "@/lib/agent/row-mappers";
import { searchItemsIlike } from "./ilike-search";
import { normalizeSearchQuery } from "./query-normalize";
import { filterSearchResultsByRelevance } from "./relevance";
import {
  isTrgmSearchEnabled,
  resolveAgentSimilarityThreshold,
  resolveSimilarityThreshold,
  shouldUseTrgmForQuery,
} from "./trgm-config";
import type { SearchItemsParams } from "./types";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 10;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

async function searchLostFuzzy(
  supabase: SupabaseClient,
  params: SearchItemsParams,
  query: string,
  threshold: number,
  limit: number
): Promise<LostItem[]> {
  const { data, error } = await supabase.rpc("search_lost_items_fuzzy", {
    p_query: query,
    p_category: params.category ?? null,
    p_status: params.status ?? null,
    p_limit: limit,
    p_threshold: threshold,
  });

  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) =>
    mapLostItemRow(row)
  );
}

async function searchFoundFuzzy(
  supabase: SupabaseClient,
  params: SearchItemsParams,
  query: string,
  threshold: number,
  limit: number
): Promise<FoundItem[]> {
  const { data, error } = await supabase.rpc("search_found_items_fuzzy", {
    p_query: query,
    p_category: params.category ?? null,
    p_status: params.status ?? null,
    p_limit: limit,
    p_threshold: threshold,
  });

  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) =>
    mapFoundItemRow(row)
  );
}

export async function searchItemsFuzzy(
  supabase: SupabaseClient,
  params: SearchItemsParams
): Promise<{ lost: LostItem[]; found: FoundItem[]; filteredCount?: number }> {
  const limit = clampLimit(params.limit);
  const query = normalizeSearchQuery(params.query);
  const mode = params.mode ?? "catalog";
  const threshold =
    mode === "agent"
      ? resolveAgentSimilarityThreshold(params.similarityThreshold)
      : resolveSimilarityThreshold(params.similarityThreshold);

  if (!query) {
    const empty = await searchItemsIlike(supabase, { ...params, query: "" });
    return { ...empty, filteredCount: 0 };
  }

  const useTrgm =
    isTrgmSearchEnabled() && shouldUseTrgmForQuery(query);

  let results: { lost: LostItem[]; found: FoundItem[] };

  if (!useTrgm) {
    results = await searchItemsIlike(supabase, params);
  } else {
    try {
      const lost: LostItem[] = [];
      const found: FoundItem[] = [];

      if (params.type !== "found") {
        lost.push(
          ...(await searchLostFuzzy(supabase, params, query, threshold, limit))
        );
      }

      if (params.type !== "lost") {
        found.push(
          ...(await searchFoundFuzzy(supabase, params, query, threshold, limit))
        );
      }

      results = { lost, found };
    } catch (error) {
      console.warn("[search] trgm RPC failed, falling back to ilike", error);
      results = await searchItemsIlike(supabase, params);
    }
  }

  const filtered = filterSearchResultsByRelevance(results, query, mode);
  return {
    lost: filtered.lost,
    found: filtered.found,
    filteredCount: filtered.filteredCount,
  };
}
