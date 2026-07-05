const DEFAULT_THRESHOLD = 0.15;
const DEFAULT_AGENT_THRESHOLD = 0.3;
const MIN_QUERY_LENGTH_FOR_TRGM = 2;

export function resolveSimilarityThreshold(override?: number): number {
  if (override !== undefined && !Number.isNaN(override)) {
    return override;
  }
  const env = process.env.SEARCH_SIMILARITY_THRESHOLD;
  if (env) {
    const parsed = Number(env);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return DEFAULT_THRESHOLD;
}

export function resolveAgentSimilarityThreshold(override?: number): number {
  if (override !== undefined && !Number.isNaN(override)) {
    return override;
  }
  const env = process.env.AGENT_SEARCH_SIMILARITY_THRESHOLD;
  if (env) {
    const parsed = Number(env);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return DEFAULT_AGENT_THRESHOLD;
}

export function isTrgmSearchEnabled(): boolean {
  return process.env.SEARCH_USE_TRGM !== "false";
}

export function shouldUseTrgmForQuery(query: string): boolean {
  return query.length >= MIN_QUERY_LENGTH_FOR_TRGM;
}

export const TRACKING_CODE_PREFIX_RE = /^(LOST|FOUND)-/i;
