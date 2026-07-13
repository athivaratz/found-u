"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import {
  Loader2,
  Fingerprint,
  Shield,
  KeyRound,
  User,
  LogOut,
  Save,
  Mail,
  Hash,
  Unlink2,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { UserAvatar } from "@/components/user/user-avatar";
import {
  getUserPublicEmail,
  getUserShownName,
  hasPinAuthMethod,
} from "@/lib/user-display";
import {
  deletePasskey,
  getPasskeyStatus,
  registerPasskey,
  postVerifyPassword,
  postVerifyPin,
} from "@/lib/student-auth-api";
import { StudentAppShell } from "@/components/layout/student-app-shell";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { StatusAlert } from "@/components/ui/status-alert";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { FieldValidationMessage } from "@/components/ui/field-validation-message";
import { inputStateClass } from "@/components/ui/validated-field";
import { fieldErrorId, fieldId, humanizeFeedbackMessage } from "@/lib/feedback/types";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { slideUp } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { getSessionToken } from "@/lib/auth";
import { AUTH_ROUTES } from "@/lib/auth-routes";
import { getUser } from "@/lib/database";
import {
  ConnectionResultModal,
  type ConnectionResultData,
  type ConnectionResultType,
} from "@/components/settings/connection-result-modal";

type SettingsTab = "profile" | "security";
type ConnectionAction =
  | "addPasskey"
  | "removePasskey";

