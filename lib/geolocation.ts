import type { LocationCoords } from "@/lib/types";
import { STRICT_GPS_MAX_ACCURACY_METERS } from "@/lib/utils";

export type GeolocationPermissionState = "granted" | "denied" | "prompt" | "unsupported";

export type GeolocationErrorCode =
  | "permission"
  | "timeout"
  | "unavailable"
  | "low_accuracy";

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

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Mac
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
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
      if (best && acceptBestEffort) {
        finish({ ok: true, coords: best });
        return;
      }
      finish({ ok: false, error: mapPositionError(error) });
    };

    const watchOptions: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge,
      // Per-update timeout: keep high on iOS so watchPosition is not cut off early.
      timeout: isIOSDevice() ? 60000 : 20000,
    };

    const startWatch = () => {
      if (settled || watchId != null) return;
      watchId = navigator.geolocation.watchPosition(consider, onError, watchOptions);
    };

    // Fast path when a fresh accurate reading is already available.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        consider(pos);
        if (!settled) startWatch();
      },
      () => {
        startWatch();
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
