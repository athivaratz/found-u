export type { ItemSearchType, SearchItemsParams, SearchItemsResult, SearchMode } from "./types";
export {
  normalizeSearchQuery,
  sanitizeSearchQuery,
  isTrackingCodeQuery,
  escapeIlike,
} from "./query-normalize";
export {
  resolveSimilarityThreshold,
  resolveAgentSimilarityThreshold,
  isTrgmSearchEnabled,
  shouldUseTrgmForQuery,
} from "./trgm-config";
export {
  parseSearchQuery,
  locationMatchesQuery,
  filterLostByLocationRelevance,
  filterFoundByLocationRelevance,
  filterSearchResultsByRelevance,
} from "./relevance";
export { searchItemsFuzzy } from "./fuzzy-search";
export { searchItemsIlike } from "./ilike-search";
