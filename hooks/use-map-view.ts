"use client";

import { useEffect, useMemo, useState } from "react";
import type { GeoPoint, LocationCoords } from "@/lib/types";
import { getCurrentPosition, resolveMapView, type MapViewTarget } from "@/lib/map-utils";

type UseMapViewOptions = {
  enabled?: boolean;
  fallbackCenter: GeoPoint;
  fallbackZoom: number;
  polygon?: GeoPoint[];
  marker?: GeoPoint | null;
  /** Fit school polygon instead of jumping to user (admin boundary editor) */
  preferPolygonFit?: boolean;
  /** Try browser geolocation on mount */
  locateUser?: boolean;
};

export function useMapView({
  enabled = true,
  fallbackCenter,
  fallbackZoom,
  polygon,
  marker,
  preferPolygonFit = false,
  locateUser = true,
}: UseMapViewOptions) {
  const [userLocation, setUserLocation] = useState<LocationCoords | null>(null);
  const shouldLocate = enabled && locateUser && !preferPolygonFit;
  const [locating, setLocating] = useState(shouldLocate);

  useEffect(() => {
    setLocating(shouldLocate);
  }, [shouldLocate]);

  useEffect(() => {
    if (!shouldLocate) return;

    let cancelled = false;

    void getCurrentPosition((coords) => {
      if (!cancelled) setUserLocation(coords);
    }).then((coords) => {
      if (cancelled) return;
      if (coords) setUserLocation(coords);
      setLocating(false);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldLocate]);

  const activeLocating = shouldLocate && locating;

  const view: MapViewTarget = useMemo(
    () =>
      resolveMapView({
        fallbackCenter,
        fallbackZoom,
        polygon,
        marker,
        userLocation,
        preferPolygonFit,
      }),
    [fallbackCenter, fallbackZoom, polygon, marker, userLocation, preferPolygonFit]
  );

  return {
    userLocation,
    locating: activeLocating,
    center: view.center,
    zoom: view.zoom,
    fitPoints: view.fitPoints,
    setUserLocation,
  };
}
