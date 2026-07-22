import type { GeoPoint, MapZone } from "@/lib/types";
import { isPointInPolygon, normalizeGeoPolygon } from "@/lib/utils";

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/** Haversine distance in km (shared with matching pin bands). */
export function haversineKm(
  a: Pick<GeoPoint, "lat" | "lng">,
  b: Pick<GeoPoint, "lat" | "lng">
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinLng * sinLng;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function polygonCentroid(polygon: GeoPoint[]): GeoPoint | null {
  if (!polygon.length) return null;
  let lat = 0;
  let lng = 0;
  for (const p of polygon) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / polygon.length, lng: lng / polygon.length };
}

function normalizeAliasList(aliases: unknown): string[] | undefined {
  if (!Array.isArray(aliases)) return undefined;
  const cleaned = aliases
    .map((a) => (typeof a === "string" ? a.trim() : ""))
    .filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

export function normalizeMapZones(raw: unknown): MapZone[] {
  if (!Array.isArray(raw)) return [];

  const zones: MapZone[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!id || !name) continue;
    const polygon = normalizeGeoPolygon(row.polygon);
    const color =
      typeof row.color === "string" && row.color.trim() ? row.color.trim() : undefined;
    zones.push({
      id,
      name,
      aliases: normalizeAliasList(row.aliases),
      polygon,
      color,
    });
  }
  return zones;
}

function textMatchesZone(text: string, zone: MapZone): boolean {
  const hay = text.trim().toLowerCase();
  if (!hay) return false;
  if (hay.includes(zone.name.toLowerCase())) return true;
  return (zone.aliases ?? []).some((alias) => hay.includes(alias.toLowerCase()));
}

/**
 * Resolve a campus sub-zone from coords (preferred) or location text aliases.
 */
export function resolveMapZone(
  zones: MapZone[] | undefined,
  coords: GeoPoint | null | undefined,
  locationText?: string
): MapZone | null {
  if (!zones?.length) return null;

  if (coords) {
    for (const zone of zones) {
      if (zone.polygon.length >= 3 && isPointInPolygon(coords, zone.polygon)) {
        return zone;
      }
    }
  }

  if (locationText?.trim()) {
    for (const zone of zones) {
      if (textMatchesZone(locationText, zone)) return zone;
    }
  }

  return null;
}

export type ZoneRelationScore = {
  score: number;
  reason?: string;
};

/**
 * Zone contribution to location score.
 * Same zone 1.0 · adjacent centroids ≤150m 0.7 · different 0.25 · unknown → omit.
 */
export function zoneRelationScore(
  lostZone: MapZone | null,
  foundZone: MapZone | null
): ZoneRelationScore | null {
  if (!lostZone || !foundZone) return null;

  if (lostZone.id === foundZone.id) {
    return { score: 1, reason: `โซนเดียวกัน (${lostZone.name})` };
  }

  const lostCentroid = polygonCentroid(lostZone.polygon);
  const foundCentroid = polygonCentroid(foundZone.polygon);
  if (lostCentroid && foundCentroid) {
    const km = haversineKm(lostCentroid, foundCentroid);
    if (km <= 0.15) {
      return {
        score: 0.7,
        reason: `โซนข้างเคียง (${lostZone.name} / ${foundZone.name})`,
      };
    }
  }

  return {
    score: 0.25,
    reason: `คนละโซน (${lostZone.name} / ${foundZone.name})`,
  };
}
