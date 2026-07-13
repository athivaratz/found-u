"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import LoginPrompt from "@/components/auth/login-prompt";
import { StudentAppShell } from "@/components/layout/student-app-shell";
import MapCanvasLazy from "@/components/ui/map-canvas-lazy";
import { FormStepper, FormStepperActions } from "@/components/ui/form-stepper";
import { PageHeader } from "@/components/layout/page-header";
import { AnimatePresence, m } from "framer-motion";
import { slideUp, scaleIn, staggerContainer, staggerItem, fade, motionSafe, duration, easeOut } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { type ContactInfo, type ContactType, type ItemCategory, type LocationCoords } from "@/lib/types";
import { cn, generateTrackingCode, isPointInPolygon, normalizeGeoPolygon } from "@/lib/utils";
import {
  addLostItem,
} from "@/lib/database";
import { useAuth } from "@/contexts/auth-context";
import { useCategories, useContactTypes } from "@/contexts/DataContext";
import { AUTH_ROUTES } from "@/lib/auth-routes";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { useMapView } from "@/hooks/use-map-view";
import { getMapDisplayPosition } from "@/lib/geolocation";
import { logItemCreated } from "@/lib/logger";
import type { MatchScore } from "@/lib/matching";
import { FieldValidationMessage } from "@/components/ui/field-validation-message";
import { inputStateClass } from "@/components/ui/validated-field";
import { ValidationSummary } from "@/components/ui/validation-summary";
import { fieldErrorId, fieldId, recordToIssues } from "@/lib/feedback/types";

const LOST_FORM_STEPS = [
  { id: "details", label: "รายละเอียด" },
  { id: "location", label: "สถานที่" },
  { id: "contact", label: "ติดต่อ" },
] as const;

