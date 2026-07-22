"use client";

import { useMemo, useState } from "react";
import { MapPin, Settings2, Shapes, Plus, Pencil, Trash2 } from "lucide-react";
import MapCanvas from "@/components/ui/map-canvas";
import { PlaceSearchInput } from "@/components/admin/place-search-input";
import { useMapView } from "@/hooks/use-map-view";
import { cn } from "@/lib/utils";
import type { AppSettings, GeoPoint, MapZone } from "@/lib/types";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { useMediaQuery } from "@/hooks/use-media-query";

type MapSettingsPanelProps = {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
};

type MapTab = "general" | "boundary" | "zones";

type SearchView = {
  center: GeoPoint;
  zoom: number;
};

const SEARCH_ZOOM = 17;

const ZONE_COLORS = [
  "#06C755",
  "#2563EB",
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#14B8A6",
  "#EF4444",
  "#64748B",
];

const fieldLabelClass = "block text-sm font-medium text-text-primary mb-1";
const fieldInputClass = cn(
  "w-full min-h-11 px-4 py-2.5 rounded-xl text-base text-text-primary",
  "bg-bg-tertiary border border-transparent",
  "focus:outline-none focus:bg-bg-card focus:ring-2 focus:ring-line-green-light"
);
const fieldInputCompactClass = cn(
  "w-full min-h-11 px-3 py-2 rounded-xl text-sm text-text-primary",
  "bg-bg-tertiary border border-transparent",
  "focus:outline-none focus:bg-bg-card focus:ring-2 focus:ring-line-green-light"
);

