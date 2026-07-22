"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  Loader2,
  MapPin,
  PenLine,
  Plus,
  Search,
  X,
} from "lucide-react";
import LoginPrompt from "@/components/auth/login-prompt";
import { StudentAppShell } from "@/components/layout/student-app-shell";
import { PageHeader } from "@/components/layout/page-header";
import InfoTooltip from "@/components/ui/info-tooltip";
import CameraCapture from "@/components/ui/camera-capture";
import MapCanvasLazy from "@/components/ui/map-canvas-lazy";
import { FormStepper, FormStepperActions } from "@/components/ui/form-stepper";
import { AnimatePresence, m } from "framer-motion";
import { slideUp, scaleIn, staggerContainer, staggerItem, fade, motionSafe, duration, easeOut } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  type ContactInfo,
  type ContactType,
  DEFAULT_FOUND_DROP_OFF_LOCATION,
  type ItemCategory,
  type LocationCoords,
  getDropOffLocationLabel,
} from "@/lib/types";
import {
  cn,
  generateTrackingCode,
  isPointInPolygon,
} from "@/lib/utils";
import {
  addFoundItem,
} from "@/lib/database";
import { uploadFoundItemImage } from "@/lib/storage";
import {
  getCompressionOptionsFromSettings,
  getMaxUploadBytes,
} from "@/lib/image-upload-settings";
import { getMapDisplayPosition } from "@/lib/geolocation";
import { useFoundLocationGate } from "@/hooks/use-found-location-gate";
import { LocationPermissionGate } from "@/components/shared/location-permission-gate";
import { useAuth } from "@/contexts/auth-context";
import { useCategories, useContactTypes } from "@/contexts/DataContext";
import { AUTH_ROUTES } from "@/lib/auth-routes";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { useMapView } from "@/hooks/use-map-view";
import { logItemCreated } from "@/lib/logger";
import type { MatchScore } from "@/lib/matching";
import {
  computeHandoverDeadlineFromNow,
  formatHandoverCountdown,
  formatHandoverDeadlineThai,
  getFoundHandoverDeadlineMinutes,
  isFoundHandoverDeadlineEnabled,
} from "@/lib/found-handover";
import { triggerFoundHandoverExpirySweep } from "@/lib/found-handover-client";
import { FieldValidationMessage } from "@/components/ui/field-validation-message";
import { inputStateClass } from "@/components/ui/validated-field";
import { ValidationSummaryGroup } from "@/components/ui/validation-summary";
import { fieldErrorId, fieldId, recordToIssues } from "@/lib/feedback/types";

type ReportMode = "vision" | "manual";

const FOUND_FORM_STEPS = [
  { id: "details", label: "รายละเอียด" },
  { id: "location", label: "สถานที่" },
  { id: "handover", label: "ส่งห้องบุคคล" },
] as const;

const PERSONNEL_OFFICE_LABEL = getDropOffLocationLabel(DEFAULT_FOUND_DROP_OFF_LOCATION);

