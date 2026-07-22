"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings, LocationCoords } from "@/lib/types";
import { isPointInPolygon, normalizeGeoPolygon } from "@/lib/utils";
import {
  requestGeolocationAccess,
  watchGeolocationPermission,
  type GeolocationPermissionState,
  type VerifyLocationMode,
} from "@/lib/geolocation";

export type LocationGateErrorType =
  | "permission"
  | "timeout"
  | "position"
  | "outside"
  | "boundary_not_configured"
  | "low_accuracy";

export type UseFoundLocationGateOptions = {
  /** App settings (enforcement + polygon). */
  appSettings: AppSettings;
  /** Wait until settings are ready before auto-verifying. */
  appSettingsReady?: boolean;
  /** When false, skip auto verify effects. */
  enabled?: boolean;
  /**
   * `blocking` — found page: auto-verify when ready, gate until verified.
   * `lazy` — assistant: silent background try; modal only when opened explicitly.
   */
  mode?: "blocking" | "lazy";
  isAdmin?: boolean;
  /** Called whenever verified in-school coords are obtained. */
  onVerifiedCoords?: (coords: LocationCoords) => void;
};

export function useFoundLocationGate({
  appSettings,
  appSettingsReady = true,
  enabled = true,
  mode = "blocking",
  isAdmin = false,
  onVerifiedCoords,
}: UseFoundLocationGateOptions) {
  const [gpsLoading, setGpsLoading] = useState(false);
  const [locationVerified, setLocationVerified] = useState<boolean | null>(null);
  const [adminGpsBypassed, setAdminGpsBypassed] = useState(false);
  const [locationErrorType, setLocationErrorType] =
    useState<LocationGateErrorType | null>(null);
  const [userCurrentCoords, setUserCurrentCoords] =
    useState<LocationCoords | null>(null);
  const [verifiedCoords, setVerifiedCoords] = useState<LocationCoords | null>(
    null
  );
  const [gateOpen, setGateOpen] = useState(false);
  /** Prevent auto re-open modal in the same failure turn after user dismisses. */
  const dismissTurnRef = useRef(false);
  const verifyAbortRef = useRef<AbortController | null>(null);
  const verifyInFlightRef = useRef(false);
  const prevPermissionRef = useRef<GeolocationPermissionState | null>(null);
  const didAutoVerifyKeyRef = useRef<string | null>(null);

  const onVerifiedCoordsRef = useRef(onVerifiedCoords);
  useEffect(() => {
    onVerifiedCoordsRef.current = onVerifiedCoords;
  }, [onVerifiedCoords]);

  const enforcementRequired =
    appSettingsReady && Boolean(appSettings.mapEnforceFoundInSchool);

  const boundaryString = JSON.stringify(appSettings.mapSchoolBoundary || []);
  const polygon = useMemo(
    () => normalizeGeoPolygon(appSettings.mapSchoolBoundary),
    // boundaryString captures mapSchoolBoundary identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boundaryString]
  );

  const applyVerified = useCallback((coords: LocationCoords) => {
    setLocationVerified(true);
    setLocationErrorType(null);
    setVerifiedCoords(coords);
    setUserCurrentCoords(coords);
    onVerifiedCoordsRef.current?.(coords);
  }, []);

  const verifyLocation = useCallback(
    async (requestMode: VerifyLocationMode = "auto") => {
      if (!appSettings.mapEnforceFoundInSchool) {
        setLocationVerified(true);
        setLocationErrorType(null);
        setGpsLoading(false);
        return true;
      }

      // Cancel any in-flight GPS wait so retries don't stack.
      verifyAbortRef.current?.abort();
      const abort = new AbortController();
      verifyAbortRef.current = abort;
      verifyInFlightRef.current = true;

      setLocationVerified(null);
      setLocationErrorType(null);

      if (polygon.length < 3) {
        setLocationVerified(false);
        setLocationErrorType("boundary_not_configured");
        setGpsLoading(false);
        verifyInFlightRef.current = false;
        return false;
      }

      setGpsLoading(true);

      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setLocationErrorType("position");
        setLocationVerified(false);
        setGpsLoading(false);
        verifyInFlightRef.current = false;
        return false;
      }

      const result = await requestGeolocationAccess(requestMode, {
        onProgress: (coords) => {
          if (!abort.signal.aborted) setUserCurrentCoords(coords);
        },
        signal: abort.signal,
      });

      if (abort.signal.aborted) {
        verifyInFlightRef.current = false;
        return false;
      }

      if (!result.ok) {
        if (result.error === "permission") {
          setLocationErrorType("permission");
        } else if (result.error === "timeout") {
          setLocationErrorType("timeout");
        } else if (result.error === "low_accuracy") {
          setLocationErrorType("low_accuracy");
        } else {
          setLocationErrorType("position");
        }
        setLocationVerified(false);
        setGpsLoading(false);
        verifyInFlightRef.current = false;
        return false;
      }

      const coords = result.coords;
      setUserCurrentCoords(coords);

      const inside = isPointInPolygon(coords, polygon);
      if (inside) {
        applyVerified(coords);
        setGpsLoading(false);
        verifyInFlightRef.current = false;
        return true;
      }

      setLocationVerified(false);
      setLocationErrorType("outside");
      setGpsLoading(false);
      verifyInFlightRef.current = false;
      return false;
    },
    [appSettings.mapEnforceFoundInSchool, polygon, applyVerified]
  );

  // Auto / silent verify once per settings identity (avoid restart loops)
  useEffect(() => {
    if (!enabled || !appSettingsReady || adminGpsBypassed) return;
    if (!enforcementRequired) {
      setLocationVerified(true);
      return;
    }

    const key = `${mode}:${boundaryString}:${enforcementRequired}`;
    if (didAutoVerifyKeyRef.current === key) return;
    didAutoVerifyKeyRef.current = key;
    void verifyLocation("auto");
  }, [
    enabled,
    appSettingsReady,
    adminGpsBypassed,
    enforcementRequired,
    mode,
    boundaryString,
    verifyLocation,
  ]);

  // Watch permission: only re-verify on denied → granted (not on every result)
  useEffect(() => {
    if (!enabled || !enforcementRequired || adminGpsBypassed) return;

    const unwatch = watchGeolocationPermission((state) => {
      const prev = prevPermissionRef.current;
      prevPermissionRef.current = state;

      if (state === "denied") {
        verifyAbortRef.current?.abort();
        setLocationVerified(false);
        setLocationErrorType("permission");
        setGpsLoading(false);
        verifyInFlightRef.current = false;
        return;
      }

      if (
        state === "granted" &&
        prev === "denied" &&
        !verifyInFlightRef.current
      ) {
        dismissTurnRef.current = false;
        void verifyLocation("userGesture");
      }
    });

    return unwatch;
  }, [enabled, enforcementRequired, adminGpsBypassed, verifyLocation]);

  useEffect(() => {
    return () => {
      verifyAbortRef.current?.abort();
    };
  }, []);

  const openGate = useCallback(() => {
    dismissTurnRef.current = false;
    setGateOpen(true);
    if (locationVerified !== true && !verifyInFlightRef.current) {
      void verifyLocation("userGesture");
    }
  }, [locationVerified, verifyLocation]);

  const closeGate = useCallback(() => {
    dismissTurnRef.current = true;
    setGateOpen(false);
  }, []);

  /**
   * Open gate when found-report was blocked by location — unless user already
   * dismissed in this turn.
   */
  const openGateForLocationFailure = useCallback(() => {
    if (dismissTurnRef.current) return;
    setGateOpen(true);
  }, []);

  const retryPermission = useCallback(async () => {
    dismissTurnRef.current = false;
    setGateOpen(true);
    const ok = await verifyLocation("userGesture");
    if (ok) setGateOpen(false);
    return ok;
  }, [verifyLocation]);

  const bypassAsAdmin = useCallback(() => {
    if (!isAdmin) return;
    setAdminGpsBypassed(true);
    setLocationVerified(true);
    setLocationErrorType(null);
    setGpsLoading(false);
    setGateOpen(false);
  }, [isAdmin]);

  const showBlockingGate =
    mode === "blocking" &&
    enforcementRequired &&
    !adminGpsBypassed &&
    locationVerified !== true;

  const showLazyGate =
    mode === "lazy" && gateOpen && enforcementRequired && !adminGpsBypassed;

  return {
    gpsLoading,
    locationVerified,
    locationErrorType,
    userCurrentCoords,
    verifiedCoords,
    adminGpsBypassed,
    enforcementRequired,
    polygon,
    showBlockingGate,
    showLazyGate,
    gateOpen,
    verifyLocation,
    openGate,
    closeGate,
    openGateForLocationFailure,
    retryPermission,
    bypassAsAdmin,
    setAdminGpsBypassed,
  };
}
