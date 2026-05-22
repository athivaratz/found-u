"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import type { GeoPoint, LocationCoords } from "@/lib/types";

export type MapMode = "marker" | "polygon" | "view";

export interface MapMarker {
  id?: string;
  position: GeoPoint;
  label?: string;
  color?: string;
}

interface MapCanvasProps {
  center: GeoPoint;
  zoom: number;
  tileUrl: string;
  attribution?: string;
  mode?: MapMode;
  marker?: LocationCoords | null;
  onMarkerChange?: (coords: LocationCoords | null) => void;
  polygon?: GeoPoint[];
  onPolygonChange?: (points: GeoPoint[]) => void;
  markers?: MapMarker[];
  className?: string;
}

function createCircleMarker(position: GeoPoint, color = "#06C755") {
  return L.circleMarker([position.lat, position.lng], {
    radius: 8,
    weight: 2,
    color: "#ffffff",
    fillColor: color,
    fillOpacity: 1,
  });
}

export default function MapCanvas({
  center,
  zoom,
  tileUrl,
  attribution,
  mode = "marker",
  marker,
  onMarkerChange,
  polygon,
  onPolygonChange,
  markers,
  className,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const polygonRef = useRef<L.Polygon | null>(null);
  const polygonPointsRef = useRef<GeoPoint[]>(polygon || []);

  useEffect(() => {
    polygonPointsRef.current = polygon || [];
  }, [polygon]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    }).setView([center.lat, center.lng], zoom);

    mapRef.current = map;

    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution: attribution || "",
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [center.lat, center.lng, zoom, tileUrl, attribution]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([center.lat, center.lng], zoom);
  }, [center.lat, center.lng, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tileLayerRef.current) return;
    tileLayerRef.current.setUrl(tileUrl);
  }, [tileUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (event: L.LeafletMouseEvent) => {
      if (mode === "marker" && onMarkerChange) {
        onMarkerChange({
          lat: event.latlng.lat,
          lng: event.latlng.lng,
          source: "map",
        });
      }

      if (mode === "polygon" && onPolygonChange) {
        const nextPoints = [...(polygonPointsRef.current || []), {
          lat: event.latlng.lat,
          lng: event.latlng.lng,
        }];
        onPolygonChange(nextPoints);
      }
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [mode, onMarkerChange, onPolygonChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (marker && mode !== "view") {
      if (!markerRef.current) {
        markerRef.current = createCircleMarker(marker).addTo(map);
      } else {
        markerRef.current.setLatLng([marker.lat, marker.lng]);
      }
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [marker, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (polygon && polygon.length > 0) {
      const latlngs = polygon.map((p) => [p.lat, p.lng]) as L.LatLngExpression[];
      if (!polygonRef.current) {
        polygonRef.current = L.polygon(latlngs, {
          color: "#06C755",
          weight: 2,
          fillColor: "#06C755",
          fillOpacity: 0.15,
        }).addTo(map);
      } else {
        polygonRef.current.setLatLngs(latlngs);
      }
    } else if (polygonRef.current) {
      polygonRef.current.remove();
      polygonRef.current = null;
    }
  }, [polygon]);

  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    if (!markers || markers.length === 0) return;

    markers.forEach((item) => {
      const markerLayer = createCircleMarker(item.position, item.color || "#2563eb");
      if (item.label) {
        markerLayer.bindTooltip(item.label, { direction: "top" });
      }
      markerLayer.addTo(layer);
    });
  }, [markers]);

  return (
    <div
      ref={containerRef}
      className={cn("w-full rounded-2xl border border-gray-200 dark:border-gray-700", className)}
    />
  );
}
