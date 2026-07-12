import type { FoundItem, ItemStatus, LostItem } from "@/lib/types";

export type ItemSearchType = "lost" | "found" | "all";
export type SearchMode = "agent" | "catalog";

export interface SearchItemsParams {
  query: string;
  type?: ItemSearchType;
  category?: string;
  status?: ItemStatus;
  limit?: number;
  similarityThreshold?: number;
  mode?: SearchMode;
}

export interface SearchItemsResult {
  lost: LostItem[];
  found: FoundItem[];
}
