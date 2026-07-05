import { createClient } from "@/lib/supabase/server";
import type { FoundItem, ItemStatus, LostItem } from "@/lib/types";
import { mapFoundItemRow, mapLostItemRow } from "@/lib/agent/row-mappers";

export type ItemSearchType = "lost" | "found" | "all";

export interface SearchItemsParams {
  query: string;
  type?: ItemSearchType;
  category?: string;
  status?: ItemStatus;
  limit?: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 10;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function sanitizeSearchQuery(value: string): string {
  return value.replace(/,/g, " ").trim();
}

function escapeIlike(value: string): string {
  return sanitizeSearchQuery(value).replace(/[%_\\]/g, "\\$&");
}

export async function searchItemsServer(
  params: SearchItemsParams
): Promise<{ lost: LostItem[]; found: FoundItem[] }> {
  const supabase = await createClient();
  const limit = clampLimit(params.limit);
  const q = params.query.trim();
  const pattern = q ? `%${escapeIlike(q)}%` : null;

  const lost: LostItem[] = [];
  const found: FoundItem[] = [];

  if (params.type !== "found") {
    let lostQuery = supabase.from("lost_items").select("*").order("created_at", { ascending: false });

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
    let foundQuery = supabase.from("found_items").select("*").order("created_at", { ascending: false });

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

export async function getLostItemByTrackingCodeServer(
  trackingCode: string
): Promise<LostItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lost_items")
    .select("*")
    .eq("tracking_code", trackingCode.toUpperCase())
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapLostItemRow(data as Record<string, unknown>);
}

export async function getUserLostItemsServer(
  userId: string,
  limit = 10
): Promise<LostItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lost_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(limit));

  if (error) throw error;
  return (data || []).map((row) => mapLostItemRow(row as Record<string, unknown>));
}

export async function getUserFoundItemsServer(
  userId: string,
  limit = 10
): Promise<FoundItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("found_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(limit));

  if (error) throw error;
  return (data || []).map((row) => mapFoundItemRow(row as Record<string, unknown>));
}

export async function getLostItemByIdServer(id: string): Promise<LostItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lost_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapLostItemRow(data as Record<string, unknown>);
}

export async function getFoundItemByIdServer(id: string): Promise<FoundItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("found_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapFoundItemRow(data as Record<string, unknown>);
}
