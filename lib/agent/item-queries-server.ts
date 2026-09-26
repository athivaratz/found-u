import { createClient } from "@/lib/supabase/server";
import type { FoundItem, LostItem } from "@/lib/types";
import { mapFoundItemRow, mapLostItemRow } from "@/lib/agent/row-mappers";
import {
  searchItemsFuzzy,
  type ItemSearchType,
  type SearchItemsParams,
} from "@/lib/search";

export type { ItemSearchType, SearchItemsParams };

const DEFAULT_LIMIT = 10;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, 10);
}

export async function searchItemsServer(
  params: SearchItemsParams
): Promise<{ lost: LostItem[]; found: FoundItem[]; filteredCount?: number }> {
  const supabase = await createClient();
  return searchItemsFuzzy(supabase, params);
}

export async function listLostItemsPrivateServer(): Promise<LostItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("read_lost_items_private");
  if (error) throw error;
  return (data ?? []).map((row) => mapLostItemRow(row as Record<string, unknown>));
}

export async function listFoundItemsPrivateServer(): Promise<FoundItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("read_found_items_private");
  if (error) throw error;
  return (data ?? []).map((row) => mapFoundItemRow(row as Record<string, unknown>));
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
  const publicItem = mapLostItemRow(data as Record<string, unknown>);
  try {
    const privateItems = await listLostItemsPrivateServer();
    return privateItems.find((item) => item.id === publicItem.id) ?? publicItem;
  } catch {
    return publicItem;
  }
}

export async function getUserLostItemsServer(
  userId: string,
  limit = 10
): Promise<LostItem[]> {
  const items = await listLostItemsPrivateServer();
  return items.filter((item) => item.userId === userId).slice(0, clampLimit(limit));
}

export async function getUserFoundItemsServer(
  userId: string,
  limit = 10
): Promise<FoundItem[]> {
  const items = await listFoundItemsPrivateServer();
  return items.filter((item) => item.userId === userId).slice(0, clampLimit(limit));
}

export async function getLostItemByIdServer(id: string): Promise<LostItem | null> {
  try {
    const privateItems = await listLostItemsPrivateServer();
    const owned = privateItems.find((item) => item.id === id);
    if (owned) return owned;
  } catch {
    // Public row still answers "does this item exist?" without owner fields.
  }

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
  try {
    const privateItems = await listFoundItemsPrivateServer();
    const owned = privateItems.find((item) => item.id === id);
    if (owned) return owned;
  } catch {
    // Public row still answers "does this item exist?" without owner fields.
  }

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
