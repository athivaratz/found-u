"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  MapPin,
  Plus,
  Search,
  X,
} from "lucide-react";
import Header from "@/components/layout/header";
import BottomNav from "@/components/layout/bottom-nav";
import AppShell from "@/components/layout/app-shell";
import LoginPrompt from "@/components/auth/login-prompt";
import MapCanvas from "@/components/ui/map-canvas";
import { type ContactInfo, type ContactType, type ItemCategory, type LocationCoords } from "@/lib/types";
import { cn, generateTrackingCode } from "@/lib/utils";
import {
  addLostItem,
  subscribeToCategories,
  subscribeToContactTypes,
  type CategoryConfig,
  type ContactTypeConfig,
} from "@/lib/firestore";
import { useAuth } from "@/contexts/auth-context";
import { logItemCreated } from "@/lib/logger";

export default function ReportLostPage() {
  const router = useRouter();
  const { user, loading: authLoading, appSettings } = useAuth();

  const [categories, setCategories] = useState<CategoryConfig[]>([]);
  const [contactTypes, setContactTypes] = useState<ContactTypeConfig[]>([]);
  const [configLoading, setConfigLoading] = useState(true);

  const [formData, setFormData] = useState({
    itemName: "",
    category: "" as ItemCategory | "",
    description: "",
    locationLost: "",
  });

  const [contacts, setContacts] = useState<ContactInfo[]>([{ type: "phone", value: "" }]);
  const [locationCoords, setLocationCoords] = useState<LocationCoords | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [trackingCode, setTrackingCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showMatches, setShowMatches] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    let loadedCount = 0;
    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount >= 2) setConfigLoading(false);
    };

    const unsubCategories = subscribeToCategories((cats) => {
      setCategories(cats);
      checkLoaded();
    });

    const unsubContactTypes = subscribeToContactTypes((types) => {
      setContactTypes(types);
      if (types.length > 0 && contacts[0]?.type === "phone") {
        setContacts([{ type: types[0].value as ContactType, value: "" }]);
      }
      checkLoaded();
    });

    return () => {
      unsubCategories();
      unsubContactTypes();
    };
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleContactChange = (index: number, field: "type" | "value", value: string) => {
    const nextContacts = [...contacts];
    nextContacts[index] = { ...nextContacts[index], [field]: value };
    setContacts(nextContacts);
    if (errors.contacts) {
      setErrors((prev) => ({ ...prev, contacts: "" }));
    }
  };

  const addContact = () => {
    if (contacts.length < 3) {
      setContacts([...contacts, { type: "line", value: "" }]);
    }
  };

  const removeContact = (index: number) => {
    if (contacts.length > 1) {
      setContacts(contacts.filter((_, i) => i !== index));
    }
  };

  const handleMapSelect = (coords: LocationCoords | null) => {
    if (!coords) return;
    setLocationCoords(coords);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          source: "gps",
        });
      },
      () => {
        setErrors((prev) => ({ ...prev, locationCoords: "ไม่สามารถระบุตำแหน่งได้" }));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};

    if (!formData.itemName.trim()) {
      nextErrors.itemName = "กรุณากรอกชื่อสิ่งของ";
    }
    if (!formData.category) {
      nextErrors.category = "กรุณาเลือกประเภท";
    }
    if (!formData.locationLost.trim()) {
      nextErrors.locationLost = "กรุณากรอกสถานที่ทำหาย";
    }

    const validContacts = contacts.filter((c) => c.value.trim());
    if (validContacts.length === 0) {
      nextErrors.contacts = "กรุณากรอกช่องทางการติดต่ออย่างน้อย 1 ช่องทาง";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const newTrackingCode = generateTrackingCode();
      setTrackingCode(newTrackingCode);

      const validContacts = contacts.filter((c) => c.value.trim());

      const itemId = await addLostItem({
        itemName: formData.itemName,
        category: formData.category as ItemCategory,
        description: formData.description,
        locationLost: formData.locationLost,
        locationPlaceName: formData.locationLost,
        locationCoords: locationCoords || undefined,
        contacts: validContacts,
        userId: user?.uid,
        trackingCode: newTrackingCode,
        status: "searching",
        dateLost: new Date(),
      });

      await logItemCreated(
        "lost",
        itemId,
        formData.itemName,
        newTrackingCode,
        user?.email || undefined,
        user?.displayName || undefined
      );

      try {
        const matchResponse = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "lost", itemId }),
        });
        const matchData = await matchResponse.json();
        setMatches(matchData.matches || []);
        if (matchData.matches && matchData.matches.length > 0) {
          setShowMatches(true);
        }
      } catch (error) {
        console.error("Error fetching matches:", error);
      }

      setShowSuccess(true);
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || configLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#06C755]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-secondary pb-24 transition-colors">
        <Header title="แจ้งของหาย" showBack />
        <LoginPrompt
          title="เข้าสู่ระบบเพื่อแจ้งของหาย"
          description="คุณต้องเข้าสู่ระบบเพื่อแจ้งของหาย เพื่อให้เราแจ้งเตือนคุณเมื่อมีคนเจอของ"
          feature="รับการแจ้งเตือนอัตโนมัติเมื่อมีคนเจอของคุณ!"
        />
        <BottomNav />
      </div>
    );
  }

  if (showSuccess) {
    return (
      <AppShell>
        <div className="min-h-screen bg-bg-secondary pb-24 md:pb-8 transition-colors">
          <div className="md:hidden">
            <Header title="แจ้งของหายสำเร็จ" />
          </div>

          <div className="hidden md:block px-8 py-6 border-b border-border-light bg-bg-secondary sticky top-0 z-10">
            <h1 className="text-2xl font-bold text-text-primary">แจ้งของหายสำเร็จ</h1>
            <p className="text-text-secondary text-sm mt-1">ระบบได้รับข้อมูลเรียบร้อยแล้ว</p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 md:py-12">
            <div className="w-full max-w-lg bg-bg-card rounded-2xl shadow-sm border border-border-light p-6 md:p-8 animate-fade-in text-center">
              <div className="w-20 h-20 rounded-full bg-[#e8f8ef] dark:bg-[#06C755]/20 flex items-center justify-center mb-6 mx-auto animate-fade-in">
                <CheckCircle2 className="w-10 h-10 text-[#06C755]" />
              </div>

              <h2 className="text-xl font-semibold text-text-primary mb-2">แจ้งของหายเรียบร้อย!</h2>
              <p className="text-text-secondary text-center mb-8">
                เราจะแจ้งเตือนคุณเมื่อมีคนพบของ
              </p>

              <div className="w-full bg-bg-secondary rounded-2xl p-6 mb-8 border border-border-light">
                <p className="text-sm text-text-secondary text-center mb-2">รหัสติดตาม</p>
                <p className="text-2xl font-bold text-[#06C755] text-center tracking-wider font-mono">
                  {trackingCode}
                </p>
                <p className="text-xs text-text-tertiary text-center mt-3">
                  กรุณาบันทึกรหัสนี้ไว้เพื่อติดตามสถานะ
                </p>
              </div>

              {showMatches && matches.length > 0 && (
                <div className="mt-6 text-left">
                  <div className="bg-[#e8f8ef] dark:bg-[#06C755]/10 rounded-xl p-4 border border-[#06C755]/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Search className="w-5 h-5 text-[#06C755]" />
                      <h3 className="font-semibold text-text-primary">
                        พบของที่อาจตรงกัน ({matches.length} รายการ)
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {matches.slice(0, 3).map((match: any) => (
                        <div
                          key={match.foundItem.id}
                          className="bg-bg-card rounded-lg p-3 border border-border-light shadow-sm"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-text-primary text-sm truncate">
                                {match.foundItem.description}
                              </p>
                              <p className="text-xs text-text-secondary mt-1 truncate">
                                📍 {match.foundItem.locationFound}
                              </p>
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span
                                  className={cn(
                                    "text-xs px-2 py-0.5 rounded-full",
                                    match.confidence === "high"
                                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                      : match.confidence === "medium"
                                        ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400"
                                  )}
                                >
                                  ความน่าจะเป็น {match.scorePercentage}%
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                router.push(`/tracking?code=${match.foundItem.trackingCode}`)
                              }
                              className="ml-3 px-3 py-1.5 bg-[#06C755] text-white text-xs rounded-lg hover:bg-[#05b34d] transition-colors flex-shrink-0"
                            >
                              ดู
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => router.push(`/tracking?code=${trackingCode}`)}
                      className="w-full mt-3 py-2 text-sm text-[#06C755] hover:text-[#05b34d] font-medium"
                    >
                      ดูทั้งหมด →
                    </button>
                  </div>
                </div>
              )}

              <div className="w-full space-y-3 mt-8">
                <button
                  onClick={() => router.push("/tracking")}
                  className="w-full py-3 bg-[#06C755] text-white rounded-xl font-medium hover:bg-[#05b34d] transition-colors shadow-sm"
                >
                  ติดตามสถานะ
                </button>
                <button
                  onClick={() => router.push("/")}
                  className="w-full py-3 bg-bg-secondary text-text-secondary rounded-xl font-medium hover:bg-bg-tertiary transition-colors border border-border-light"
                >
                  กลับหน้าหลัก
                </button>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-bg-secondary pb-24 md:pb-8 transition-colors">
        <div className="md:hidden">
          <Header title="แจ้งของหาย" showBack />
        </div>

        <div className="hidden md:block px-8 py-6 border-b border-border-light bg-bg-secondary sticky top-0 z-10">
          <h1 className="text-2xl font-bold text-text-primary">แจ้งของหาย</h1>
          <p className="text-text-secondary text-sm mt-1">กรอกข้อมูลให้ละเอียดเพื่อให้ง่ายต่อการค้นหา</p>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-6 max-w-2xl mx-auto">
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ชื่อสิ่งของ <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="itemName"
                value={formData.itemName}
                onChange={handleFormChange}
                placeholder="เช่น โทรศัพท์, กระเป๋าสตางค์"
                className={cn("input-line", errors.itemName && "ring-2 ring-red-200 bg-red-50")}
              />
              {errors.itemName && <p className="text-xs text-red-500 mt-1.5">{errors.itemName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ประเภท <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleFormChange}
                  className={cn(
                    "input-line appearance-none pr-10",
                    errors.category && "ring-2 ring-red-200 bg-red-50",
                    !formData.category && "text-gray-400"
                  )}
                >
                  <option value="">เลือกประเภท</option>
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
              {errors.category && <p className="text-xs text-red-500 mt-1.5">{errors.category}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                รายละเอียดเพิ่มเติม
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleFormChange}
                placeholder="สี, ยี่ห้อ, ลักษณะเด่น"
                rows={3}
                className="input-line resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                สถานที่ทำหาย <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="locationLost"
                value={formData.locationLost}
                onChange={handleFormChange}
                placeholder="เช่น ตึก 2 ชั้น 3"
                className={cn(
                  "input-line",
                  errors.locationLost && "ring-2 ring-red-200 bg-red-50"
                )}
              />
              {errors.locationLost && (
                <p className="text-xs text-red-500 mt-1.5">{errors.locationLost}</p>
              )}
            </div>

            {appSettings.mapsEnabled && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    ปักพิกัดบนแผนที่ (ถ้ามี)
                  </label>
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    className="text-xs text-[#06C755] hover:text-[#05b34d] flex items-center gap-1"
                  >
                    <MapPin className="w-3 h-3" />
                    ใช้ตำแหน่งปัจจุบัน
                  </button>
                </div>
                <MapCanvas
                  center={appSettings.mapDefaultCenter || { lat: 13.7563, lng: 100.5018 }}
                  zoom={appSettings.mapDefaultZoom ?? 17}
                  tileUrl={appSettings.mapTileUrl || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"}
                  attribution={appSettings.mapAttribution || ""}
                  mode="marker"
                  marker={locationCoords}
                  onMarkerChange={handleMapSelect}
                  polygon={appSettings.mapSchoolBoundary || []}
                  className="h-56"
                />
                {errors.locationCoords && (
                  <p className="text-xs text-red-500">{errors.locationCoords}</p>
                )}
              </div>
            )}

            <div className="border-t border-gray-100 dark:border-gray-700 pt-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    ช่องทางติดต่อ <span className="text-red-500">*</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">อย่างน้อย 1 ช่องทาง</p>
                </div>
                {contacts.length < 3 && (
                  <button
                    type="button"
                    onClick={addContact}
                    className="flex items-center gap-1 text-sm text-[#06C755] font-medium hover:underline"
                  >
                    <Plus className="w-4 h-4" />
                    เพิ่ม
                  </button>
                )}
              </div>
            </div>

            {errors.contacts && <p className="text-xs text-red-500">{errors.contacts}</p>}

            <div className="space-y-3">
              {contacts.map((contact, index) => (
                <div key={index} className="flex gap-2">
                  <div className="relative w-36 flex-shrink-0">
                    <select
                      value={contact.type}
                      onChange={(e) => handleContactChange(index, "type", e.target.value)}
                      className="w-full h-12 px-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-gray-900 dark:text-white appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-[#06C755] border border-gray-100 dark:border-gray-600"
                    >
                      {contactTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.icon} {type.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>

                  <input
                    type="text"
                    value={contact.value}
                    onChange={(e) => handleContactChange(index, "value", e.target.value)}
                    placeholder={
                      contactTypes.find((t) => t.value === contact.type)?.placeholder || ""
                    }
                    className="flex-1 h-12 px-4 bg-gray-50 dark:bg-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06C755] border border-gray-100 dark:border-gray-600"
                  />

                  <button
                    type="button"
                    onClick={() => removeContact(index)}
                    className="w-12 h-12 flex items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "w-full py-4 rounded-full font-medium text-white transition-all",
                isSubmitting
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-[#06C755] hover:bg-[#05b34d] active:scale-[0.98]"
              )}
            >
              {isSubmitting ? "กำลังส่ง..." : "ส่งแจ้งของหาย"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}