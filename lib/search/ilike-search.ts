import type { SupabaseClient } from "@supabase/supabase-js";
import type { FoundItem, LostItem } from "@/lib/types";
import { mapFoundItemRow, mapLostItemRow } from "@/lib/agent/row-mappers";
import { escapeIlike } from "./query-normalize";
import type { SearchItemsParams } from "./types";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 10;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

export async function searchItemsIlike(
  supabase: SupabaseClient,
  params: SearchItemsParams
): Promise<{ lost: LostItem[]; found: FoundItem[] }> {
  const limit = clampLimit(params.limit);
  const q = params.query.trim();
  const pattern = q ? `%${escapeIlike(q)}%` : null;

  const lost: LostItem[] = [];
  const found: FoundItem[] = [];

  if (params.type !== "found") {
    let lostQuery = supabase
      .from("lost_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (params.status) lostQuery = lostQuery.eq("status", params.status);
    if (params.category) lostQuery = lostQuery.eq("category", params.category);
    if (pattern) {
      lostQuery = lostQuery.or(
        `item_name.ilike.${pattern},description.ilike.${pattern},location_lost.ilike.${pattern},tracking_code.ilike.${pattern}`
      );
    }

    const { data, error } = await lostQuery.limit(limit);
    if (error) throw error;
    for (const row of data || []) {
      lost.push(mapLostItemRow(row as Record<string, unknown>));
    }
  }

  if (params.type !== "lost") {
    let foundQuery = supabase
      .from("found_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (params.status) foundQuery = foundQuery.eq("status", params.status);
    if (params.category) foundQuery = foundQuery.eq("category", params.category);
    if (pattern) {
      foundQuery = foundQuery.or(
        `item_name.ilike.${pattern},description.ilike.${pattern},location_found.ilike.${pattern},tracking_code.ilike.${pattern}`
      );
    }

    const { data, error } = await foundQuery.limit(limit);
    if (error) throw error;
    for (const row of data || []) {
      found.push(mapFoundItemRow(row as Record<string, unknown>));
    }
  }

  return { lost, found };
}