export default function ReportFoundPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, loading: authLoading, authHydrating, appSettings, appSettingsReady, isAdmin } = useAuth();
  const authPending = authLoading || authHydrating;
  const { categories, loading: categoriesLoading } = useCategories();
  const { contactTypes, loading: contactTypesLoading } = useContactTypes();
  const configLoading = categoriesLoading || contactTypesLoading;
  const { showAlert, dialog } = useAppDialog();
  const reduced = useReducedMotion();
  const stepMotion = motionSafe(slideUp, reduced);
  const panelMotion = motionSafe(
    {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -6 },
      transition: { duration: duration.fast, ease: easeOut },
    },
    reduced
  );
  const successMotion = motionSafe(scaleIn, reduced);
  const successIconMotion = motionSafe(
    {
      initial: { opacity: 0, scale: 0.88 },
      animate: { opacity: 1, scale: 1 },
      transition: { duration: duration.normal, ease: easeOut, delay: 0.06 },
    },
    reduced
  );
  const reportModeLayoutId = "found-report-mode-indicator";
  const [formStep, setFormStep] = useState(0);

  const [reportMode, setReportMode] = useState<ReportMode>("vision");
  const [visionQuota, setVisionQuota] = useState<{
    enabled: boolean;
    userRemainingMinute: number;
    userRemainingHour: number;
    userLimitPerMinute?: number;
    userLimitPerHour?: number;
  } | null>(null);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [isAnalyzingVision, setIsAnalyzingVision] = useState(false);

  const [formData, setFormData] = useState({
    itemName: "",
    category: "" as ItemCategory | "",
    color: "",
    brand: "",
    description: "",
    locationFound: "",
  });

  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [locationCoords, setLocationCoords] = useState<LocationCoords | null>(null);

  const {
    gpsLoading,
    locationVerified,
    locationErrorType,
    userCurrentCoords,
    polygon: schoolPolygonNormalized,
    showBlockingGate,
    retryPermission,
    bypassAsAdmin,
    setAdminGpsBypassed,
  } = useFoundLocationGate({
    appSettings,
    appSettingsReady,
    enabled: Boolean(user) && !authPending && !configLoading,
    mode: "blocking",
    isAdmin,
    onVerifiedCoords: (coords) => setLocationCoords(coords),
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [trackingCode, setTrackingCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});

  const stepFieldKeys = useMemo(() => {
    if (formStep === 0) {
      return {
        errors: ["image", "description"],
        warnings: ["itemName", "category", "color", "brand"],
      };
    }
    if (formStep === 1) {
      return { errors: ["locationFound", "locationCoords"], warnings: [] as string[] };
    }
    return { errors: [] as string[], warnings: ["contacts"] };
  }, [formStep]);

  const stepErrorIssues = useMemo(
    () =>
      recordToIssues(errors).filter((issue) =>
        stepFieldKeys.errors.includes(issue.fieldId.replace("field-", ""))
      ),
    [errors, stepFieldKeys.errors]
  );

  const stepWarningIssues = useMemo(
    () =>
      recordToIssues(warnings, "warning").filter((issue) =>
        stepFieldKeys.warnings.includes(issue.fieldId.replace("field-", ""))
      ),
    [warnings, stepFieldKeys.warnings]
  );

  const [showMatches, setShowMatches] = useState(false);
  const [matches, setMatches] = useState<MatchScore[]>([]);
  const [submittedHandoverDeadline, setSubmittedHandoverDeadline] = useState<Date | null>(null);
  const [handoverCountdownMs, setHandoverCountdownMs] = useState<number | null>(null);

  useEffect(() => {
    if (!authPending && !user) {
      router.push(AUTH_ROUTES.hub);
    }
  }, [user, authPending, router]);

  useEffect(() => {
    if (user) {
      void triggerFoundHandoverExpirySweep();
    }
  }, [user]);

  useEffect(() => {
    if (!showSuccess || !submittedHandoverDeadline) {
      setHandoverCountdownMs(null);
      return;
    }
    const tick = () => {
      setHandoverCountdownMs(submittedHandoverDeadline.getTime() - Date.now());
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [showSuccess, submittedHandoverDeadline]);

  useEffect(() => {
    const fetchQuota = async () => {
      if (!user?.uid || reportMode !== "vision") return;
      try {
        const response = await fetch(`/api/vision?userId=${user.uid}`);
        if (response.ok) {
          const data = await response.json();
          setVisionQuota(data);
        }
      } catch (error) {
        console.error("Error fetching vision quota:", error);
      }
    };

    fetchQuota();
    const interval = setInterval(fetchQuota, 30000);
    return () => clearInterval(interval);
  }, [user?.uid, reportMode]);

  const waitingForSettings =
    !authLoading && !configLoading && !!user && !appSettingsReady;
  const showLocationGate = waitingForSettings || showBlockingGate;

  const mapFallbackCenter = useMemo(
    () => appSettings.mapDefaultCenter || { lat: 13.7563, lng: 100.5018 },
    [appSettings.mapDefaultCenter]
  );
  const mapFallbackZoom = appSettings.mapDefaultZoom ?? 17;
  const schoolPolygon = useMemo(
    () =>
      schoolPolygonNormalized.length > 0
        ? schoolPolygonNormalized
        : appSettings.mapSchoolBoundary || [],
    [schoolPolygonNormalized, appSettings.mapSchoolBoundary]
  );

  const {
    center: formMapCenter,
    zoom: formMapZoom,
    fitPoints: formFitPoints,
  } = useMapView({
    enabled: appSettings.mapsEnabled,
    fallbackCenter: mapFallbackCenter,
    fallbackZoom: mapFallbackZoom,
    polygon: schoolPolygon,
    marker: locationCoords,
    locateUser: true,
  });

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
    if (warnings[name]) {
      setWarnings((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleContactChange = (index: number, field: "type" | "value", value: string) => {
    const nextContacts = [...contacts];
    nextContacts[index] = { ...nextContacts[index], [field]: value };
    setContacts(nextContacts);
  };

  const addContact = () => {
    if (contacts.length < 3) {
      const defaultType = contactTypes[0]?.value as ContactType | undefined;
      setContacts([...contacts, { type: defaultType || "phone", value: "" }]);
    }
  };

  const removeContact = (index: number) => {
    setContacts(contacts.filter((_, i) => i !== index));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxBytes = getMaxUploadBytes(appSettings);
    if (file.size > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      void showAlert({
        title: "ไฟล์ใหญ่เกินไป",
        message: `กรุณาเลือกรูปที่มีขนาดไม่เกิน ${maxMb} MB`,
        variant: "warning",
      });
      return;
    }
    if (!file.type.startsWith("image/")) {
      void showAlert({
        title: "ไฟล์ไม่ถูกต้อง",
        message: "กรุณาเลือกไฟล์รูปภาพ (PNG, JPG)",
        variant: "warning",
      });
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    if (errors.image) setErrors((prev) => ({ ...prev, image: "" }));
  };

  const clearImage = () => {
    setImagePreview(null);
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAnalyzeVision = async (dataUrl: string) => {
    if (!user?.uid) return;
    setIsAnalyzingVision(true);
    setVisionError(null);

    try {
      const response = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: dataUrl,
          userId: user.uid,
        }),
      });

      const result = await response.json();

      if (response.status === 429) {
        setVisionError(result.message || "AI rate limit exceeded. Please try again shortly.");
        return;
      }

      if (!response.ok || !result.data) {
        setVisionError("ไม่สามารถวิเคราะห์รูปได้ในขณะนี้");
        return;
      }

      const data = result.data;
      setFormData((prev) => ({
        ...prev,
        itemName: data.itemName || prev.itemName,
        category: data.category || prev.category,
        color: data.color || prev.color,
        brand: data.brand || prev.brand,
        description: prev.description || data.details || "",
      }));
    } catch (error) {
      console.error("Vision error:", error);
      setVisionError("เกิดข้อผิดพลาดในการวิเคราะห์รูป");
    } finally {
      setIsAnalyzingVision(false);
    }
  };

  const handleCameraCapture = async (dataUrl: string, file: File) => {
    setImagePreview(dataUrl);
    setImageFile(file);
    if (reportMode === "vision") {
      await handleAnalyzeVision(dataUrl);
    }
  };

  const handleMapSelect = (coords: LocationCoords | null) => {
    if (!coords) return;
    setLocationCoords(coords);
    setErrors((prev) => ({ ...prev, locationCoords: "" }));
  };

  const handleUseCurrentLocation = () => {
    void getMapDisplayPosition((coords) => {
      setLocationCoords(coords);
    }).then((coords) => {
      if (!coords) {
        setErrors((prev) => ({ ...prev, locationCoords: "ไม่สามารถระบุตำแหน่งได้" }));
        return;
      }
      setLocationCoords(coords);
      setErrors((prev) => ({ ...prev, locationCoords: "" }));
    });
  };

  const validateStep = (step: number) => {
    const nextErrors: Record<string, string> = {};
    const nextWarnings: Record<string, string> = {};

    if (step === 0) {
      if (!imageFile) {
        nextErrors.image = "กรุณาถ่ายรูปสิ่งของ";
      }
      if (!formData.description.trim() && !formData.itemName.trim()) {
        nextErrors.description = "กรุณากรอกชื่อหรือรายละเอียดของที่เจอ";
      }
      if (!formData.itemName.trim()) {
        nextWarnings.itemName = "ยังไม่ได้กรอกชื่อ (ไม่บังคับ)";
      }
      if (!formData.category) {
        nextWarnings.category = "ยังไม่ได้เลือกหมวดหมู่ (ไม่บังคับ)";
      }
      if (!formData.color.trim()) {
        nextWarnings.color = "ยังไม่ได้กรอกสี (ไม่บังคับ)";
      }
      if (!formData.brand.trim()) {
        nextWarnings.brand = "ยังไม่ได้กรอกยี่ห้อ (ไม่บังคับ)";
      }
    }

    if (step === 1) {
      if (!formData.locationFound.trim()) {
        nextErrors.locationFound = "กรุณากรอกสถานที่เจอของ";
      }
      const polygon = appSettings.mapSchoolBoundary || [];
      if (appSettings.mapEnforceFoundInSchool && polygon.length >= 3) {
        if (!locationCoords) {
          nextErrors.locationCoords = "กรุณาปักพิกัดภายในโรงเรียน";
        } else if (!isPointInPolygon(locationCoords, polygon)) {
          nextErrors.locationCoords = "พิกัดอยู่นอกพื้นที่โรงเรียน";
        }
      }
    }

    if (step === 2) {
      if (contacts.length === 0) {
        nextWarnings.contacts = "ยังไม่ได้เพิ่มช่องทางติดต่อ (ไม่บังคับ)";
      }
    }

    setErrors(nextErrors);
    setWarnings(nextWarnings);
    return Object.keys(nextErrors).length === 0;
  };

  const goNextStep = () => {
    if (!validateStep(formStep)) return;
    setFormStep((s) => Math.min(s + 1, FOUND_FORM_STEPS.length - 1));
  };

  const goPrevStep = () => {
    setFormStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    if (!validateStep(FOUND_FORM_STEPS.length - 1)) return;

    setIsSubmitting(true);
    try {
      const newTrackingCode = generateTrackingCode("found");
      setTrackingCode(newTrackingCode);

      let photoUrl = "";
      if (imageFile) {
        photoUrl = await uploadFoundItemImage(
          imageFile,
          newTrackingCode,
          true,
          getCompressionOptionsFromSettings(appSettings)
        );
      }

      const validContacts = contacts.filter((c) => c.value.trim());
      const description =
        formData.description.trim() ||
        [formData.itemName, formData.color, formData.brand].filter(Boolean).join(" ");

      const handoverDeadlineAt = computeHandoverDeadlineFromNow(appSettings);
      if (handoverDeadlineAt) {
        setSubmittedHandoverDeadline(handoverDeadlineAt);
      } else {
        setSubmittedHandoverDeadline(null);
      }

      const itemId = await addFoundItem({
        description,
        locationFound: formData.locationFound,
        locationPlaceName: formData.locationFound,
        dropOffLocation: DEFAULT_FOUND_DROP_OFF_LOCATION,
        trackingCode: newTrackingCode,
        status: "pending_room_confirm",
        roomHandoverConfirmed: false,
        dateFound: new Date(),
        ...(handoverDeadlineAt ? { handoverDeadlineAt } : {}),
        ...(photoUrl ? { photoUrl } : {}),
        ...(formData.itemName.trim() ? { itemName: formData.itemName.trim() } : {}),
        ...(formData.category ? { category: formData.category as ItemCategory } : {}),
        ...(formData.color.trim() ? { color: formData.color.trim() } : {}),
        ...(formData.brand.trim() ? { brand: formData.brand.trim() } : {}),
        ...(locationCoords ? { locationCoords } : {}),
        ...(validContacts.length > 0 ? { finderContacts: validContacts } : {}),
        ...(user?.uid ? { userId: user.uid } : {}),
      });

      await logItemCreated(
        "found",
        itemId,
        description.substring(0, 50),
        newTrackingCode,
        user?.email || undefined,
        user?.displayName || undefined
      );

      try {
        const matchResponse = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "found", itemId }),
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
      <StudentAppShell headerTitle="แจ้งเจอของ" headerBackHref="/home">
        <LoginPrompt
          title="เข้าสู่ระบบเพื่อแจ้งเจอของ"
          description="คุณต้องเข้าสู่ระบบเพื่อแจ้งเจอของ เพื่อให้เจ้าของติดต่อกลับได้"
          feature="ช่วยให้เจ้าของได้รับของคืนอย่างปลอดภัย!"
        />
      </StudentAppShell>
    );
  }



  if (showSuccess) {
    return (
      <StudentAppShell headerTitle="แจ้งเจอของสำเร็จ" showBottomNav maxWidth="lg">
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
                ขอบคุณที่ช่วยส่งคืน!
              </h2>
              <p className="text-text-secondary text-center text-sm mb-6 text-pretty">
                ข้อมูลของคุณจะช่วยให้เจ้าของได้รับของคืน
              </p>

              <div className="w-full bg-bg-secondary rounded-xl p-5 mb-6 border border-border-light">
                <p className="text-sm text-text-secondary text-center mb-1">รหัสอ้างอิง</p>
                <p className="text-xl font-semibold text-text-primary text-center tracking-wider font-mono">
                  {trackingCode}
                </p>
                <p className="text-xs text-text-tertiary text-center mt-2">
                  ส่งรหัสนี้ให้เจ้าของเพื่อมารับของคืน
                </p>
              </div>

              <div className="w-full rounded-xl border border-border-light bg-bg-secondary p-4 mb-6 text-left space-y-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    ขั้นตอนถัดไป: นำของไปส่งที่ {PERSONNEL_OFFICE_LABEL}
                  </p>
                  <p className="text-xs text-text-secondary mt-1.5 leading-relaxed text-pretty">
                    เจ้าหน้าที่ห้องบุคคลจะยืนยันเมื่อรับของแล้ว จากนั้นเจ้าของจึงจะมารับคืนได้อย่างปลอดภัย
                  </p>
                </div>
                {isFoundHandoverDeadlineEnabled(appSettings) && submittedHandoverDeadline && (
                  <div className="rounded-lg border border-status-warning/20 bg-status-warning-light/50 px-3 py-2.5">
                    <p className="text-xs text-text-secondary">
                      ภายใน {getFoundHandoverDeadlineMinutes(appSettings)} นาที (
                      {formatHandoverDeadlineThai(submittedHandoverDeadline)})
                    </p>
                    {handoverCountdownMs !== null && (
                      <p
                        className={cn(
                          "text-sm font-medium mt-1",
                          handoverCountdownMs <= 0
                            ? "text-status-error"
                            : "text-status-warning"
                        )}
                      >
                        {handoverCountdownMs <= 0
                          ? "หมดเวลาแล้ว — คำขอจะถูกยกเลิกอัตโนมัติ"
                          : `เหลือเวลาอีก ${formatHandoverCountdown(handoverCountdownMs)}`}
                      </p>
                    )}
                    <p className="text-xs text-text-secondary mt-1.5">
                      หากไม่นำของถึงห้องบุคคลภายในเวลาที่กำหนด คำขอแจ้งเจอของจะหมดอายุทันที
                    </p>
                  </div>
                )}
                <p className="text-xs text-text-tertiary pt-1 border-t border-border-light">
                  สถานะปัจจุบัน: รอส่งห้องบุคคล
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
                        พบของหายที่อาจตรงกัน ({matches.length} รายการ)
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
                          key={match.lostItem.id}
                          variants={reduced ? undefined : staggerItem}
                          className="bg-bg-card rounded-lg p-3 border border-border-light"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-text-primary text-sm truncate">
                                {match.lostItem.itemName}
                              </p>
                              <p className="text-xs text-text-secondary mt-1 truncate">
                                📍 {match.lostItem.locationLost}
                              </p>
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span
                                  className={cn(
                                    "text-xs px-2 py-0.5 rounded-full",
                                    match.confidence === "high"
                                      ? "bg-line-green-light text-line-green"
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
                                router.push(`/tracking?code=${match.lostItem.trackingCode}`)
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
                  onClick={() => {
                    setShowSuccess(false);
                    setFormData({
                      itemName: "",
                      category: "",
                      color: "",
                      brand: "",
                      description: "",
                      locationFound: "",
                    });
                    setFormStep(0);
                    setSubmittedHandoverDeadline(null);
                    setContacts([]);
                    setImagePreview(null);
                    setImageFile(null);
                    setLocationCoords(null);
                    setShowMatches(false);
                    setMatches([]);
                    setErrors({});
                    setWarnings({});
                  }}
                  className="w-full min-h-11 py-2.5 bg-line-green text-white rounded-xl font-medium hover:bg-line-green-hover transition-[transform,colors] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35"
                >
                  แจ้งเจอของอีกชิ้น
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
    <StudentAppShell headerTitle="แจ้งเจอของ" headerBackHref="/home" showBottomNav maxWidth="lg">
      <div
        className={cn(
          showLocationGate && "opacity-50 pointer-events-none select-none",
          "transition-opacity duration-300 motion-reduce:transition-none"
        )}
      >
        <PageHeader
          title="แจ้งเจอของ"
          subtitle="กรอกข้อมูลให้ละเอียดเพื่อให้เจ้าของตามหาของได้ง่ายขึ้น"
          className="hidden shell-desktop:flex mb-6"
        />

        <FormStepper steps={[...FOUND_FORM_STEPS]} currentStep={formStep} className="mb-6" />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (formStep < FOUND_FORM_STEPS.length - 1) goNextStep();
            else void handleSubmit();
          }}
          className="form-sticky-footer-padding shell-desktop:pb-4"
        >
          <AnimatePresence mode="wait">
            <m.div
              key={formStep}
              initial={reduced ? false : stepMotion.initial}
              animate={stepMotion.animate}
              exit={stepMotion.exit}
              transition={stepMotion.transition}
              className="space-y-5"
            >
          <ValidationSummaryGroup
            errors={stepErrorIssues}
            warnings={stepWarningIssues}
            className="mb-1"
          />
          {formStep === 0 && (
          <>
          <div className="flex gap-2 mb-2 p-1 bg-bg-secondary rounded-xl" role="tablist" aria-label="วิธีกรอกข้อมูล">
            <button
              type="button"
              role="tab"
              aria-selected={reportMode === "vision"}
              onClick={() => setReportMode("vision")}
              className={cn(
                "relative flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 z-[1]",
                reportMode === "vision"
                  ? "text-line-green"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {reportMode === "vision" && !reduced && (
                <m.span
                  layoutId={reportModeLayoutId}
                  className="absolute inset-0 bg-bg-card rounded-lg border border-line-green"
                  transition={{ duration: duration.fast, ease: easeOut }}
                />
              )}
              {reportMode === "vision" && reduced && (
                <span className="absolute inset-0 bg-bg-card rounded-lg border border-line-green" />
              )}
              <span className="relative flex items-center gap-2">
                <Camera className="w-4 h-4" aria-hidden />
                ถ่ายรูปด้วย AI
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={reportMode === "manual"}
              onClick={() => setReportMode("manual")}
              className={cn(
                "relative flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 z-[1]",
                reportMode === "manual"
                  ? "text-line-green"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {reportMode === "manual" && !reduced && (
                <m.span
                  layoutId={reportModeLayoutId}
                  className="absolute inset-0 bg-bg-card rounded-lg border border-line-green"
                  transition={{ duration: duration.fast, ease: easeOut }}
                />
              )}
              {reportMode === "manual" && reduced && (
                <span className="absolute inset-0 bg-bg-card rounded-lg border border-line-green" />
              )}
              <span className="relative flex items-center gap-2">
                <PenLine className="w-4 h-4" aria-hidden />
                กรอกเอง
              </span>
            </button>
          </div>

          <AnimatePresence mode="wait">
          {reportMode === "vision" && (
            <m.div
              key="vision-panel"
              initial={reduced ? false : panelMotion.initial}
              animate={panelMotion.animate}
              exit={panelMotion.exit}
              transition={panelMotion.transition}
              className="rounded-xl border border-border-light bg-bg-secondary p-4 mb-6"
            >
              <div className="flex items-center gap-2 mb-3">
                <Camera className="w-4 h-4 text-text-tertiary" aria-hidden />
                <h3 className="text-sm font-medium text-text-primary">ถ่ายรูปสิ่งของ</h3>
                <InfoTooltip
                  content="ระบบจะวิเคราะห์รูปเพื่อเดาชื่อของ หมวดหมู่ สี และยี่ห้อ"
                  position="bottom"
                />
              </div>
              <CameraCapture
                previewUrl={imagePreview}
                onCapture={handleCameraCapture}
                onClear={clearImage}
                labels={{
                  start: "เปิดกล้อง",
                  capture: "ถ่ายรูป",
                  retake: "ถ่ายใหม่",
                  unavailable: "ไม่พบกล้องในอุปกรณ์นี้",
                  idle: "กล้องยังไม่ถูกเปิด",
                }}
              />
              {errors.image && (
                <FieldValidationMessage message={errors.image} />
              )}
              {visionQuota && visionQuota.enabled && (
                <div className="mt-3 text-xs text-text-tertiary">
                  เหลือ {visionQuota.userRemainingMinute}/{visionQuota.userLimitPerMinute || 5} ครั้ง/นาที
                </div>
              )}
              <AnimatePresence>
              {isAnalyzingVision && (
                <m.div
                  key="analyzing"
                  initial={reduced ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0 }}
                  transition={{ duration: duration.fast, ease: easeOut }}
                  className="mt-3 flex items-center gap-2 text-sm text-text-secondary"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="w-4 h-4 animate-spin text-text-tertiary motion-reduce:animate-none" aria-hidden />
                  กำลังวิเคราะห์รูป...
                </m.div>
              )}
              </AnimatePresence>
              <AnimatePresence>
              {visionError && (
                <m.div
                  key={visionError}
                  initial={reduced ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0 }}
                  transition={{ duration: duration.fast, ease: easeOut }}
                  className="mt-3 text-sm text-status-error"
                  role="alert"
                >
                  {visionError}
                </m.div>
              )}
              </AnimatePresence>
            </m.div>
          )}

          {reportMode === "manual" && (
            <m.div
              key="manual-panel"
              id={fieldId("image")}
              initial={reduced ? false : panelMotion.initial}
              animate={panelMotion.animate}
              exit={panelMotion.exit}
              transition={panelMotion.transition}
            >
              <label className="block text-sm font-medium text-text-secondary mb-3">
                รูปถ่ายสิ่งของ <span className="text-status-error">*</span>
              </label>

              <FieldValidationMessage
                id={fieldErrorId("image")}
                message={errors.image}
                className="mb-2"
              />

              {imagePreview ? (
                <m.div
                  key="preview"
                  initial={reduced ? false : fade.initial}
                  animate={fade.animate}
                  className="relative rounded-xl overflow-hidden bg-bg-tertiary"
                >
                  <Image
                    src={imagePreview}
                    alt={
                      formData.itemName.trim()
                        ? `รูปถ่าย${formData.itemName.trim()}`
                        : "รูปถ่ายสิ่งของที่เจอ"
                    }
                    width={400}
                    height={300}
                    className="w-full h-48 object-cover"
                    unoptimized
                  />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute top-3 right-3 w-11 h-11 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    aria-label="ลบรูป"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </m.div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-48 rounded-xl border border-dashed border-border-light bg-bg-tertiary flex flex-col items-center justify-center gap-3 hover:border-text-tertiary hover:bg-bg-secondary transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-bg-card flex items-center justify-center border border-border-light">
                    <ImagePlus className="w-6 h-6 text-text-tertiary" aria-hidden />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-text-secondary">
                      แตะเพื่ออัปโหลดรูป
                    </p>
                    <p className="text-xs text-text-tertiary mt-1">PNG, JPG สูงสุด 5MB</p>
                  </div>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
            </m.div>
          )}
          </AnimatePresence>

            <div>
              <label htmlFor={fieldId("itemName")} className="block text-sm font-medium text-text-secondary mb-2">
                ชื่อของที่เจอ
              </label>
              <input
                id={fieldId("itemName")}
                type="text"
                name="itemName"
                value={formData.itemName}
                onChange={handleFormChange}
                placeholder="เช่น กระเป๋าสตางค์"
                aria-describedby={warnings.itemName ? fieldErrorId("itemName") : undefined}
                className={cn("input-line", inputStateClass(undefined, warnings.itemName))}
              />
              <FieldValidationMessage
                id={fieldErrorId("itemName")}
                message={warnings.itemName}
                severity="warning"
              />
            </div>

            <div>
              <label htmlFor={fieldId("category")} className="block text-sm font-medium text-text-secondary mb-2">
                หมวดหมู่
              </label>
              <div className="relative">
                <select
                  id={fieldId("category")}
                  name="category"
                  value={formData.category}
                  onChange={handleFormChange}
                  aria-describedby={warnings.category ? fieldErrorId("category") : undefined}
                  className={cn(
                    "input-line appearance-none pr-10",
                    !formData.category && "text-text-tertiary",
                    inputStateClass(undefined, warnings.category)
                  )}
                >
                  <option value="">เลือกหมวดหมู่</option>
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
                message={warnings.category}
                severity="warning"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor={fieldId("color")} className="block text-sm font-medium text-text-secondary mb-2">
                  สี
                </label>
                <input
                  id={fieldId("color")}
                  type="text"
                  name="color"
                  value={formData.color}
                  onChange={handleFormChange}
                  placeholder="เช่น ดำ"
                  aria-describedby={warnings.color ? fieldErrorId("color") : undefined}
                  className={cn("input-line", inputStateClass(undefined, warnings.color))}
                />
                <FieldValidationMessage
                  id={fieldErrorId("color")}
                  message={warnings.color}
                  severity="warning"
                />
              </div>
              <div>
                <label htmlFor={fieldId("brand")} className="block text-sm font-medium text-text-secondary mb-2">
                  ยี่ห้อ
                </label>
                <input
                  id={fieldId("brand")}
                  type="text"
                  name="brand"
                  value={formData.brand}
                  onChange={handleFormChange}
                  placeholder="เช่น Apple"
                  aria-describedby={warnings.brand ? fieldErrorId("brand") : undefined}
                  className={cn("input-line", inputStateClass(undefined, warnings.brand))}
                />
                <FieldValidationMessage
                  id={fieldErrorId("brand")}
                  message={warnings.brand}
                  severity="warning"
                />
              </div>
            </div>

            <div>
              <label htmlFor={fieldId("description")} className="block text-sm font-medium text-text-secondary mb-2">
                รายละเอียดของที่เจอ <span className="text-status-error">*</span>
              </label>
              <textarea
                id={fieldId("description")}
                name="description"
                value={formData.description}
                onChange={handleFormChange}
                placeholder="เช่น มีเคสสีดำ มีรอยสติกเกอร์"
                rows={3}
                aria-invalid={errors.description ? true : undefined}
                aria-describedby={errors.description ? fieldErrorId("description") : undefined}
                className={cn("input-line resize-none", inputStateClass(errors.description))}
              />
              <FieldValidationMessage
                id={fieldErrorId("description")}
                message={errors.description}
              />
            </div>
          </>
          )}

          {formStep === 1 && (
          <>
            <div>
              <label htmlFor={fieldId("locationFound")} className="block text-sm font-medium text-text-secondary mb-2">
                สถานที่เจอ <span className="text-status-error">*</span>
              </label>
              <input
                id={fieldId("locationFound")}
                type="text"
                name="locationFound"
                value={formData.locationFound}
                onChange={handleFormChange}
                placeholder="เช่น ม้านั่งหน้าห้องสมุด"
                aria-invalid={errors.locationFound ? true : undefined}
                aria-describedby={errors.locationFound ? fieldErrorId("locationFound") : undefined}
                className={cn("input-line", inputStateClass(errors.locationFound))}
              />
              <FieldValidationMessage
                id={fieldErrorId("locationFound")}
                message={errors.locationFound}
              />
            </div>

            {appSettings.mapsEnabled && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-text-secondary">
                    ปักพิกัดบนแผนที่
                  </label>
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    className="inline-flex items-center gap-1 min-h-11 px-2 -mr-2 text-sm text-line-green hover:text-line-green-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 rounded-lg"
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
                  polygon={schoolPolygon}
                  showPolygonVertices={false}
                  className="h-[200px] sm:h-[240px] rounded-xl overflow-hidden"
                />
                <FieldValidationMessage
                  id={fieldErrorId("locationCoords")}
                  message={errors.locationCoords}
                />
              </div>
            )}
          </>
          )}

          {formStep === 2 && (
          <>
            <div className="rounded-xl border border-border-light bg-bg-secondary p-4">
              <p className="text-sm font-medium text-text-primary">
                ส่งมอบที่ {PERSONNEL_OFFICE_LABEL}
              </p>
              <p className="text-xs text-text-secondary mt-2 leading-relaxed text-pretty">
                หลังส่งแบบฟอร์ม กรุณานำของไปส่งที่ห้องบุคคลโดยตรง เจ้าหน้าที่จะยืนยันในระบบเมื่อรับของแล้ว
                เพื่อให้เจ้าของมารับคืนได้อย่างปลอดภัย
              </p>
              {isFoundHandoverDeadlineEnabled(appSettings) && (
                <p className="text-xs text-status-warning mt-3 pt-3 border-t border-border-light">
                  ต้องนำของถึงห้องบุคคลภายใน {getFoundHandoverDeadlineMinutes(appSettings)} นาที
                  มิฉะนั้นคำขอแจ้งเจอของจะหมดอายุทันที
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border-light bg-bg-secondary p-4 text-sm space-y-2">
              <p className="font-medium text-text-primary">สรุปก่อนส่ง</p>
              <p className="text-text-secondary">
                ของ: {formData.itemName.trim() || formData.description.trim() || "—"}
              </p>
              <p className="text-text-secondary">เจอที่: {formData.locationFound || "—"}</p>
              <p className="text-text-secondary">ส่งมอบ: {PERSONNEL_OFFICE_LABEL}</p>
            </div>

            <div className="border-t border-border-light pt-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">ข้อมูลติดต่อผู้เจอ</p>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    ไม่บังคับ - สำหรับติดต่อกลับหากต้องการข้อมูลเพิ่ม
                  </p>
                  <FieldValidationMessage
                    id={fieldErrorId("contacts")}
                    message={warnings.contacts}
                    severity="warning"
                    className="mt-1"
                  />
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

            {contacts.length > 0 && (
              <div className="space-y-3">
                {contacts.map((contact, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(7.5rem,auto)_1fr_auto] sm:items-center"
                  >
                    <div className="relative min-w-0 w-full sm:w-auto">
                      <select
                        value={contact.type}
                        onChange={(e) => handleContactChange(index, "type", e.target.value)}
                        className="w-full min-h-11 h-12 px-3 bg-bg-tertiary rounded-xl text-text-primary appearance-none pr-8 focus:outline-none focus:ring-2 focus-visible:ring-line-green border border-border-light"
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
                      className="w-full min-w-0 min-h-11 h-12 px-4 bg-bg-tertiary rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus-visible:ring-line-green border border-border-light"
                    />

                    <button
                      type="button"
                      onClick={() => removeContact(index)}
                      className="w-full min-h-11 h-12 sm:w-12 flex items-center justify-center rounded-xl bg-status-error-light text-status-error hover:bg-status-error-light/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-error/35"
                      aria-label="ลบช่องทางติดต่อ"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
          )}
            </m.div>
          </AnimatePresence>

          <FormStepperActions
            currentStep={formStep}
            totalSteps={FOUND_FORM_STEPS.length}
            onBack={goPrevStep}
            onNext={goNextStep}
            onSubmit={() => void handleSubmit()}
            submitLabel="ส่งแจ้งเจอของ"
            isSubmitting={isSubmitting}
            nextDisabled={showLocationGate}
            className="mt-6"
          />
        </form>
      </div>

      <LocationPermissionGate
        open={showLocationGate}
        onClose={() => router.push("/home")}
        waitingForSettings={waitingForSettings}
        gpsLoading={gpsLoading}
        locationVerified={locationVerified}
        locationErrorType={locationErrorType}
        userCurrentCoords={userCurrentCoords}
        appSettings={appSettings}
        schoolPolygon={schoolPolygon}
        isAdmin={isAdmin}
        onRetry={() => {
          setAdminGpsBypassed(false);
          void retryPermission();
        }}
        onAdminBypass={bypassAsAdmin}
        dismissLabel="กลับหน้าหลัก"
        onDismiss={() => router.push("/home")}
        closeOnBackdrop={false}
        showCloseButton={false}
      />
      {dialog}
    </StudentAppShell>
  );
}