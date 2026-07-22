"use client";

import { Loader2, MapPin, X } from "lucide-react";
import { AnimatePresence, m } from "framer-motion";
import MapCanvasLazy from "@/components/ui/map-canvas-lazy";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import type { LocationGateErrorType } from "@/hooks/use-found-location-gate";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  getGeolocationPermissionHelpText,
  isIOSDevice,
} from "@/lib/geolocation";
import { fade } from "@/lib/motion";
import type { AppSettings, GeoPoint, LocationCoords } from "@/lib/types";
import { cn, STRICT_GPS_MAX_ACCURACY_METERS } from "@/lib/utils";
import { resolveMapView } from "@/lib/map-utils";
import { useMemo } from "react";

export type LocationPermissionGateProps = {
  open: boolean;
  onClose: () => void;
  waitingForSettings?: boolean;
  gpsLoading: boolean;
  locationVerified: boolean | null;
  locationErrorType: LocationGateErrorType | null;
  userCurrentCoords: LocationCoords | null;
  appSettings: AppSettings;
  schoolPolygon: GeoPoint[];
  isAdmin?: boolean;
  /** Primary retry — always uses user-gesture geolocation request. */
  onRetry: () => void;
  onAdminBypass?: () => void;
  /** Secondary dismiss action label + handler (e.g. go home or dismiss). */
  dismissLabel?: string;
  onDismiss: () => void;
  /** Allow closing via backdrop / X (assistant lazy mode). Found page keeps false. */
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
};

