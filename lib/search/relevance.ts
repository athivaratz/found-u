import type { FoundItem, LostItem } from "@/lib/types";

const LOCATION_MARKERS = [
  "แถว",
  "บริเวณ",
  "ใกล้",
  "ข้าง",
  "หลัง",
  "หน้า",
  "ใน",
  "ชั้น",
  "ที่หาย",
  "ที่เจอ",
] as const;

const QUERY_NOISE_RE =
  /^(?:หา|ช่วยหา|ค้นหา|มี|ดู|เช็ค|เช็ก|อยากหา|อยากได้|หาสิ่งของ|ของหาย|ของเจอ)\s*/u;

export type ParsedSearchQuery = {
  itemTerms: string;
  locationTerms: string | null;
  raw: string;
};

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const raw = query.trim();
  if (!raw) {
    return { itemTerms: "", locationTerms: null, raw };
  }

  for (const marker of LOCATION_MARKERS) {
    const idx = raw.indexOf(marker);
    if (idx < 0) continue;

    const locationPart = raw.slice(idx + marker.length).trim();
    const itemPart = raw
      .slice(0, idx)
      .replace(QUERY_NOISE_RE, "")
      .replace(/ที่หาย|ที่เจอ/g, "")
      .trim();

    if (locationPart.length >= 2) {
      return {
        itemTerms: itemPart || raw.replace(QUERY_NOISE_RE, "").trim() || raw,
        locationTerms: locationPart,
        raw,
      };
    }
  }

  return {
    itemTerms: raw.replace(QUERY_NOISE_RE, "").trim() || raw,
    locationTerms: null,
    raw,
  };
}

export function locationMatchesQuery(
  location: string,
  locationTerms: string
): boolean {
  const loc = location.toLowerCase().trim();
  const terms = locationTerms.toLowerCase().trim();
  if (!loc || !terms) return false;
  if (loc.includes(terms) || terms.includes(loc)) return true;

  const tokens = terms.split(/\s+/).filter((t) => t.length >= 2);
  return tokens.some((token) => loc.includes(token));
}

function getLostLocation(item: LostItem): string {
  return [item.locationLost, item.locationPlaceName].filter(Boolean).join(" ");
}

function getFoundLocation(item: FoundItem): string {
  return [item.locationFound, item.locationPlaceName].filter(Boolean).join(" ");
}

export function filterLostByLocationRelevance(
  items: LostItem[],
  query: string
): LostItem[] {
  const { locationTerms } = parseSearchQuery(query);
  if (!locationTerms) return items;
  return items.filter((item) =>
    locationMatchesQuery(getLostLocation(item), locationTerms)
  );
}

export function filterFoundByLocationRelevance(
  items: FoundItem[],
  query: string
): FoundItem[] {
  const { locationTerms } = parseSearchQuery(query);
  if (!locationTerms) return items;
  return items.filter((item) =>
    locationMatchesQuery(getFoundLocation(item), locationTerms)
  );
}

export function filterSearchResultsByRelevance(
  results: { lost: LostItem[]; found: FoundItem[] },
  query: string,
  mode: "agent" | "catalog"
): { lost: LostItem[]; found: FoundItem[]; filteredCount: number } {
  if (mode !== "agent") {
    return { ...results, filteredCount: 0 };
  }

  const before = results.lost.length + results.found.length;
  const lost = filterLostByLocationRelevance(results.lost, query);
  const found = filterFoundByLocationRelevance(results.found, query);
  const after = lost.length + found.length;

  return {
    lost,
    found,
    filteredCount: Math.max(0, before - after),
  };
}