export default function ReportLostPage() {
  const router = useRouter();
  const { user, loading: authLoading, authHydrating, appSettings } = useAuth();
  const authPending = authLoading || authHydrating;
  const { categories, loading: categoriesLoading } = useCategories();
  const { contactTypes, loading: contactTypesLoading } = useContactTypes();
  const configLoading = categoriesLoading || contactTypesLoading;
  const { showAlert, dialog } = useAppDialog();
  const reduced = useReducedMotion();
  const successMotion = motionSafe(scaleIn, reduced);
  const successIconMotion = motionSafe(
    {
      initial: { opacity: 0, scale: 0.88 },
      animate: { opacity: 1, scale: 1 },
      transition: { duration: duration.normal, ease: easeOut, delay: 0.06 },
    },
    reduced
  );
  const [formStep, setFormStep] = useState(0);

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
  const [matches, setMatches] = useState<MatchScore[]>([]);
  const contactTypeSeededRef = useRef(false);

  const mapFallbackCenter = appSettings.mapDefaultCenter || { lat: 13.7563, lng: 100.5018 };
  const mapFallbackZoom = appSettings.mapDefaultZoom ?? 17;

  const schoolBoundary = useMemo(
    () => normalizeGeoPolygon(appSettings.mapSchoolBoundary),
    [appSettings.mapSchoolBoundary]
  );

  const boundaryEnforced = schoolBoundary.length >= 3;

  const stepErrorIssues = useMemo(() => {
    const keys =
      formStep === 0
        ? ["itemName", "category"]
        : formStep === 1
          ? ["locationLost"]
          : ["contacts"];
    return recordToIssues(errors).filter((issue) =>
      keys.includes(issue.fieldId.replace("field-", ""))
    );
  }, [errors, formStep]);

  const isWithinSchoolBoundary = (coords: { lat: number; lng: number }) =>
    !boundaryEnforced || isPointInPolygon(coords, schoolBoundary);

  const {
    center: formMapCenter,
    zoom: formMapZoom,
    fitPoints: formFitPoints,
  } = useMapView({
    enabled: appSettings.mapsEnabled,
    fallbackCenter: mapFallbackCenter,
    fallbackZoom: mapFallbackZoom,
    polygon: appSettings.mapSchoolBoundary,
    marker: locationCoords,
    locateUser: true,
  });

  useEffect(() => {
    if (contactTypeSeededRef.current || contactTypes.length === 0) return;
    contactTypeSeededRef.current = true;
    setContacts([{ type: contactTypes[0].value as ContactType, value: "" }]);
  }, [contactTypes]);

  useEffect(() => {
    if (!authPending && !user) {
      router.push(AUTH_ROUTES.hub);
    }
  }, [user, authPending, router]);

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
    if (!isWithinSchoolBoundary(coords)) return;
    setLocationCoords(coords);
    setErrors((prev) => ({ ...prev, locationCoords: "" }));
  };

  const handleUseCurrentLocation = () => {
    void getMapDisplayPosition((coords) => {
      if (isWithinSchoolBoundary(coords)) {
        setLocationCoords(coords);
      }
    }).then((coords) => {
      if (!coords || !isWithinSchoolBoundary(coords)) return;
      setLocationCoords(coords);
      setErrors((prev) => ({ ...prev, locationCoords: "" }));
    });
  };

  const validateStep = (step: number) => {
    const nextErrors: Record<string, string> = {};
    let outsideBoundary = false;

    if (step === 0) {
      if (!formData.itemName.trim()) {
        nextErrors.itemName = "กรุณากรอกชื่อสิ่งของ";
      }
      if (!formData.category) {
        nextErrors.category = "กรุณาเลือกประเภท";
      }
    }

    if (step === 1) {
      if (!formData.locationLost.trim()) {
        nextErrors.locationLost = "กรุณากรอกสถานที่ทำหาย";
      }
      if (
        locationCoords &&
        boundaryEnforced &&
        !isPointInPolygon(locationCoords, schoolBoundary)
      ) {
        outsideBoundary = true;
      }
    }

    if (step === 2) {
      const validContacts = contacts.filter((c) => c.value.trim());
      if (validContacts.length === 0) {
        nextErrors.contacts = "กรุณากรอกช่องทางการติดต่ออย่างน้อย 1 ช่องทาง";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 && !outsideBoundary;
  };

  const goNextStep = () => {
    if (!validateStep(formStep)) return;
    setFormStep((s) => Math.min(s + 1, LOST_FORM_STEPS.length - 1));
  };

  const goPrevStep = () => {
    setFormStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    if (!validateStep(2)) return;

    setIsSubmitting(true);
    try {
      const newTrackingCode = generateTrackingCode();
      setTrackingCode(newTrackingCode);

      const validContacts = contacts.filter((c) => c.value.trim());

      const itemId = await addLostItem({
        itemName: formData.itemName,
        category: formData.category as ItemCategory,
        description: formData.description.trim() || formData.itemName,
        locationLost: formData.locationLost,
        locationPlaceName: formData.locationLost,
        contacts: validContacts,
        trackingCode: newTrackingCode,
        status: "searching",
        dateLost: new Date(),
        ...(locationCoords ? { locationCoords } : {}),
        ...(user?.uid ? { userId: user.uid } : {}),
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
      void showAlert({
        title: "ส่งข้อมูลไม่สำเร็จ",
        message: "เกิดข้อผิดพลาด กรุณาตรวจสอบข้อมูลที่จำเป็นแล้วลองใหม่อีกครั้ง",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if ((authLoading && !user) || configLoading) {
    return (
      <div className="min-h-screen bg-bg-secondary dark:bg-bg-primary flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-line-green" aria-label="กำลังโหลด" />
      </div>
    );
  }

  if (!user) {
    return (
      <StudentAppShell headerTitle="แจ้งของหาย" headerBackHref="/home">
        <LoginPrompt
          title="เข้าสู่ระบบเพื่อแจ้งของหาย"
          description="คุณต้องเข้าสู่ระบบเพื่อแจ้งของหาย เพื่อให้เราแจ้งเตือนคุณเมื่อมีคนเจอของ"
          feature="รับการแจ้งเตือนอัตโนมัติเมื่อมีคนเจอของคุณ!"
        />
      </StudentAppShell>
    );
  }

  if (showSuccess) {
    return (
      <StudentAppShell headerTitle="แจ้งของหายสำเร็จ" showBottomNav maxWidth="lg">
          <div className="flex flex-col items-center justify-center py-4 md:py-8">
            <m.div
              className="w-full max-w-lg bg-bg-card rounded-xl border border-border-light p-6 md:p-8 text-center"
              initial={reduced ? false : successMotion.initial}
              animate={successMotion.animate}
              transition={successMotion.transition}
            >
              <m.div
                className="w-14 h-14 rounded-full bg-bg-secondary flex items-center justify-center mb-5 mx-auto"
                initial={reduced ? false : successIconMotion.initial}
                animate={successIconMotion.animate}
                transition={successIconMotion.transition}
              >
                <CheckCircle2 className="w-7 h-7 text-line-green" aria-hidden />
              </m.div>

              <h2 className="text-lg font-semibold text-text-primary mb-2 text-balance">
                แจ้งของหายเรียบร้อย!
              </h2>
              <p className="text-text-secondary text-center text-sm mb-6 text-pretty">
                เราจะแจ้งเตือนคุณเมื่อมีคนพบของ
              </p>

              <div className="w-full bg-bg-secondary rounded-xl p-5 mb-6 border border-border-light">
                <p className="text-sm text-text-secondary text-center mb-1">รหัสติดตาม</p>
                <p className="text-xl font-semibold text-text-primary text-center tracking-wider font-mono">
                  {trackingCode}
                </p>
                <p className="text-xs text-text-tertiary text-center mt-2">
                  กรุณาบันทึกรหัสนี้ไว้เพื่อติดตามสถานะ
                </p>
              </div>

              {showMatches && matches.length > 0 && (
                <m.div
                  className="mt-6 text-left"
                  initial={reduced ? false : fade.initial}
                  animate={fade.animate}
                  transition={{ ...fade.transition, delay: reduced ? 0 : 0.12 }}
                >
                  <div className="rounded-xl border border-border-light bg-bg-secondary p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Search className="w-4 h-4 text-text-tertiary" aria-hidden />
                      <h3 className="text-sm font-medium text-text-primary">
                        พบของที่อาจตรงกัน ({matches.length} รายการ)
                      </h3>
                    </div>
                    <m.div
                      className="space-y-2"
                      variants={
                        reduced
                          ? undefined
                          : {
                              initial: {},
                              animate: staggerContainer.animate,
                            }
                      }
                      initial={reduced ? false : "initial"}
                      animate="animate"
                    >
                      {matches.slice(0, 3).map((match) => (
                        <m.div
                          key={match.foundItem.id}
                          variants={reduced ? undefined : staggerItem}
                          className="bg-bg-card rounded-lg p-3 border border-border-light"
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
                                      ? "bg-status-success-light text-line-green"
                                      : match.confidence === "medium"
                                        ? "bg-status-warning-light text-status-warning"
                                        : "bg-bg-tertiary text-text-secondary"
                                  )}
                                >
                                  ความน่าจะเป็น {match.scorePercentage ?? Math.round(match.score * 100)}%
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                router.push(`/tracking?code=${match.foundItem.trackingCode}`)
                              }
                              className="ml-3 min-h-11 px-3 border border-line-green text-line-green text-sm rounded-lg hover:bg-line-green-light transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35"
                            >
                              ดู
                            </button>
                          </div>
                        </m.div>
                      ))}
                    </m.div>
                    <button
                      type="button"
                      onClick={() => router.push(`/tracking?code=${trackingCode}`)}
                      className="w-full mt-3 py-2 text-sm text-line-green hover:text-line-green-hover font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 rounded-lg"
                    >
                      ดูทั้งหมด →
                    </button>
                  </div>
                </m.div>
              )}

              <div className="w-full space-y-3 mt-8">
                <button
                  type="button"
                  onClick={() => router.push("/tracking")}
                  className="w-full min-h-11 py-2.5 bg-line-green text-white rounded-xl font-medium hover:bg-line-green-hover transition-[transform,colors] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35"
                >
                  ติดตามสถานะ
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/home")}
                  className="w-full min-h-11 py-2.5 bg-bg-secondary text-text-secondary rounded-xl font-medium hover:bg-bg-tertiary transition-colors border border-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35"
                >
                  กลับหน้าหลัก
                </button>
              </div>
            </m.div>
          </div>
      </StudentAppShell>
    );
  }

  return (
    <StudentAppShell headerTitle="แจ้งของหาย" headerBackHref="/home" showBottomNav maxWidth="lg">
        <PageHeader
          title="แจ้งของหาย"
          subtitle="กรอกข้อมูลให้ละเอียดเพื่อให้ง่ายต่อการค้นหา"
          className="hidden shell-desktop:flex mb-6"
        />

        <FormStepper steps={[...LOST_FORM_STEPS]} currentStep={formStep} className="mb-6" />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (formStep < LOST_FORM_STEPS.length - 1) goNextStep();
            else void handleSubmit();
          }}
          className="form-sticky-footer-padding shell-desktop:pb-4"
        >
          <AnimatePresence mode="wait">
            <m.div
              key={formStep}
              initial={reduced ? false : slideUp.initial}
              animate={slideUp.animate}
              exit={slideUp.exit}
              transition={slideUp.transition}
              className="space-y-5"
            >
            <ValidationSummary issues={stepErrorIssues} className="mb-1" />
            {formStep === 0 && (
            <>
            <div>
              <label htmlFor={fieldId("itemName")} className="block text-sm font-medium text-text-secondary mb-2">
                ชื่อสิ่งของ <span className="text-status-error">*</span>
              </label>
              <input
                id={fieldId("itemName")}
                type="text"
                name="itemName"
                value={formData.itemName}
                onChange={handleFormChange}
                placeholder="เช่น โทรศัพท์, กระเป๋าสตางค์"
                aria-invalid={errors.itemName ? true : undefined}
                aria-describedby={errors.itemName ? fieldErrorId("itemName") : undefined}
                className={cn("input-line", inputStateClass(errors.itemName))}
              />
              <FieldValidationMessage
                id={fieldErrorId("itemName")}
                message={errors.itemName}
              />
            </div>

            <div>
              <label htmlFor={fieldId("category")} className="block text-sm font-medium text-text-secondary mb-2">
                ประเภท <span className="text-status-error">*</span>
              </label>
              <div className="relative">
                <select
                  id={fieldId("category")}
                  name="category"
                  value={formData.category}
                  onChange={handleFormChange}
                  aria-invalid={errors.category ? true : undefined}
                  aria-describedby={errors.category ? fieldErrorId("category") : undefined}
                  className={cn(
                    "input-line appearance-none pr-10",
                    inputStateClass(errors.category),
                    !formData.category && "text-text-tertiary"
                  )}
                >
                  <option value="">เลือกประเภท</option>
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary pointer-events-none" />
              </div>
              <FieldValidationMessage
                id={fieldErrorId("category")}
                message={errors.category}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
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
            </>
            )}

            {formStep === 1 && (
            <>
            <div>
              <label htmlFor={fieldId("locationLost")} className="block text-sm font-medium text-text-secondary mb-2">
                สถานที่ทำหาย <span className="text-status-error">*</span>
              </label>
              <input
                id={fieldId("locationLost")}
                type="text"
                name="locationLost"
                value={formData.locationLost}
                onChange={handleFormChange}
                placeholder="เช่น ตึก 2 ชั้น 3"
                aria-invalid={errors.locationLost ? true : undefined}
                aria-describedby={errors.locationLost ? fieldErrorId("locationLost") : undefined}
                className={cn("input-line", inputStateClass(errors.locationLost))}
              />
              <FieldValidationMessage
                id={fieldErrorId("locationLost")}
                message={errors.locationLost}
              />
            </div>

            {appSettings.mapsEnabled && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-sm font-medium text-text-secondary">
                    ปักพิกัดบนแผนที่ (ถ้ามี)
                  </label>
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    className="inline-flex items-center gap-1 min-h-11 px-2 -mr-2 text-sm text-line-green hover:text-line-green-hover shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 rounded-lg"
                  >
                    <MapPin className="w-3 h-3" />
                    ใช้ตำแหน่งปัจจุบัน
                  </button>
                </div>
                <MapCanvasLazy
                  center={formMapCenter}
                  zoom={formMapZoom}
                  fitPoints={formFitPoints}
                  tileUrl={appSettings.mapTileUrl || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"}
                  attribution={appSettings.mapAttribution || ""}
                  mode="marker"
                  marker={locationCoords}
                  onMarkerChange={handleMapSelect}
                  polygon={schoolBoundary}
                  showPolygonVertices={false}
                  className="h-[200px] sm:h-[240px] rounded-xl overflow-hidden"
                />
                {boundaryEnforced && (
                  <p className="text-xs text-text-tertiary">
                    ปักพิกัดได้เฉพาะภายในกรอบเขตโรงเรียน
                  </p>
                )}
              </div>
            )}
            </>
            )}

            {formStep === 2 && (
            <>
            <div className="pt-1">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    ช่องทางติดต่อ <span className="text-status-error">*</span>
                  </p>
                  <p className="text-xs text-text-tertiary mt-0.5">อย่างน้อย 1 ช่องทาง</p>
                </div>
                {contacts.length < 3 && (
                  <button
                    type="button"
                    onClick={addContact}
                    className="inline-flex items-center gap-1 min-h-11 px-2 -mr-2 text-sm text-line-green font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 rounded-lg"
                  >
                    <Plus className="w-4 h-4" />
                    เพิ่ม
                  </button>
                )}
              </div>
            </div>

            <div id={fieldId("contacts")}>
              <FieldValidationMessage
                id={fieldErrorId("contacts")}
                message={errors.contacts}
              />
            </div>

            <div className="space-y-3">
              {contacts.map((contact, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(7rem,auto)_1fr_auto] sm:items-center"
                >
                  <div className="relative min-w-0">
                    <select
                      value={contact.type}
                      onChange={(e) => handleContactChange(index, "type", e.target.value)}
                      className="w-full h-11 px-2 input-line appearance-none pr-7 text-sm"
                    >
                      {contactTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.icon} {type.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
                  </div>

                  <input
                    type="text"
                    value={contact.value}
                    onChange={(e) => handleContactChange(index, "value", e.target.value)}
                    placeholder={
                      contactTypes.find((t) => t.value === contact.type)?.placeholder || ""
                    }
                    className="input-line h-11 min-w-0"
                  />

                  <button
                    type="button"
                    onClick={() => removeContact(index)}
                    className="w-full min-h-11 h-11 sm:w-11 flex items-center justify-center rounded-xl bg-status-error-light text-status-error hover:bg-status-error-light/80 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-error/35"
                    aria-label="ลบช่องทางติดต่อ"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
            </>
            )}
            </m.div>
          </AnimatePresence>

          <FormStepperActions
            currentStep={formStep}
            totalSteps={LOST_FORM_STEPS.length}
            onBack={goPrevStep}
            onNext={goNextStep}
            onSubmit={() => void handleSubmit()}
            submitLabel="ส่งแจ้งของหาย"
            isSubmitting={isSubmitting}
            className="mt-6"
          />
        </form>
      {dialog}
    </StudentAppShell>
  );
}