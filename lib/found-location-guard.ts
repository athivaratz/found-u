import type { AppSettings, LocationCoords } from "@/lib/types";
import {
  isPointInPolygon,
  normalizeGeoPolygon,
  STRICT_GPS_MAX_ACCURACY_METERS,
} from "@/lib/utils";

export type FoundLocationGuardCode =
  | "missing_coords"
  | "low_accuracy"
  | "outside"
  | "boundary_not_configured";

export type FoundLocationGuardResult =
  | { ok: true; coords?: LocationCoords }
  | { ok: false; code: FoundLocationGuardCode; message: string };

/**
 * Server-side school-boundary check for reporting found items.
 * Mirrors client gate on /found when mapEnforceFoundInSchool is on.
 */
export function assertFoundLocationAllowed(
  coords: LocationCoords | null | undefined,
  settings: AppSettings | null | undefined,
  options?: { bypass?: boolean }
): FoundLocationGuardResult {
  if (options?.bypass) {
    return { ok: true, coords: coords ?? undefined };
  }

  // Fail closed: enforce unless explicitly disabled in settings.
  if (settings?.mapEnforceFoundInSchool === false) {
    return { ok: true, coords: coords ?? undefined };
  }

  const polygon = normalizeGeoPolygon(settings?.mapSchoolBoundary);
  if (polygon.length < 3) {
    return {
      ok: false,
      code: "boundary_not_configured",
      message:
        "ระบบเปิดบังคับตรวจตำแหน่งแล้ว แต่ยังไม่ได้ตั้งค่าขอบเขตโรงเรียน กรุณาติดต่อผู้ดูแลระบบ",
    };
  }

  if (
    !coords ||
    typeof coords.lat !== "number" ||
    typeof coords.lng !== "number" ||
    !Number.isFinite(coords.lat) ||
    !Number.isFinite(coords.lng)
  ) {
    return {
      ok: false,
      code: "missing_coords",
      message:
        "ยังดำเนินการแจ้งเจอของให้ไม่ได้ เพราะยังไม่ได้รับตำแหน่งจากอุปกรณ์ กรุณาอนุญาตการเข้าถึงตำแหน่งแล้วลองใหม่อีกครั้ง หรือมาแจ้งเมื่ออยู่ในโรงเรียน",
    };
  }

  if (
    typeof coords.accuracy === "number" &&
    Number.isFinite(coords.accuracy) &&
    coords.accuracy > STRICT_GPS_MAX_ACCURACY_METERS
  ) {
    return {
      ok: false,
      code: "low_accuracy",
      message: `ตำแหน่งยังไม่แม่นยำพอ (ต้องไม่เกิน ${STRICT_GPS_MAX_ACCURACY_METERS} เมตร) กรุณาเปิด Precise Location / GPS แล้วลองใหม่เมื่ออยู่ในโรงเรียน`,
    };
  }

  if (!isPointInPolygon(coords, polygon)) {
    return {
      ok: false,
      code: "outside",
      message:
        "ยังดำเนินการแจ้งเจอของให้ไม่ได้ เพราะตำแหน่งอยู่นอกพื้นที่โรงเรียน — แจ้งเจอได้เฉพาะเมื่ออยู่ในโรงเรียนเท่านั้น (แจ้งของหายทำได้จากที่บ้านตามปกติ)",
    };
  }

  return { ok: true, coords };
}

export function parseClientLocation(raw: unknown): LocationCoords | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const lat = typeof obj.lat === "number" ? obj.lat : Number(obj.lat);
  const lng = typeof obj.lng === "number" ? obj.lng : Number(obj.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const accuracyRaw = obj.accuracy;
  const accuracy =
    typeof accuracyRaw === "number"
      ? accuracyRaw
      : accuracyRaw != null
        ? Number(accuracyRaw)
        : undefined;

  const source =
    obj.source === "gps" || obj.source === "map" || obj.source === "manual"
      ? obj.source
      : undefined;

  return {
    lat,
    lng,
    ...(typeof accuracy === "number" && Number.isFinite(accuracy)
      ? { accuracy }
      : {}),
    ...(source ? { source } : {}),
  };
}
