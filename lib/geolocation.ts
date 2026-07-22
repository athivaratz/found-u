import type { LocationCoords } from "@/lib/types";
import { STRICT_GPS_MAX_ACCURACY_METERS } from "@/lib/utils";

export type GeolocationPermissionState = "granted" | "denied" | "prompt" | "unsupported";

export type GeolocationErrorCode =
  | "permission"
  | "timeout"
  | "unavailable"
  | "low_accuracy";

export type GeolocationPlatform = "ios" | "android" | "desktop";

/** Looser threshold for map centering / pin placement (not school gate). */
export const MAP_DISPLAY_TARGET_ACCURACY_METERS = 120;

export type AccuratePositionResult =
  | { ok: true; coords: LocationCoords }
  | { ok: false; error: GeolocationErrorCode };

export type AccuratePositionOptions = {
  /** Resolve when accuracy is at or below this (meters). */
  targetAccuracyMeters?: number;
  /** Total wait time before giving up. */
  timeoutMs?: number;
  /** Reject cached readings — important on iOS. */
  maximumAge?: number;
  /** After timeout, return the best reading even if above target. */
  acceptBestEffort?: boolean;
  /** Called on each GPS update while refining (iOS often improves over time). */
  onProgress?: (coords: LocationCoords) => void;
  signal?: AbortSignal;
};

export type VerifyLocationMode = "auto" | "userGesture";

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Mac
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export function getGeolocationPlatform(): GeolocationPlatform {
  if (isIOSDevice()) return "ios";
  if (isAndroidDevice()) return "android";
  return "desktop";
}

/** Platform-specific instructions when location permission is denied. */
export function getGeolocationPermissionHelpText(
  platform: GeolocationPlatform = getGeolocationPlatform()
): string {
  switch (platform) {
    case "ios":
      return "ไปที่ Settings → Privacy & Security → Location Services → เปิดสำหรับ Safari/Chrome แล้วเปิด Precise Location จากนั้นกลับมาที่นี่แล้วกด「ขอสิทธิ์เข้าถึงตำแหน่งอีกครั้ง」";
    case "android":
      return "แตะไอคอนกุญแจหรือข้อมูลไซต์ในแถบที่อยู่ → Permissions → Location → Allow แล้วกลับมากด「ขอสิทธิ์เข้าถึงตำแหน่งอีกครั้ง」";
    default:
      return "คลิกไอคอนกุญแจในแถบที่อยู่ → Location → Allow แล้วกด「ขอสิทธิ์เข้าถึงตำแหน่งอีกครั้ง」(หรือปิด Sensors override ใน DevTools ถ้าเปิดทดสอบ)";
  }
}

/** iOS cold GPS fix often needs 15–25s; Android is usually faster. */
export function getGeolocationTimeoutMs(): number {
  return isIOSDevice() ? 25000 : 15000;
}

export async function queryGeolocationPermission(): Promise<GeolocationPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unsupported";
  }

  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result.state as GeolocationPermissionState;
  } catch {
    return "unsupported";
  }
}

export function watchGeolocationPermission(
  onChange: (state: GeolocationPermissionState) => void
): (() => void) | undefined {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return undefined;
  }

  let permissionStatus: PermissionStatus | null = null;

  const handleChange = () => {
    if (permissionStatus) {
      onChange(permissionStatus.state as GeolocationPermissionState);
    }
  };

  navigator.permissions
    .query({ name: "geolocation" })
    .then((status) => {
      permissionStatus = status;
      onChange(status.state as GeolocationPermissionState);
      status.addEventListener("change", handleChange);
    })
    .catch(() => onChange("unsupported"));

  return () => {
    permissionStatus?.removeEventListener("change", handleChange);
  };
}

function positionToCoords(pos: GeolocationPosition): LocationCoords {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    source: "gps",
  };
}

function mapPositionError(error: GeolocationPositionError): GeolocationErrorCode {
  if (error.code === error.PERMISSION_DENIED) return "permission";
  if (error.code === error.TIMEOUT) return "timeout";
  return "unavailable";
}

/**
 * Waits for a GPS fix using watchPosition (more reliable on iOS/iPadOS than a single
 * getCurrentPosition call, which often returns coarse Wi‑Fi location first).
 */