export function LocationPermissionGate({
  open,
  onClose,
  waitingForSettings = false,
  gpsLoading,
  locationErrorType,
  userCurrentCoords,
  appSettings,
  schoolPolygon,
  isAdmin = false,
  onRetry,
  onAdminBypass,
  dismissLabel = "ปิด",
  onDismiss,
  closeOnBackdrop = false,
  showCloseButton = false,
}: LocationPermissionGateProps) {
  const reduced = useReducedMotion();

  const mapFallbackCenter = useMemo(
    () => appSettings.mapDefaultCenter || { lat: 13.7563, lng: 100.5018 },
    [appSettings.mapDefaultCenter]
  );
  const mapFallbackZoom = appSettings.mapDefaultZoom ?? 17;

  const gateMapView = useMemo(
    () =>
      resolveMapView({
        fallbackCenter: mapFallbackCenter,
        fallbackZoom: mapFallbackZoom,
        polygon: schoolPolygon,
        marker: userCurrentCoords,
        userLocation: userCurrentCoords,
      }),
    [mapFallbackCenter, mapFallbackZoom, schoolPolygon, userCurrentCoords]
  );

  const retryLabel =
    locationErrorType === "permission"
      ? "ขอสิทธิ์เข้าถึงตำแหน่งอีกครั้ง"
      : "ลองใหม่อีกครั้ง";

  // Loading UI follows gpsLoading only — never leave a blank "verifying" state
  // when locationVerified is null after an aborted/stale GPS request.
  const verifying = !waitingForSettings && gpsLoading;

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      size="md"
      showCloseButton={showCloseButton}
      closeOnBackdrop={closeOnBackdrop}
      ariaLabel="ยืนยันตำแหน่งสำหรับแจ้งเจอของ"
    >
      <AnimatePresence mode="wait">
        {waitingForSettings ? (
          <m.div
            key="gate-settings"
            initial={reduced ? false : fade.initial}
            animate={fade.animate}
            exit={reduced ? undefined : fade.exit}
            transition={fade.transition}
            className="flex flex-col items-center text-center"
          >
            <div className="w-14 h-14 rounded-full bg-bg-secondary flex items-center justify-center mb-5 border border-border-light">
              <Loader2
                className="w-7 h-7 text-line-green animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            </div>
            <h2 className="text-lg font-semibold text-text-primary mb-2 text-balance">
              กำลังโหลดการตั้งค่า
            </h2>
            <p className="text-text-secondary text-sm leading-relaxed">
              ระบบกำลังดึงขอบเขตพื้นที่และกฎ GPS จากเซิร์ฟเวอร์
            </p>
          </m.div>
        ) : verifying ? (
          <m.div
            key="gate-verifying"
            initial={reduced ? false : fade.initial}
            animate={fade.animate}
            exit={reduced ? undefined : fade.exit}
            transition={fade.transition}
            className="flex flex-col items-center text-center"
          >
            <div
              className={cn(
                "w-14 h-14 rounded-full bg-bg-secondary flex items-center justify-center mb-5 border border-border-light",
                !reduced && "animate-pulse-green"
              )}
            >
              <MapPin className="w-7 h-7 text-line-green" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-text-primary mb-2 text-balance">
              กำลังยืนยันตำแหน่งของคุณ
            </h2>
            <p className="text-text-secondary text-sm leading-relaxed mb-4">
              เพื่อความปลอดภัยและป้องกันข้อมูลเท็จ
              ระบบกำลังตรวจสอบว่าตำแหน่งอุปกรณ์ของคุณอยู่ภายในขอบเขตสถาบันการศึกษาหรือไม่
            </p>
            <div className="flex items-center gap-2 text-xs text-text-tertiary justify-center">
              <Loader2
                className="w-4 h-4 animate-spin text-text-tertiary motion-reduce:animate-none"
                aria-hidden
              />
              <span>
                {userCurrentCoords?.accuracy != null
                  ? `กำลังปรับความแม่นยำ GPS… (±${Math.round(userCurrentCoords.accuracy)} ม.)`
                  : "กำลังเรียกพิกัดจาก GPS…"}
              </span>
            </div>
            {isIOSDevice() && (
              <p className="text-xs text-text-tertiary mt-3 leading-relaxed max-w-sm mx-auto">
                บน iPhone/iPad อาจใช้เวลา 10–25 วินาที กรุณาอยู่กลางแจ้ง เปิด
                Location Services และเปิด Precise Location สำหรับเบราว์เซอร์
              </p>
            )}
          </m.div>
        ) : (
          <m.div
            key={locationErrorType ?? "gate-error"}
            initial={reduced ? false : fade.initial}
            animate={fade.animate}
            exit={reduced ? undefined : fade.exit}
            transition={fade.transition}
            className="flex flex-col items-center text-center"
          >
            {locationErrorType === "outside" ||
            locationErrorType === "low_accuracy" ? (
              <div className="w-14 h-14 rounded-full bg-bg-secondary flex items-center justify-center mb-5 border border-border-light">
                <MapPin className="w-7 h-7 text-status-warning" aria-hidden />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-full bg-bg-secondary flex items-center justify-center mb-5 border border-border-light">
                <X className="w-7 h-7 text-status-error" aria-hidden />
              </div>
            )}

            {locationErrorType === "boundary_not_configured" ? (
              <>
                <h2 className="text-lg font-semibold text-text-primary mb-2 text-balance">
                  ยังไม่ได้ตั้งค่าขอบเขตพื้นที่
                </h2>
                <p className="text-text-secondary text-sm leading-relaxed mb-8">
                  ผู้ดูแลระบบเปิดบังคับตรวจ GPS แล้ว แต่ยังไม่ได้วาด Polygon
                  ขอบเขตใน Admin → แผนที่และ GPS (ต้องมีอย่างน้อย 3 จุด)
                  กรุณาติดต่อผู้ดูแลระบบ
                </p>
              </>
            ) : locationErrorType === "outside" ? (
              <>
                <h2 className="text-lg font-semibold text-text-primary mb-2 text-balance">
                  อยู่นอกพื้นที่ขอบเขตที่กำหนด
                </h2>
                <p className="text-text-secondary text-sm leading-relaxed mb-6">
                  ขออภัยด้วยครับ
                  ระบบแจ้งเจอของได้รับการกำหนดให้ใช้ได้เฉพาะภายในพื้นที่ที่กำหนดเท่านั้น
                  (เช่น บริเวณโรงเรียน/มหาวิทยาลัย)
                  เพื่อให้ของที่เจอได้รับการคืนสู่เจ้าของอย่างรวดเร็วและถูกต้อง
                </p>

                {appSettings.mapsEnabled && schoolPolygon.length >= 3 && (
                  <div className="w-full mb-6 relative overflow-hidden rounded-xl border border-border-light">
                    <MapCanvasLazy
                      center={gateMapView.center}
                      zoom={gateMapView.zoom}
                      fitPoints={gateMapView.fitPoints}
                      tileUrl={
                        appSettings.mapTileUrl ||
                        "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                      }
                      attribution={appSettings.mapAttribution || ""}
                      mode="view"
                      marker={userCurrentCoords}
                      polygon={schoolPolygon}
                      showPolygonVertices={false}
                      className="h-[200px] sm:h-[240px] rounded-xl overflow-hidden"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-xs text-white px-2 py-1 rounded">
                      🔵 ตำแหน่งของคุณอยู่นอกขอบเขตสีเขียว
                    </div>
                  </div>
                )}
              </>
            ) : locationErrorType === "low_accuracy" ? (
              <>
                <h2 className="text-lg font-semibold text-text-primary mb-2 text-balance">
                  ตำแหน่งไม่แม่นยำพอ (ไม่ใช่ GPS จริง)
                </h2>
                <p className="text-text-secondary text-sm leading-relaxed mb-8">
                  ระบบยังไม่ได้รับพิกัดที่แม่นยำพอ (ต้องไม่เกิน{" "}
                  {STRICT_GPS_MAX_ACCURACY_METERS} เมตร)
                  {isIOSDevice()
                    ? " บน iPhone/iPad ให้เปิด Settings → Privacy & Security → Location Services → Safari/Chrome แล้วเปิด Precise Location ยืนยันว่าอยู่กลางแจ้ง แล้วกดลองใหม่ (รอได้ถึง 25 วินาที)"
                    : " กรุณาใช้มือถือที่เปิด GPS และอยู่ในบริเวณโรงเรียน"}
                </p>
              </>
            ) : locationErrorType === "permission" ? (
              <>
                <h2 className="text-lg font-semibold text-text-primary mb-2 text-balance">
                  ปิดการเข้าถึงตำแหน่ง (GPS)
                </h2>
                <p className="text-text-secondary text-sm leading-relaxed mb-8">
                  {getGeolocationPermissionHelpText()}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-text-primary mb-2 text-balance">
                  ไม่สามารถระบุตำแหน่งได้
                </h2>
                <p className="text-text-secondary text-sm leading-relaxed mb-8">
                  ไม่สามารถดึงตำแหน่ง GPS ของคุณได้ในขณะนี้
                  กรุณาตรวจสอบสิทธิ์พิกัดหรือการเชื่อมต่อ GPS
                  บนโทรศัพท์/คอมพิวเตอร์ของคุณแล้วลองใหม่อีกครั้ง
                </p>
              </>
            )}

            <div className="w-full space-y-3">
              <button
                onClick={onRetry}
                type="button"
                className="w-full py-3 bg-line-green text-white rounded-xl font-medium hover:bg-line-green-hover transition-[transform,colors] duration-150 active:scale-[0.98] motion-reduce:active:scale-100"
              >
                {retryLabel}
              </button>

              {isAdmin && onAdminBypass ? (
                <button
                  onClick={onAdminBypass}
                  type="button"
                  className="w-full py-3 border border-status-warning text-status-warning rounded-xl font-medium hover:bg-status-warning-light transition-colors"
                >
                  ข้ามการตรวจสอบ (ผู้ดูแลระบบ)
                </button>
              ) : null}

              <button
                onClick={onDismiss}
                type="button"
                className="w-full py-3 bg-bg-secondary text-text-secondary rounded-xl font-medium hover:bg-bg-tertiary transition-colors border border-border-light"
              >
                {dismissLabel}
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </ResponsiveModal>
  );
}
