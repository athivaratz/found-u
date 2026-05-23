"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Fingerprint,
  Shield,
  KeyRound,
  User,
  ChevronLeft,
  Save,
  Mail,
  Hash,
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { useAuth } from "@/contexts/auth-context";
import { UserAvatar } from "@/components/user/user-avatar";
import {
  getProfilePhotoUrl,
  getUserPublicEmail,
  getUserShownName,
  hasGoogleAccountLinked,
} from "@/lib/user-display";
import { linkGoogleToCurrentUser } from "@/lib/auth";
import { postConnectGoogle } from "@/lib/student-auth-api";
import Sidebar from "@/components/layout/sidebar";
import BottomNav from "@/components/layout/bottom-nav";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const router = useRouter();
  const { user, appUser, loading, isAdmin, refreshSession } = useAuth();

  const [shownName, setShownName] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [googleLinking, setGoogleLinking] = useState(false);
  const [googleMessage, setGoogleMessage] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (appUser) {
      setShownName(appUser.shownName?.trim() || appUser.nickname?.trim() || "");
    }
  }, [appUser]);

  const saveShownName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileSaving(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shownName: shownName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setProfileMessage("บันทึกชื่อที่แสดงแล้ว");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setProfileSaving(false);
    }
  };

  const setupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin !== confirmPin) {
      setSecurityError("PIN ไม่ตรงกัน");
      return;
    }
    if (!user) return;
    setSecurityLoading(true);
    setSecurityError(null);
    setSecurityMessage(null);
    try {
      const token = await user.getIdToken();
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

  const registerPasskey = async () => {
    if (!user) return;
    setSecurityLoading(true);
    setSecurityError(null);
    setSecurityMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/auth/passkey/register", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ไม่สามารถเริ่ม PassKey ได้");

      const attestation = await startRegistration({ optionsJSON: data.options });
      const verifyRes = await fetch("/api/auth/passkey/register", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ challengeKey: data.challengeKey, response: attestation }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || "ลงทะเบียน PassKey ไม่สำเร็จ");
      setSecurityMessage("ลงทะเบียน PassKey สำเร็จ");
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : "PassKey ไม่สำเร็จ");
    } finally {
      setSecurityLoading(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <Loader2 className="w-8 h-8 animate-spin text-line-green" />
      </div>
    );
  }

  const hasGooglePhoto = !!getProfilePhotoUrl(appUser, user);
  const hasGoogle = hasGoogleAccountLinked(appUser, user);
  const publicEmail = getUserPublicEmail(appUser, user);
  const realName = [appUser?.firstName, appUser?.lastName].filter(Boolean).join(" ");

  const handleConnectGoogle = async () => {
    if (!user) return;
    setGoogleLinking(true);
    setGoogleError(null);
    setGoogleMessage(null);
    try {
      const { user: linkedUser, error: linkError } = await linkGoogleToCurrentUser();
      if (linkError) throw linkError;
      const linkedGoogle = linkedUser?.providerData?.some(
        (p) => p.providerId === "google.com"
      );
      if (!linkedGoogle) return;

      const token = await user.getIdToken(true);
      const result = await postConnectGoogle(token);
      await refreshSession();
      setGoogleMessage(`เชื่อมบัญชี Google สำเร็จ (${result.email})`);
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "เชื่อมบัญชี Google ไม่สำเร็จ");
    } finally {
      setGoogleLinking(false);
    }
  };

  const content = (
    <div className="max-w-lg mx-auto w-full space-y-6 pb-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-line-green hover:underline"
        >
          <ChevronLeft className="w-4 h-4" />
          กลับหน้าหลัก
        </Link>
        <h1 className="text-2xl font-bold text-text-primary mt-2">ตั้งค่า</h1>
        <p className="text-sm text-text-secondary">
          จัดการโปรไฟล์และความปลอดภัยของบัญชี
        </p>
      </div>

      {/* Profile */}
      <section className="bg-bg-card rounded-2xl border border-border-light p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-line-green" />
          <h2 className="font-semibold text-text-primary">โปรไฟล์</h2>
        </div>

        <div className="flex items-center gap-4 mb-5">
          <UserAvatar
            user={user}
            appUser={appUser}
            className="w-16 h-16 rounded-full object-cover"
            iconClassName="w-7 h-7"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-text-primary truncate">
              {getUserShownName(appUser, user)}
            </p>
            {publicEmail ? (
              <p className="text-sm text-text-secondary truncate">{publicEmail}</p>
            ) : (
              <p className="text-xs text-text-tertiary mt-0.5">
                ยังไม่มีอีเมล — เชื่อม Google เพื่อใช้อีเมลส่วนตัว
              </p>
            )}
            {!hasGooglePhoto && (
              <p className="text-xs text-text-tertiary mt-1">
                รูปโปรไฟล์จะแสดงเมื่อเชื่อมบัญชี Google
              </p>
            )}
          </div>
        </div>

        {profileMessage && (
          <p className="text-sm text-green-600 mb-3">{profileMessage}</p>
        )}
        {profileError && (
          <p className="text-sm text-red-600 mb-3">{profileError}</p>
        )}

        <form onSubmit={saveShownName} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              ชื่อที่แสดง
            </label>
            <input
              type="text"
              value={shownName}
              onChange={(e) => setShownName(e.target.value)}
              placeholder="ชื่อเล่นหรือชื่อที่ต้องการแสดง"
              maxLength={40}
              className="w-full px-4 py-3 rounded-xl border border-border-light bg-bg-primary text-text-primary"
            />
            <p className="text-xs text-text-tertiary mt-1">
              ใช้แทนคำว่า Found-U บนหน้าหลัก — หากเว้นว่างจะใช้ชื่อเล่นหรือชื่อจริง
            </p>
          </div>
          <button
            type="submit"
            disabled={profileSaving}
            className="w-full py-2.5 bg-line-green text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {profileSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            บันทึกชื่อที่แสดง
          </button>
        </form>

        <dl className="mt-5 pt-5 border-t border-border-light space-y-2 text-sm">
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
                <dd className="text-text-primary font-mono">{appUser.studentId}</dd>
              </div>
            </div>
          )}
          <div className="flex gap-2 text-text-secondary">
            <Mail className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <dt className="text-text-tertiary text-xs">อีเมล</dt>
              {publicEmail ? (
                <dd className="text-text-primary break-all">{publicEmail}</dd>
              ) : (
                <dd className="text-text-tertiary text-sm">
                  ยังไม่ได้ตั้งค่า — เชื่อมบัญชี Google เพื่อใช้อีเมลของคุณ
                </dd>
              )}
              {googleMessage && (
                <p className="text-xs text-green-600 mt-2">{googleMessage}</p>
              )}
              {googleError && (
                <p className="text-xs text-red-600 mt-2">{googleError}</p>
              )}
              {!hasGoogle && (
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  disabled={googleLinking}
                  className={cn(
                    "mt-3 w-full flex items-center justify-center gap-3 py-2.5 rounded-xl",
                    "border border-border-light bg-bg-primary font-medium text-sm",
                    "hover:bg-bg-secondary transition-colors disabled:opacity-50"
                  )}
                >
                  {googleLinking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  เชื่อมต่อบัญชี Google
                </button>
              )}
            </div>
          </div>
        </dl>
      </section>

      {/* Security */}
      <section className="bg-bg-card rounded-2xl border border-border-light p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-line-green" />
          <h2 className="font-semibold text-text-primary">ความปลอดภัย</h2>
        </div>

        {securityMessage && (
          <p className="text-sm text-green-600 mb-3">{securityMessage}</p>
        )}
        {securityError && (
          <p className="text-sm text-red-600 mb-3">{securityError}</p>
        )}

        <Link
          href="/login/change-password"
          className={cn(
            "flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-border-light",
            "hover:bg-bg-secondary transition-colors mb-4"
          )}
        >
          <KeyRound className="w-5 h-5 text-line-green" />
          <div className="text-left">
            <p className="font-medium text-text-primary">เปลี่ยนรหัสผ่าน</p>
            <p className="text-xs text-text-secondary">รหัสผ่านสำหรับเข้าสู่ระบบด้วยรหัสนักเรียน</p>
          </div>
        </Link>

        <div className="border-t border-border-light pt-4 mb-4">
          <p className="text-sm font-medium text-text-primary mb-3">PIN 6 หลัก</p>
          <form onSubmit={setupPin} className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="PIN ใหม่"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full px-4 py-3 rounded-xl border border-border-light bg-bg-primary"
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="ยืนยัน PIN"
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="w-full px-4 py-3 rounded-xl border border-border-light bg-bg-primary"
            />
            <button
              type="submit"
              disabled={securityLoading}
              className="w-full py-2.5 bg-line-green text-white rounded-xl font-medium disabled:opacity-50"
            >
              บันทึก PIN
            </button>
          </form>
        </div>

        <div className="border-t border-border-light pt-4">
          <p className="text-sm font-medium text-text-primary mb-3">PassKey</p>
          <button
            type="button"
            onClick={registerPasskey}
            disabled={securityLoading}
            className="w-full py-2.5 border border-border-light rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-bg-secondary transition-colors"
          >
            {securityLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Fingerprint className="w-4 h-4" />
            )}
            ลงทะเบียน PassKey
          </button>
        </div>
      </section>

      {isAdmin && (
        <Link
          href="/admin/settings"
          className="block text-center text-sm text-text-secondary hover:text-line-green"
        >
          ตั้งค่าระบบ (Admin) →
        </Link>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="md:hidden pb-24">
        <header className="sticky top-0 z-10 bg-bg-card border-b border-border-light px-5 py-4">
          <h1 className="text-lg font-semibold text-text-primary">ตั้งค่า</h1>
        </header>
        <div className="px-5 pt-5">{content}</div>
        <BottomNav />
      </div>

      <div className="hidden md:flex min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-72 bg-bg-secondary px-8 py-8">{content}</main>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
