"use client";

import { useState } from "react";
import { MapPin, Settings2 } from "lucide-react";
import MapCanvas from "@/components/ui/map-canvas";
import { useMapView } from "@/hooks/use-map-view";
import { cn } from "@/lib/utils";
import type { AppSettings, GeoPoint } from "@/lib/types";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { useMediaQuery } from "@/hooks/use-media-query";

type MapSettingsPanelProps = {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
};

type MapTab = "general" | "boundary";

export default function MapSettingsPanel({ settings, onChange }: MapSettingsPanelProps) {
  const [tab, setTab] = useState<MapTab>("general");
  const isMobile = useMediaQuery("(max-width: 767px)");

  const mapCenter = settings.mapDefaultCenter || DEFAULT_APP_SETTINGS.mapDefaultCenter!;
  const mapZoom = settings.mapDefaultZoom ?? DEFAULT_APP_SETTINGS.mapDefaultZoom ?? 17;
  const mapPolygon = settings.mapSchoolBoundary || [];

  const { center, zoom, fitPoints } = useMapView({
    enabled: settings.mapsEnabled,
    fallbackCenter: mapCenter,
    fallbackZoom: mapZoom,
    polygon: mapPolygon,
    preferPolygonFit: true,
    locateUser: false,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-green-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-gray-900 dark:text-white">แผนที่และ GPS</h3>
            <p className="text-sm text-gray-500 mt-1">
              ใช้แผนที่เพื่อปักพิกัดและกำหนดขอบเขตโรงเรียน
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...settings,
              mapsEnabled: !settings.mapsEnabled,
            })
          }
          className={cn(
            "w-14 h-8 shrink-0 rounded-full transition-colors relative self-start",
            settings.mapsEnabled ? "bg-line-green" : "bg-gray-300 dark:bg-gray-600"
          )}
          aria-label="เปิด/ปิดแผนที่"
        >
          <span
            className={cn(
              "absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform",
              settings.mapsEnabled ? "right-1" : "left-1"
            )}
          />
        </button>
      </div>

      {settings.mapsEnabled && (
        <>
          <SegmentedTabs<MapTab>
            value={tab}
            onChange={setTab}
            size="sm"
            items={[
              { id: "general", label: "ตั้งค่าทั่วไป", icon: Settings2 },
              { id: "boundary", label: "ขอบเขตโรงเรียน", icon: MapPin },
            ]}
          />

          {tab === "general" && (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0 lg:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ลิงก์แผนที่ (Tile URL)
                  </label>
                  <input
                    type="text"
                    value={settings.mapTileUrl || DEFAULT_APP_SETTINGS.mapTileUrl}
                    onChange={(e) => onChange({ ...settings, mapTileUrl: e.target.value })}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-line-green"
                  />
                </div>
                <div className="min-w-0 lg:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    แหล่งที่มา (Attribution)
                  </label>
                  <input
                    type="text"
                    value={settings.mapAttribution || DEFAULT_APP_SETTINGS.mapAttribution}
                    onChange={(e) => onChange({ ...settings, mapAttribution: e.target.value })}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-line-green"
                  />
                </div>
              </div>

              <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 max-w-2xl">
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Lat
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={mapCenter.lat}
                    onChange={(e) =>
                      onChange({
                        ...settings,
                        mapDefaultCenter: {
                          lat: Number(e.target.value),
                          lng: mapCenter.lng,
                        },
                      })
                    }
                    className="w-full px-3 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-line-green text-sm"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Lng
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={mapCenter.lng}
                    onChange={(e) =>
                      onChange({
                        ...settings,
                        mapDefaultCenter: {
                          lat: mapCenter.lat,
                          lng: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-3 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-line-green text-sm"
                  />
                </div>
                <div className="min-w-0 col-span-2 lg:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Zoom
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={22}
                    value={mapZoom}
                    onChange={(e) =>
                      onChange({
                        ...settings,
                        mapDefaultZoom: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-line-green text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-white dark:bg-gray-600 rounded-xl border border-gray-200 dark:border-gray-500">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    บังคับพิกัดในโรงเรียน (เฉพาะแจ้งเจอของ)
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    บล็อกการส่งถ้าอยู่นอกขอบเขตที่กำหนด
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...settings,
                      mapEnforceFoundInSchool: !settings.mapEnforceFoundInSchool,
                    })
                  }
                  className={cn(
                    "w-14 h-8 shrink-0 rounded-full transition-colors relative self-start sm:self-center",
                    settings.mapEnforceFoundInSchool
                      ? "bg-line-green"
                      : "bg-gray-300 dark:bg-gray-500"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform",
                      settings.mapEnforceFoundInSchool ? "right-1" : "left-1"
                    )}
                  />
                </button>
              </div>
            </div>
          )}

          {tab === "boundary" && (
            <div className="space-y-3 min-w-0">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  ขอบเขตโรงเรียน (Polygon)
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  คลิกบนแผนที่เพื่อเพิ่มจุด — พื้นที่สีเขียวคือขอบเขตที่บันทึกไว้
                </p>
              </div>
              <MapCanvas
                center={center}
                zoom={zoom}
                fitPoints={fitPoints}
                fitBoundsOnce
                tileUrl={settings.mapTileUrl || DEFAULT_APP_SETTINGS.mapTileUrl!}
                attribution={settings.mapAttribution || DEFAULT_APP_SETTINGS.mapAttribution}
                mode="polygon"
                polygon={mapPolygon}
                onPolygonChange={(points: GeoPoint[]) =>
                  onChange({ ...settings, mapSchoolBoundary: points })
                }
                showVertexList={!isMobile}
                className="h-[min(360px,50dvh)] min-h-[240px] lg:h-[480px] lg:min-h-[320px] rounded-xl overflow-hidden"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...settings, mapSchoolBoundary: [] })}
                  className="px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                >
                  ล้างขอบเขต
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...settings,
                      mapSchoolBoundary: mapPolygon.slice(0, -1),
                    })
                  }
                  className="px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                >
                  ลบจุดล่าสุด
                </button>
              </div>
              {isMobile && mapPolygon.length > 0 && (
                <p className="text-xs text-gray-500">
                  จุดขอบเขต {mapPolygon.length} จุด — ใช้ Desktop เพื่อดูตารางพิกัดแบบเต็ม
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
