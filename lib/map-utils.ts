import type { GeoPoint, LocationCoords } from "@/lib/types";
import { getMapDisplayPosition } from "@/lib/geolocation";
import { normalizeGeoPolygon } from "@/lib/utils";

export type MapViewTarget = {
  center: GeoPoint;
  zoom: number;
  /** Points to pass to MapCanvas.fitPoints for fitBounds */
  fitPoints?: GeoPoint[];
};

export function getBoundsFromPoints(points: GeoPoint[]): {
  south: number;
  west: number;
  north: number;
  east: number;
} | null {
  if (!points.length) return null;

  let south = points[0].lat;
  let north = points[0].lat;
  let west = points[0].lng;
  let east = points[0].lng;

  for (const p of points) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }

  return { south, west, north, east };
}

export function getCenterFromBounds(bounds: {
  south: number;
  west: number;
  north: number;
  east: number;
}): GeoPoint {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  };
}

/** Rough zoom level from lat/lng span (for initial view before Leaflet fitBounds). */
export function estimateZoomForBounds(
  bounds: { south: number; west: number; north: number; east: number },
  maxZoom = 18
): number {
  const latSpan = Math.max(bounds.north - bounds.south, 0.0005);
  const lngSpan = Math.max(bounds.east - bounds.west, 0.0005);
  const span = Math.max(latSpan, lngSpan);

  if (span > 0.5) return Math.min(maxZoom, 10);
  if (span > 0.1) return Math.min(maxZoom, 12);
  if (span > 0.05) return Math.min(maxZoom, 14);
  if (span > 0.01) return Math.min(maxZoom, 16);
  return Math.min(maxZoom, 17);
}

export function mergeFitPoints(...groups: (GeoPoint[] | undefined | null)[]): GeoPoint[] {
  const seen = new Set<string>();
  const out: GeoPoint[] = [];

  for (const group of groups) {
    if (!group) continue;
    for (const p of group) {
      const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }

  return out;
}

export function resolveMapView(options: {
  fallbackCenter: GeoPoint;
  fallbackZoom: number;
  polygon?: GeoPoint[];
  marker?: GeoPoint | null;
  userLocation?: GeoPoint | null;
  /** Admin boundary editor: fit polygon first */
  preferPolygonFit?: boolean;
}): MapViewTarget {
  const polygon = normalizeGeoPolygon(options.polygon);
  const marker = options.marker ?? null;
  const user = options.userLocation ?? null;

  if (options.preferPolygonFit && polygon.length >= 3) {
    const bounds = getBoundsFromPoints(polygon)!;
    return {
      center: getCenterFromBounds(bounds),
      zoom: estimateZoomForBounds(bounds, options.fallbackZoom),
      fitPoints: polygon,
    };
  }

  const fitPoints = mergeFitPoints(
    polygon.length >= 3 ? polygon : undefined,
    marker ? [marker] : undefined,
    user ? [user] : undefined
  );

  if (fitPoints.length >= 2) {
    const bounds = getBoundsFromPoints(fitPoints)!;
    return {
      center: getCenterFromBounds(bounds),
      zoom: estimateZoomForBounds(bounds, options.fallbackZoom),
      fitPoints,
    };
  }

  if (user) {
    return { center: user, zoom: options.fallbackZoom };
  }

  if (marker) {
    return { center: marker, zoom: options.fallbackZoom };
  }

  if (polygon.length >= 3) {
    const bounds = getBoundsFromPoints(polygon)!;
    return {
      center: getCenterFromBounds(bounds),
      zoom: estimateZoomForBounds(bounds, options.fallbackZoom),
      fitPoints: polygon,
    };
  }

  return {
    center: options.fallbackCenter,
    zoom: options.fallbackZoom,
  };
}

export function getCurrentPosition(
  onProgress?: (coords: LocationCoords) => void
): Promise<LocationCoords | null> {
  return getMapDisplayPosition(onProgress);
}