function createZoneId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `zone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nextZoneColor(existing: MapZone[]): string {
  const used = new Set(existing.map((z) => z.color).filter(Boolean));
  return ZONE_COLORS.find((c) => !used.has(c)) ?? ZONE_COLORS[existing.length % ZONE_COLORS.length];
}

export default function MapSettingsPanel({ settings, onChange }: MapSettingsPanelProps) {
  const [tab, setTab] = useState<MapTab>("general");
  const [searchView, setSearchView] = useState<SearchView | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [outsideFenceHint, setOutsideFenceHint] = useState(false);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const mapCenter = settings.mapDefaultCenter || DEFAULT_APP_SETTINGS.mapDefaultCenter!;
  const mapZoom = settings.mapDefaultZoom ?? DEFAULT_APP_SETTINGS.mapDefaultZoom ?? 17;
  const mapPolygon = settings.mapSchoolBoundary || [];
  const mapZones = settings.mapZones ?? [];
  const hasSchoolFence = mapPolygon.length >= 3;

  const editingZone = useMemo(
    () => mapZones.find((z) => z.id === editingZoneId) ?? null,
    [mapZones, editingZoneId]
  );

  const zoneFitPoints = useMemo(() => {
    if (editingZone && editingZone.polygon.length >= 2) return editingZone.polygon;
    if (mapPolygon.length >= 2) return mapPolygon;
    const all = mapZones.flatMap((z) => z.polygon);
    if (all.length >= 2) return all;
    return undefined;
  }, [editingZone, mapZones, mapPolygon]);

  const { center, zoom, fitPoints } = useMapView({
    enabled: settings.mapsEnabled,
    fallbackCenter: mapCenter,
    fallbackZoom: mapZoom,
    polygon: tab === "zones" ? zoneFitPoints ?? [] : mapPolygon,
    preferPolygonFit: true,
    locateUser: false,
  });

  const viewCenter = searchView?.center ?? center;
  const viewZoom = searchView?.zoom ?? zoom;
  const viewFitPoints = searchView ? undefined : fitPoints;

  const updateZones = (nextZones: MapZone[]) => {
    onChange({ ...settings, mapZones: nextZones });
  };

  const patchZone = (zoneId: string, patch: Partial<MapZone>) => {
    updateZones(mapZones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)));
  };

  const handleAddZone = () => {
    const id = createZoneId();
    const zone: MapZone = {
      id,
      name: `โซน ${mapZones.length + 1}`,
      aliases: [],
      polygon: [],
      color: nextZoneColor(mapZones),
    };
    updateZones([...mapZones, zone]);
    setEditingZoneId(id);
    setSearchView(null);
  };

  const handleDeleteZone = (zoneId: string) => {
    updateZones(mapZones.filter((z) => z.id !== zoneId));
    if (editingZoneId === zoneId) setEditingZoneId(null);
  };

  const overlayPolygons = [
    ...(hasSchoolFence
      ? [
          {
            id: "school-boundary",
            points: mapPolygon,
            color: "#F59E0B",
            variant: "boundary" as const,
          },
        ]
      : []),
    ...mapZones
      .filter((z) => z.id !== editingZoneId && z.polygon.length >= 3)
      .map((z) => ({
        id: z.id,
        points: z.polygon,
        color: z.color,
        variant: "zone" as const,
      })),
  ];

  const handleOutsideSchoolFence = () => {
    setOutsideFenceHint(true);
    window.setTimeout(() => setOutsideFenceHint(false), 2500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-line-green-light flex items-center justify-center">
            <MapPin className="w-5 h-5 text-line-green-link" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-text-primary">แผนที่และ GPS</h3>
            <p className="text-sm text-text-secondary mt-1 text-pretty">
              ใช้แผนที่เพื่อปักพิกัด กำหนดขอบเขตโรงเรียน และโซนย่อยสำหรับจับคู่
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.mapsEnabled}
          onClick={() =>
            onChange({
              ...settings,
              mapsEnabled: !settings.mapsEnabled,
            })
          }
          className={cn(
            "relative inline-flex h-11 w-[3.25rem] shrink-0 items-center rounded-full transition-colors touch-manipulation self-start",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/40 focus-visible:ring-offset-2",
            settings.mapsEnabled ? "bg-line-green" : "bg-bg-tertiary"
          )}
          aria-label="เปิด/ปิดแผนที่"
        >
          <span
            className={cn(
              "absolute top-1 h-9 w-9 rounded-full bg-bg-card shadow-sm transition-transform",
              settings.mapsEnabled ? "right-1" : "left-1"
            )}
            aria-hidden
          />
        </button>
      </div>

      {settings.mapsEnabled && (
        <>
          <SegmentedTabs<MapTab>
            value={tab}
            onChange={(next) => {
              setTab(next);
              setSearchView(null);
            }}
            size="sm"
            items={[
              { id: "general", label: "ตั้งค่าทั่วไป", icon: Settings2 },
              { id: "boundary", label: "ขอบเขตโรงเรียน", icon: MapPin },
              { id: "zones", label: "โซนย่อย", icon: Shapes },
            ]}
          />

          {tab === "general" && (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0 lg:col-span-2">
                  <label className={fieldLabelClass}>ลิงก์แผนที่ (Tile URL)</label>
                  <input
                    type="text"
                    value={settings.mapTileUrl || DEFAULT_APP_SETTINGS.mapTileUrl}
                    onChange={(e) => onChange({ ...settings, mapTileUrl: e.target.value })}
                    className={fieldInputClass}
                  />
                </div>
                <div className="min-w-0 lg:col-span-2">
                  <label className={fieldLabelClass}>แหล่งที่มา (Attribution)</label>
                  <input
                    type="text"
                    value={settings.mapAttribution || DEFAULT_APP_SETTINGS.mapAttribution}
                    onChange={(e) => onChange({ ...settings, mapAttribution: e.target.value })}
                    className={fieldInputClass}
                  />
                </div>
              </div>

              <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 max-w-2xl">
                <div className="min-w-0">
                  <label className={fieldLabelClass}>Lat</label>
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
                    className={fieldInputCompactClass}
                  />
                </div>
                <div className="min-w-0">
                  <label className={fieldLabelClass}>Lng</label>
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
                    className={fieldInputCompactClass}
                  />
                </div>
                <div className="min-w-0 col-span-2 lg:col-span-1">
                  <label className={fieldLabelClass}>Zoom</label>
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
                    className={fieldInputCompactClass}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-bg-secondary rounded-xl border border-border-light">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    บังคับพิกัดในโรงเรียน (เฉพาะแจ้งเจอของ)
                  </p>
                  <p className="text-xs text-text-secondary mt-1 text-pretty">
                    บล็อกการส่งถ้าอยู่นอกขอบเขตที่กำหนด — ไม่เกี่ยวกับโซนย่อยจับคู่
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(settings.mapEnforceFoundInSchool)}
                  onClick={() =>
                    onChange({
                      ...settings,
                      mapEnforceFoundInSchool: !settings.mapEnforceFoundInSchool,
                    })
                  }
                  className={cn(
                    "relative inline-flex h-11 w-[3.25rem] shrink-0 items-center rounded-full transition-colors touch-manipulation self-start sm:self-center",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/40 focus-visible:ring-offset-2",
                    settings.mapEnforceFoundInSchool ? "bg-line-green" : "bg-bg-tertiary"
                  )}
                  aria-label="บังคับพิกัดในโรงเรียน"
                >
                  <span
                    className={cn(
                      "absolute top-1 h-9 w-9 rounded-full bg-bg-card shadow-sm transition-transform",
                      settings.mapEnforceFoundInSchool ? "right-1" : "left-1"
                    )}
                    aria-hidden
                  />
                </button>
              </div>
            </div>
          )}

          {tab === "boundary" && (
            <div className="space-y-3 min-w-0">
              <div>
                <label className="block text-sm font-medium text-text-primary">
                  ขอบเขตโรงเรียน (Polygon)
                </label>
                <p className="text-xs text-text-secondary mt-1 text-pretty">
                  ค้นหาสถานที่หรือคลิกบนแผนที่เพื่อเพิ่มจุด — พื้นที่สีเขียวคือขอบเขตที่บันทึกไว้
                </p>
              </div>
              <PlaceSearchInput
                onSelect={(place) =>
                  setSearchView({
                    center: { lat: place.lat, lng: place.lng },
                    zoom: SEARCH_ZOOM,
                  })
                }
              />
              <MapCanvas
                center={viewCenter}
                zoom={viewZoom}
                fitPoints={viewFitPoints}
                fitBoundsOnce={!searchView}
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
                  className="min-h-11 px-4 py-2.5 text-sm rounded-full bg-bg-tertiary text-text-primary hover:bg-bg-secondary transition-colors touch-manipulation"
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
                  className="min-h-11 px-4 py-2.5 text-sm rounded-full bg-bg-tertiary text-text-primary hover:bg-bg-secondary transition-colors touch-manipulation"
                >
                  ลบจุดล่าสุด
                </button>
              </div>
              {isMobile && mapPolygon.length > 0 && (
                <p className="text-xs text-text-secondary">
                  จุดขอบเขต {mapPolygon.length} จุด — ใช้ Desktop เพื่อดูตารางพิกัดแบบเต็ม
                </p>
              )}
            </div>
          )}

          {tab === "zones" && (
            <div className="space-y-4 min-w-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <label className="block text-sm font-medium text-text-primary">
                    โซนย่อยสำหรับจับคู่
                  </label>
                  <p className="text-xs text-text-secondary mt-1 text-pretty">
                    วาดโซน (เช่น โรงอาหาร ลานเท) ภายในขอบเขตโรงเรียนเพื่อถ่วงน้ำหนักสถานที่ตอน Matching —
                    ไม่บังคับแจ้งเจอ
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddZone}
                  disabled={!hasSchoolFence}
                  className="inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-line-green text-white text-sm font-medium hover:bg-[#05b34d] transition-colors touch-manipulation self-start disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Plus className="w-4 h-4" aria-hidden />
                  เพิ่มโซน
                </button>
              </div>

              {!hasSchoolFence && (
                <p className="text-sm text-amber-800 dark:text-amber-200 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/50 px-4 py-3 text-pretty">
                  กำหนดขอบเขตโรงเรียนในแท็บ &quot;ขอบเขตโรงเรียน&quot; ก่อน — โซนย่อยปักได้เฉพาะในกรอบนั้น
                </p>
              )}

              {mapZones.length === 0 ? (
                <p className="text-sm text-text-secondary rounded-xl bg-bg-tertiary/50 px-4 py-6 text-center">
                  ยังไม่มีโซน — กดเพิ่มโซนแล้ววาดขอบเขตบนแผนที่
                </p>
              ) : (
                <ul className="space-y-2">
                  {mapZones.map((zone) => {
                    const active = zone.id === editingZoneId;
                    return (
                      <li
                        key={zone.id}
                        className={cn(
                          "rounded-xl border px-3 py-3 transition-colors",
                          active
                            ? "border-line-green bg-line-green-light/40"
                            : "border-border-light bg-bg-card"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white shadow-sm"
                            style={{ backgroundColor: zone.color || "#06C755" }}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1 space-y-2">
                            {active ? (
                              <>
                                <input
                                  type="text"
                                  value={zone.name}
                                  onChange={(e) => patchZone(zone.id, { name: e.target.value })}
                                  className={fieldInputCompactClass}
                                  placeholder="ชื่อโซน"
                                  aria-label="ชื่อโซน"
                                />
                                <input
                                  type="text"
                                  value={(zone.aliases ?? []).join(", ")}
                                  onChange={(e) =>
                                    patchZone(zone.id, {
                                      aliases: e.target.value
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                  className={fieldInputCompactClass}
                                  placeholder="ชื่อเรียกอื่น (คั่นด้วยจุลภาค)"
                                  aria-label="ชื่อเรียกอื่น"
                                />
                                <div className="flex flex-wrap gap-1.5">
                                  {ZONE_COLORS.map((color) => (
                                    <button
                                      key={color}
                                      type="button"
                                      onClick={() => patchZone(zone.id, { color })}
                                      className={cn(
                                        "h-8 w-8 rounded-full touch-manipulation",
                                        zone.color === color &&
                                          "ring-2 ring-offset-2 ring-line-green"
                                      )}
                                      style={{ backgroundColor: color }}
                                      aria-label={`สี ${color}`}
                                    />
                                  ))}
                                </div>
                              </>
                            ) : (
                              <div>
                                <p className="text-sm font-medium text-text-primary truncate">
                                  {zone.name}
                                </p>
                                <p className="text-xs text-text-secondary mt-0.5">
                                  {zone.polygon.length >= 3
                                    ? `${zone.polygon.length} จุด`
                                    : "ยังไม่วาดขอบเขต"}
                                  {(zone.aliases?.length ?? 0) > 0
                                    ? ` · alias ${zone.aliases!.length}`
                                    : ""}
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
              onClick={() => {
                setEditingZoneId(active ? null : zone.id);
                setSearchView(null);
                setOutsideFenceHint(false);
              }}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary hover:bg-bg-tertiary touch-manipulation"
                              aria-label={active ? "ปิดการแก้ไข" : "แก้ไขโซน"}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteZone(zone.id)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 touch-manipulation"
                              aria-label="ลบโซน"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {editingZone && (
                <div className="space-y-3">
                  <p className="text-xs text-text-secondary text-pretty">
                    กำลังวาด: <span className="font-medium text-text-primary">{editingZone.name}</span> —
                    คลิกในกรอบขอบเขตโรงเรียน (เส้นประสีส้ม) เพื่อเพิ่มจุด
                  </p>
                  {outsideFenceHint && (
                    <p className="text-xs text-amber-800 dark:text-amber-200 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2">
                      จุดอยู่นอกขอบเขตโรงเรียน — ปักได้เฉพาะในกรอบเท่านั้น
                    </p>
                  )}
                  <PlaceSearchInput
                    onSelect={(place) =>
                      setSearchView({
                        center: { lat: place.lat, lng: place.lng },
                        zoom: SEARCH_ZOOM,
                      })
                    }
                  />
                  <MapCanvas
                    center={viewCenter}
                    zoom={viewZoom}
                    fitPoints={viewFitPoints}
                    fitBoundsOnce={!searchView}
                    tileUrl={settings.mapTileUrl || DEFAULT_APP_SETTINGS.mapTileUrl!}
                    attribution={settings.mapAttribution || DEFAULT_APP_SETTINGS.mapAttribution}
                    mode="polygon"
                    polygon={editingZone.polygon}
                    polygonColor={editingZone.color || "#06C755"}
                    constrainToPolygon={hasSchoolFence ? mapPolygon : undefined}
                    onOutsideConstraint={handleOutsideSchoolFence}
                    overlayPolygons={overlayPolygons}
                    onPolygonChange={(points: GeoPoint[]) =>
                      patchZone(editingZone.id, { polygon: points })
                    }
                    showVertexList={!isMobile}
                    className="h-[min(360px,50dvh)] min-h-[240px] lg:h-[480px] lg:min-h-[320px] rounded-xl overflow-hidden"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => patchZone(editingZone.id, { polygon: [] })}
                      className="min-h-11 px-4 py-2.5 text-sm rounded-full bg-bg-tertiary text-text-primary hover:bg-bg-secondary transition-colors touch-manipulation"
                    >
                      ล้างขอบเขตโซน
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        patchZone(editingZone.id, {
                          polygon: editingZone.polygon.slice(0, -1),
                        })
                      }
                      className="min-h-11 px-4 py-2.5 text-sm rounded-full bg-bg-tertiary text-text-primary hover:bg-bg-secondary transition-colors touch-manipulation"
                    >
                      ลบจุดล่าสุด
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingZoneId(null)}
                      className="min-h-11 px-4 py-2.5 text-sm rounded-full bg-line-green text-white hover:bg-[#05b34d] transition-colors touch-manipulation"
                    >
                      เสร็จสิ้น
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