export function getAccuratePosition(
  options: AccuratePositionOptions = {}
): Promise<AccuratePositionResult> {
  const {
    targetAccuracyMeters = STRICT_GPS_MAX_ACCURACY_METERS,
    timeoutMs = getGeolocationTimeoutMs(),
    maximumAge = 0,
    acceptBestEffort = false,
    onProgress,
    signal,
  } = options;

  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ok: false, error: "unavailable" });
      return;
    }

    let settled = false;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    let best: LocationCoords | null = null;

    const cleanup = () => {
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      signal?.removeEventListener("abort", onAbort);
    };

    const finish = (result: AccuratePositionResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onAbort = () => {
      finish({ ok: false, error: "timeout" });
    };

    if (signal?.aborted) {
      finish({ ok: false, error: "timeout" });
      return;
    }
    signal?.addEventListener("abort", onAbort);

    const consider = (pos: GeolocationPosition) => {
      if (settled) return;
      const coords = positionToCoords(pos);
      const accuracy = coords.accuracy ?? Number.POSITIVE_INFINITY;

      if (!best || accuracy < (best.accuracy ?? Number.POSITIVE_INFINITY)) {
        best = coords;
      }

      onProgress?.(coords);

      if (accuracy <= targetAccuracyMeters) {
        finish({ ok: true, coords });
      }
    };

    const onError = (error: GeolocationPositionError) => {
      if (settled) return;
      // getCurrentPosition error: keep waiting on watch if active.
      // watchPosition error: end (unless we already have a best-effort reading).
      if (watchId != null) {
        if (best && acceptBestEffort) {
          finish({ ok: true, coords: best });
          return;
        }
        // If watch errors but getCurrent might still be pending, only finish on
        // permission denial; otherwise let the wall-clock timer decide.
        if (error.code === error.PERMISSION_DENIED) {
          finish({ ok: false, error: "permission" });
        }
        return;
      }
      if (best && acceptBestEffort) {
        finish({ ok: true, coords: best });
        return;
      }
      finish({ ok: false, error: mapPositionError(error) });
    };

    // Align browser per-call timeout with our wall clock (iOS 60s caused long hangs
    // when callbacks never fired after a prior successful grant).
    const geoTimeout = Math.max(timeoutMs, 5000);
    const watchOptions: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge,
      timeout: geoTimeout,
    };

    // Start watch immediately — do not wait for getCurrentPosition (iPadOS often
    // leaves getCurrentPosition hanging on the 2nd+ call even after GPS icon stops).
    watchId = navigator.geolocation.watchPosition(consider, onError, watchOptions);

    navigator.geolocation.getCurrentPosition(
      (pos) => consider(pos),
      () => {
        // Ignore — watchPosition is already running.
      },
      watchOptions
    );

    timer = setTimeout(() => {
      if (!best) {
        finish({ ok: false, error: "timeout" });
        return;
      }

      const accuracy = best.accuracy ?? Number.POSITIVE_INFINITY;
      if (accuracy <= targetAccuracyMeters) {
        finish({ ok: true, coords: best });
        return;
      }

      if (acceptBestEffort) {
        finish({ ok: true, coords: best });
        return;
      }

      finish({ ok: false, error: "low_accuracy" });
    }, timeoutMs);
  });
}

/**
 * Request / refresh geolocation.
 * - `auto`: may short-circuit when Permissions API reports denied (show UI without prompting).
 * - `userGesture`: always calls getAccuratePosition so browsers can re-prompt or pick up
 *   settings changes after the user taps "request again".
 */
export async function requestGeolocationAccess(
  mode: VerifyLocationMode,
  options: AccuratePositionOptions = {}
): Promise<AccuratePositionResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, error: "unavailable" };
  }

  if (mode === "auto") {
    const permission = await queryGeolocationPermission();
    if (permission === "denied") {
      return { ok: false, error: "permission" };
    }
  }

  // Retries after a prior fix: allow a short-lived cached reading so iOS/Android
  // don't hang waiting for a brand-new satellite lock.
  const maximumAge =
    options.maximumAge ?? (mode === "userGesture" ? 10_000 : 0);

  return getAccuratePosition({
    ...options,
    maximumAge,
  });
}

/** Map preview / pin — accept best reading after wait (iOS-friendly). */
export function getMapDisplayPosition(
  onProgress?: (coords: LocationCoords) => void
): Promise<LocationCoords | null> {
  return getAccuratePosition({
    targetAccuracyMeters: MAP_DISPLAY_TARGET_ACCURACY_METERS,
    acceptBestEffort: true,
    onProgress,
  }).then((result) => (result.ok ? result.coords : null));
}