export default function SettingsPage() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const { user, appUser, loading, isAdmin, logout, refreshSession, refreshUserProfile, hasPin } = useAuth();
  const [tab, setTab] = useState<SettingsTab>("profile");

  const [shownName, setShownName] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);
  const [passkeyCount, setPasskeyCount] = useState(0);
  const [passkeyStatusError, setPasskeyStatusError] = useState<string | null>(null);
  const [pinErrors, setPinErrors] = useState<Record<string, string>>({});
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyMode, setVerifyMode] = useState<"pin" | "password">("pin");
  const [passwordAction, setPasswordAction] = useState<ConnectionAction | null>(null);
  const [passwordChecking, setPasswordChecking] = useState(false);
  const [passwordPromptError, setPasswordPromptError] = useState<string | null>(null);
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [connectionModalLoading, setConnectionModalLoading] = useState(false);
  const [connectionModalType, setConnectionModalType] = useState<ConnectionResultType | null>(null);
  const [connectionResult, setConnectionResult] = useState<ConnectionResultData | null>(null);

  const hasPinMethod = hasPinAuthMethod(appUser, hasPin);

  const closePasswordPrompt = () => {
    if (passwordChecking) return;
    setPasswordPromptOpen(false);
    setVerifyInput("");
    setPasswordAction(null);
    setPasswordPromptError(null);
  };

  const closeConnectionModal = () => {
    setConnectionModalOpen(false);
    setConnectionModalLoading(false);
    setConnectionModalType(null);
    setConnectionResult(null);
  };

  const loadLinkedProfile = async (uid: string) => {
    const latest = await getUser(uid);
    return {
      studentId: latest?.studentId ?? appUser?.studentId ?? undefined,
      displayName: getUserShownName(latest ?? appUser, user),
      authMethods:
        Array.isArray(latest?.authMethods) && latest.authMethods.length > 0
          ? [...latest.authMethods]
          : undefined,
    };
  };

  useEffect(() => {
    if (!loading && !user) {
      router.replace(AUTH_ROUTES.hub);
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (appUser) {
      setShownName(appUser.shownName?.trim() || appUser.nickname?.trim() || "");
    }
  }, [appUser]);

  const loadPasskeyStatus = useCallback(async () => {
    if (!user) return;
    setPasskeyStatusError(null);
    try {
      const status = await getPasskeyStatus();
      setPasskeyRegistered(status.hasPasskey);
      setPasskeyCount(status.count);
    } catch {
      setPasskeyRegistered(false);
      setPasskeyCount(0);
      setPasskeyStatusError("ไม่สามารถโหลดสถานะ PassKey ได้ กรุณาลองอีกครั้ง");
    }
  }, [user]);

  useEffect(() => {
    void loadPasskeyStatus();
  }, [loadPasskeyStatus, appUser?.authMethods]);

  const validatePinForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!/^\d{6}$/.test(pin)) {
      nextErrors.pin = "กรุณากรอก PIN 6 หลัก";
    }
    if (!/^\d{6}$/.test(confirmPin)) {
      nextErrors.confirmPin = "กรุณายืนยัน PIN 6 หลัก";
    } else if (pin !== confirmPin) {
      nextErrors.confirmPin = "PIN ไม่ตรงกัน";
    }
    setPinErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.replace(AUTH_ROUTES.hub);
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const saveShownName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmed = shownName.trim();
    if (!trimmed) {
      setProfileError("กรุณากรอกชื่อที่แสดง");
      setProfileMessage(null);
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      const token = await getSessionToken();
      if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shownName: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setProfileMessage("บันทึกชื่อที่แสดงแล้ว");
      await refreshUserProfile();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setProfileSaving(false);
    }
  };

  const setupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePinForm()) return;
    if (!user) return;
    setSecurityLoading(true);
    setSecurityError(null);
    setSecurityMessage(null);
    setPinErrors({});
    try {
      const token = await getSessionToken();
      if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
      const res = await fetch("/api/auth/pin/setup", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ตั้ง PIN ไม่สำเร็จ");
      setSecurityMessage("ตั้ง PIN สำเร็จ");
      setPin("");
      setConfirmPin("");
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : "ตั้ง PIN ไม่สำเร็จ");
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    if (!user) return;
    setSecurityLoading(true);
    setSecurityError(null);
    setSecurityMessage(null);
    setConnectionModalOpen(true);
    setConnectionModalLoading(true);
    setConnectionModalType("passkey");
    setConnectionResult(null);
    setTab("security");

    try {
      await registerPasskey();
      const status = await getPasskeyStatus();
      setPasskeyRegistered(status.hasPasskey);
      setPasskeyCount(status.count);
      await refreshSession();
      await refreshUserProfile();
      const profile = await loadLinkedProfile(user.id);
      setConnectionResult({
        type: "passkey",
        success: true,
        passkeyCount: status.count,
        passkeyDeviceLabel: status.latestDeviceLabel,
        ...profile,
        authMethods: profile.authMethods
          ? Array.from(new Set([...profile.authMethods, "passkey"]))
          : ["password", "passkey"],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "ลงทะเบียน Passkey ไม่สำเร็จ";
      setConnectionResult({
        type: "passkey",
        success: false,
        errorMessage: message,
        studentId: appUser?.studentId ?? undefined,
        displayName: getUserShownName(appUser, user),
      });
    } finally {
      setSecurityLoading(false);
      setConnectionModalLoading(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary" aria-busy="true">
        <Loader2 className="w-8 h-8 animate-spin text-line-green" aria-label="กำลังโหลด" />
      </div>
    );
  }

  const publicEmail = getUserPublicEmail(appUser, user);
  const realName = [appUser?.firstName, appUser?.lastName].filter(Boolean).join(" ");

  const handleRemovePasskey = async () => {
    if (!user) return;
    setSecurityLoading(true);
    setSecurityError(null);
    setSecurityMessage(null);
    try {
      await deletePasskey();
      await refreshSession();
      setPasskeyRegistered(false);
      setPasskeyCount(0);
      setSecurityMessage("ลบ PassKey สำเร็จ");
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : "ลบ PassKey ไม่สำเร็จ");
    } finally {
      setSecurityLoading(false);
    }
  };

  const openPasswordPrompt = (action: ConnectionAction) => {
    setPasswordAction(action);
    setVerifyInput("");
    setPasswordPromptError(null);
    setSecurityError(null);
    setVerifyMode(hasPinMethod ? "pin" : "password");
    setPasswordPromptOpen(true);
  };

  const handleConfirmedConnectionAction = async () => {
    if (!user || !passwordAction) return;
    setPasswordChecking(true);
    setPasswordPromptError(null);
    try {
      if (verifyMode === "pin") {
        await postVerifyPin(verifyInput);
      } else {
        await postVerifyPassword(verifyInput);
      }
      setPasswordPromptOpen(false);
      setVerifyInput("");
      setPasswordPromptError(null);
      const action = passwordAction;
      setPasswordAction(null);

      switch (action) {
        case "addPasskey":
          await handleRegisterPasskey();
          break;
        case "removePasskey":
          await handleRemovePasskey();
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "ยืนยันตัวตนไม่สำเร็จ";
      setPasswordPromptError(humanizeFeedbackMessage(message));
    } finally {
      setPasswordChecking(false);
    }
  };

  const canSubmitVerification =
    verifyMode === "pin" ? /^\d{6}$/.test(verifyInput) : verifyInput.trim().length > 0;

  const profilePanel = (
    <section
      className="bg-bg-card rounded-2xl border border-border-light p-5 shadow-card space-y-5"
      aria-labelledby="profile-settings-heading"
    >
      <h2 id="profile-settings-heading" className="sr-only">
        ตั้งค่าโปรไฟล์
      </h2>
      <div className="flex items-center gap-4">
        <UserAvatar
          user={user}
          appUser={appUser}
          className="w-16 h-16 rounded-full object-cover shrink-0"
          iconClassName="w-7 h-7"
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-primary truncate">
            {getUserShownName(appUser, user)}
          </p>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true" className="space-y-3">
        {profileMessage ? (
          <StatusAlert variant="success" message={profileMessage} />
        ) : null}
        {profileError ? (
          <StatusAlert id="profile-error" variant="error" message={profileError} />
        ) : null}
      </div>

      <form onSubmit={saveShownName} className="stack-form" aria-busy={profileSaving}>
        <div>
          <label
            htmlFor={fieldId("shownName")}
            className="block text-sm font-medium text-text-primary mb-1"
          >
            ชื่อที่แสดง
          </label>
          <input
            id={fieldId("shownName")}
            type="text"
            name="shownName"
            value={shownName}
            onChange={(e) => {
              setShownName(e.target.value);
              if (profileError) setProfileError(null);
            }}
            placeholder="ชื่อเล่นหรือชื่อที่ต้องการแสดง"
            maxLength={40}
            autoComplete="nickname"
            aria-invalid={profileError ? true : undefined}
            aria-describedby={`${fieldId("shownName")}-hint${profileError ? " profile-error" : ""}`}
            className={cn(
              "w-full px-4 py-3 rounded-xl border border-border-light bg-bg-primary text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35",
              inputStateClass(profileError ?? undefined)
            )}
          />
          <p id={`${fieldId("shownName")}-hint`} className="text-xs text-text-tertiary mt-1">
            ใช้แทนชื่อจริงบนหน้าหลัก (สูงสุด 40 ตัวอักษร)
          </p>
        </div>
        <button
          type="submit"
          disabled={profileSaving}
          className="w-full min-h-11 py-2.5 bg-line-green text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 focus-visible:ring-offset-2"
        >
          {profileSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <Save className="w-4 h-4" aria-hidden />
          )}
          บันทึกชื่อที่แสดง
        </button>
      </form>

      <CollapsibleSection title="ข้อมูลบัญชี" defaultOpen={false}>
        <dl className="space-y-3 text-sm">
          {realName && (
            <div className="flex gap-2 text-text-secondary">
              <User className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <dt className="text-text-tertiary text-xs">ชื่อจริง</dt>
                <dd className="text-text-primary">{realName}</dd>
              </div>
            </div>
          )}
          {appUser?.studentId && (
            <div className="flex gap-2 text-text-secondary">
              <Hash className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <dt className="text-text-tertiary text-xs">รหัสนักเรียน</dt>
                <dd className="text-text-primary break-all font-mono">{appUser.studentId}</dd>
              </div>
            </div>
          )}
          <div className="flex gap-2 text-text-secondary">
            <Mail className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <dt className="text-text-tertiary text-xs">อีเมล</dt>
              {publicEmail ? (
                <dd className="text-text-primary break-all">{publicEmail}</dd>
              ) : (
                <dd className="text-text-tertiary">ยังไม่ได้ตั้งค่า</dd>
              )}
            </div>
          </div>
        </dl>
      </CollapsibleSection>
    </section>
  );

  const showInlineSecurityError =
    securityError && !passwordPromptOpen && !connectionModalOpen;

  const securityPanel = (
    <section
      className="bg-bg-card rounded-2xl border border-border-light p-5 shadow-card space-y-4"
      aria-labelledby="security-settings-heading"
    >
      <h2 id="security-settings-heading" className="sr-only">
        ตั้งค่าความปลอดภัย
      </h2>

      <div aria-live="polite" aria-atomic="true" className="space-y-3">
        {securityMessage ? (
          <StatusAlert variant="success" message={securityMessage} />
        ) : null}
        {showInlineSecurityError && securityError ? (
          <StatusAlert variant="error" message={securityError} />
        ) : null}
        {passkeyStatusError ? (
          <StatusAlert
            variant="warning"
            message={passkeyStatusError}
            action={{
              label: "ลองอีกครั้ง",
              onClick: () => void loadPasskeyStatus(),
            }}
          />
        ) : null}
      </div>

      <Link
        href={AUTH_ROUTES.changePassword}
        className={cn(
          "flex items-center gap-3 w-full min-h-11 px-4 py-3 rounded-xl border border-border-light",
          "hover:bg-bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35"
        )}
      >
        <KeyRound className="w-5 h-5 text-line-green shrink-0" aria-hidden />
        <div className="text-left min-w-0">
          <p className="font-medium text-text-primary">เปลี่ยนรหัสผ่าน</p>
          <p className="text-xs text-text-secondary break-words">
            รหัสผ่านสำหรับเข้าสู่ระบบด้วยรหัสนักเรียน
          </p>
        </div>
      </Link>

      <div className="border-t border-border-light pt-4">
        <form onSubmit={setupPin} className="stack-form" aria-busy={securityLoading}>
          <fieldset className="stack-form border-0 p-0 m-0 min-w-0">
            <legend className="text-sm font-medium text-text-primary mb-3">
              PIN 6 หลัก
            </legend>
            <div>
              <label htmlFor={fieldId("pin")} className="block text-sm font-medium text-text-secondary mb-1">
                PIN ใหม่
              </label>
              <input
                id={fieldId("pin")}
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="new-password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                  if (pinErrors.pin) {
                    setPinErrors((prev) => {
                      const next = { ...prev };
                      delete next.pin;
                      return next;
                    });
                  }
                  if (securityError) setSecurityError(null);
                }}
                aria-invalid={pinErrors.pin ? true : undefined}
                aria-describedby={pinErrors.pin ? fieldErrorId("pin") : undefined}
                className={cn(
                  "w-full px-4 py-3 rounded-xl border border-border-light bg-bg-primary text-text-primary font-mono tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35",
                  inputStateClass(pinErrors.pin)
                )}
              />
              <FieldValidationMessage id={fieldErrorId("pin")} message={pinErrors.pin} />
            </div>
            <div>
              <label
                htmlFor={fieldId("confirmPin")}
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                ยืนยัน PIN
              </label>
              <input
                id={fieldId("confirmPin")}
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="new-password"
                value={confirmPin}
                onChange={(e) => {
                  setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                  if (pinErrors.confirmPin) {
                    setPinErrors((prev) => {
                      const next = { ...prev };
                      delete next.confirmPin;
                      return next;
                    });
                  }
                  if (securityError) setSecurityError(null);
                }}
                aria-invalid={pinErrors.confirmPin ? true : undefined}
                aria-describedby={pinErrors.confirmPin ? fieldErrorId("confirmPin") : undefined}
                className={cn(
                  "w-full px-4 py-3 rounded-xl border border-border-light bg-bg-primary text-text-primary font-mono tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35",
                  inputStateClass(pinErrors.confirmPin)
                )}
              />
              <FieldValidationMessage
                id={fieldErrorId("confirmPin")}
                message={pinErrors.confirmPin}
              />
            </div>
            <button
              type="submit"
              disabled={securityLoading}
              className="w-full min-h-11 py-2.5 bg-line-green text-white rounded-xl font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 focus-visible:ring-offset-2"
            >
              บันทึก PIN
            </button>
          </fieldset>
        </form>
      </div>

      <div className="border-t border-border-light pt-4">
        <div className="rounded-xl border border-border-light p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-text-primary">PassKey</p>
              <p className="text-xs text-text-secondary break-words">
                {passkeyRegistered
                  ? `ลงทะเบียนแล้ว ${passkeyCount} รายการ`
                  : "ยังไม่ได้ลงทะเบียน"}
              </p>
            </div>
            <Fingerprint className="w-5 h-5 text-text-secondary shrink-0" aria-hidden />
          </div>
          <button
            type="button"
            onClick={() => openPasswordPrompt(passkeyRegistered ? "removePasskey" : "addPasskey")}
            disabled={securityLoading || passwordChecking}
            aria-busy={securityLoading}
            className="w-full min-h-11 py-2.5 border border-border-light rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35"
          >
            {securityLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : passkeyRegistered ? (
              <Unlink2 className="w-4 h-4" aria-hidden />
            ) : (
              <Fingerprint className="w-4 h-4" aria-hidden />
            )}
            {passkeyRegistered ? "ยกเลิก PassKey" : "ลงทะเบียน PassKey"}
          </button>
        </div>
      </div>

    </section>
  );

  return (
    <StudentAppShell
      headerTitle="ตั้งค่า"
      headerBackHref="/home"
      showBottomNav
      maxWidth="md"
    >
      <div className="space-y-5">
        <PageHeader
          title="ตั้งค่า"
          subtitle="จัดการโปรไฟล์และความปลอดภัยของบัญชี"
          className="hidden shell-desktop:flex"
        />

        <SegmentedTabs<SettingsTab>
          value={tab}
          onChange={setTab}
          items={[
            { id: "profile", label: "โปรไฟล์", icon: User },
            { id: "security", label: "ความปลอดภัย", icon: Shield },
          ]}
        />

        <AnimatePresence mode="wait">
          <m.div
            key={tab}
            initial={reduced ? false : slideUp.initial}
            animate={slideUp.animate}
            exit={slideUp.exit}
            transition={slideUp.transition}
          >
            {tab === "profile" ? profilePanel : securityPanel}
          </m.div>
        </AnimatePresence>

        {user ? (
          <div className="border-t border-border-light pt-5">
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="w-full min-h-11 py-2.5 rounded-xl bg-status-error-light hover:bg-status-error/10 text-status-error font-medium flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-error/40"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden />
              ออกจากระบบ
            </button>
          </div>
        ) : null}

        <ConnectionResultModal
          open={connectionModalOpen}
          onClose={closeConnectionModal}
          loading={connectionModalLoading}
          loadingTitle={
            connectionModalType === "passkey"
                ? "กำลังลงทะเบียน Passkey..."
                : "กำลังดำเนินการ..."
          }
          loadingDescription={
            connectionModalType === "passkey"
                ? "ระบบกำลังลงทะเบียนอุปกรณ์และบันทึกสถานะความปลอดภัย"
                : undefined
          }
          result={connectionResult}
        />

        <ResponsiveModal
          open={passwordPromptOpen}
          onClose={closePasswordPrompt}
          title="ยืนยันตัวตน"
          description={
            verifyMode === "pin"
              ? "กรอก PIN 6 หลักเพื่อดำเนินการต่อ"
              : "กรอกรหัสผ่านปัจจุบันเพื่อดำเนินการต่อ"
          }
          size="sm"
          showCloseButton={!passwordChecking}
          closeOnBackdrop={!passwordChecking}
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closePasswordPrompt}
                disabled={passwordChecking}
                className="flex-1 min-h-11 py-2.5 rounded-xl border border-border-light text-text-secondary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmedConnectionAction()}
                disabled={passwordChecking || !canSubmitVerification}
                className="flex-1 min-h-11 py-2.5 rounded-xl bg-line-green text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35"
              >
                {passwordChecking && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                ยืนยัน
              </button>
            </div>
          }
        >
          <div className="space-y-3 pb-2">
            {passwordPromptError ? (
              <StatusAlert
                id="password-prompt-error"
                variant="error"
                message={passwordPromptError}
              />
            ) : null}
            <div>
              <label htmlFor={fieldId("verifyInput")} className="sr-only">
                {verifyMode === "pin" ? "PIN 6 หลัก" : "รหัสผ่านปัจจุบัน"}
              </label>
              <input
                id={fieldId("verifyInput")}
                type="password"
                inputMode={verifyMode === "pin" ? "numeric" : "text"}
                maxLength={verifyMode === "pin" ? 6 : undefined}
                value={verifyInput}
                onChange={(e) => {
                  setVerifyInput(
                    verifyMode === "pin"
                      ? e.target.value.replace(/\D/g, "").slice(0, 6)
                      : e.target.value
                  );
                  if (passwordPromptError) setPasswordPromptError(null);
                }}
                placeholder={verifyMode === "pin" ? "PIN 6 หลัก" : "รหัสผ่านปัจจุบัน"}
                aria-invalid={passwordPromptError ? true : undefined}
                aria-describedby={passwordPromptError ? "password-prompt-error" : undefined}
                className={cn(
                  "w-full px-4 py-2.5 rounded-xl border border-border-light bg-bg-primary text-text-primary font-mono tracking-widest text-center",
                  inputStateClass(passwordPromptError ?? undefined)
                )}
                autoComplete={verifyMode === "pin" ? "one-time-code" : "current-password"}
              />
            </div>
            {hasPinMethod ? (
              <button
                type="button"
                onClick={() => {
                  setVerifyMode(verifyMode === "pin" ? "password" : "pin");
                  setVerifyInput("");
                  setPasswordPromptError(null);
                }}
                disabled={passwordChecking}
                className="min-h-11 px-1 text-xs text-line-green hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 rounded"
              >
                {verifyMode === "pin" ? "ใช้รหัสผ่านแทน" : "ใช้ PIN แทน"}
              </button>
            ) : (
              <p className="text-xs text-text-tertiary">
                ยังไม่ได้ตั้ง PIN — ใช้รหัสผ่านเพื่อยืนยัน
              </p>
            )}
          </div>
        </ResponsiveModal>

        {isAdmin && (
          <Link
            href="/admin/settings"
            className="block text-center text-sm text-text-secondary hover:text-line-green min-h-11 py-2 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 rounded-lg"
          >
            ตั้งค่าระบบ (Admin) →
          </Link>
        )}
      </div>
    </StudentAppShell>
  );
}

