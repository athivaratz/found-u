import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { GeoPoint } from "./types";

// Utility function สำหรับ merge Tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// สร้าง Tracking Code แบบสุ่ม
// type: 'lost' | 'found' - determines prefix (LOST- or FOUND-)
/** Public NFC tag ID for URLs and QR codes (12 chars, no ambiguous chars). */
export function generateNfcTagId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export function generateTrackingCode(type: 'lost' | 'found' = 'lost'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const prefix = type === 'found' ? 'FOUND-' : 'LOST-';
  let code = prefix;
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** Normalize Firestore Timestamp, plain objects, ISO strings, or epoch ms to Date. */
export function coerceToDate(value: unknown): Date {
  if (value == null) return new Date();

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }

  if (typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === "function") {
      const converted = maybeTimestamp.toDate();
      if (converted instanceof Date && !Number.isNaN(converted.getTime())) {
        return converted;
      }
    }

    const record = value as Record<string, unknown>;
    const seconds =
      typeof record.seconds === "number"
        ? record.seconds
        : typeof record._seconds === "number"
          ? record._seconds
          : null;
    const nanoseconds =
      typeof record.nanoseconds === "number"
        ? record.nanoseconds
        : typeof record._nanoseconds === "number"
          ? record._nanoseconds
          : 0;

    if (seconds !== null) {
      return new Date(seconds * 1000 + nanoseconds / 1_000_000);
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value);
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

// Format วันที่เป็นภาษาไทย
export function formatThaiDate(date: Date | unknown): string {
  return coerceToDate(date).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Format เวลา
export function formatTime(date: Date | unknown): string {
  return coerceToDate(date).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Normalize Firestore/plain objects to { lat, lng } (handles latitude/longitude). */
export function normalizeGeoPoint(point: unknown): GeoPoint | null {
  if (!point || typeof point !== "object") return null;
  const p = point as Record<string, unknown>;
  const lat =
    typeof p.lat === "number"
      ? p.lat
      : typeof p.latitude === "number"
        ? p.latitude
        : null;
  const lng =
    typeof p.lng === "number"
      ? p.lng
      : typeof p.longitude === "number"
        ? p.longitude
        : null;
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

/** Max GPS accuracy (meters) to accept for strict school-boundary checks. */
export const STRICT_GPS_MAX_ACCURACY_METERS = 150;

export function normalizeGeoPolygon(polygon: unknown): GeoPoint[] {
  if (Array.isArray(polygon)) {
    return polygon
      .map(normalizeGeoPoint)
      .filter((p): p is GeoPoint => p !== null);
  }

  // Firestore sometimes stores arrays as maps with numeric keys ("0", "1", …)
  if (polygon && typeof polygon === "object") {
    const record = polygon as Record<string, unknown>;
    const keys = Object.keys(record).filter((k) => /^\d+$/.test(k));
    if (keys.length === 0) return [];

    return keys
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => normalizeGeoPoint(record[key]))
      .filter((p): p is GeoPoint => p !== null);
  }

  return [];
}

// Ray-casting algorithm for point-in-polygon
export function isPointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}
