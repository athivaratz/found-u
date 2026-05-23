"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Loader2, Package, KeyRound, Shield, Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  postPasskeyLoginOptions,
  postPasskeyLoginVerify,
  postPinLogin,
} from "@/lib/student-auth-api";
import { startAuthentication } from "@simplewebauthn/browser";

type LoginMode = "password" | "pin";

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const secondaryButtonClass =
  "w-full flex items-center justify-center gap-3 py-3.5 rounded-xl border border-border-light bg-bg-primary font-medium hover:bg-bg-secondary transition-colors disabled:opacity-50";

export default function LoginPage() {
  const router = useRouter();
  const {
    user,
    loading,
    signIn,
    signInWithStudentId,
    signInWithCustomToken,
    isStudentVerified,
    isAdmin,
    mustChangePassword,
  } = useAuth();
  const [mode, setMode] = useState<LoginMode>("password");
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user && !loading) {
      if (mustChangePassword) router.replace("/login/change-password");
      else if (isStudentVerified || isAdmin) router.replace("/");
    }
  }, [user, loading, router, mustChangePassword, isStudentVerified, isAdmin]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { mustChangePassword: needChange } = await signInWithStudentId(studentId, password);
      router.push(needChange ? "/login/change-password" : "/");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { customToken, mustChangePassword: needChange } = await postPinLogin(studentId, pin);
      await signInWithCustomToken(customToken);
      router.push(needChange ? "/login/change-password" : "/");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "PIN ไม่ถูกต้อง");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { options, challengeKey } = await postPasskeyLoginOptions();
      const authResponse = await startAuthentication({ optionsJSON: options });
      const { customToken, mustChangePassword: needChange } = await postPasskeyLoginVerify(
        challengeKey,
        authResponse
      );
      await signInWithCustomToken(customToken);
      router.push(needChange ? "/login/change-password" : "/");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "PassKey ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await signIn();
    } catch (err: unknown) {
      const authError = err as { code?: string };
      if (authError.code !== "auth/popup-closed-by-user") {
        setErrorMsg("เข้าสู่ระบบ Google ไม่สำเร็จ");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isRedirectingAfterLogin =
    !!user && (mustChangePassword || isStudentVerified || isAdmin);

  if (loading || isRedirectingAfterLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-secondary">
        <Loader2 className="w-10 h-10 animate-spin text-line-green" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-secondary flex flex-col">
      <header className="border-b border-border-light bg-bg-primary/80 backdrop-blur-lg">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-line-green flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-text-primary">Found-U</h1>
            <p className="text-xs text-text-tertiary">เข้าสู่ระบบนักเรียน</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-8">
        <div className="bg-bg-primary rounded-2xl border border-border-light shadow-card p-6">
          <Shield className="w-8 h-8 text-line-green mb-3" />
          <h2 className="text-xl font-bold text-text-primary mb-1">ยินดีต้อนรับ</h2>
          <p className="text-sm text-text-secondary mb-6">ใช้เลขประจำตัวและรหัสผ่านจากโรงเรียน</p>

          <div className="flex gap-2 mb-6 p-1 bg-bg-secondary rounded-xl">
            {([
              { id: "password" as const, label: "รหัสผ่าน", icon: KeyRound },
              { id: "pin" as const, label: "PIN", icon: Shield },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors",
                  mode === id ? "bg-bg-primary text-line-green shadow-sm" : "text-text-secondary"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-text-secondary mb-1">เลขประจำตัว (5 หลัก)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 5))}
              className="w-full px-4 py-3 rounded-xl border border-border-light bg-bg-primary font-mono text-lg tracking-widest"
              placeholder="12345"
            />
          </div>

          {mode === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">รหัสผ่าน</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-border-light bg-bg-primary"
                  required
                />
              </div>
              <Link href="/login/reset-password" className="text-sm text-line-green hover:underline block">
                ลืมรหัสผ่าน? ใช้รหัสจากโรงเรียนเพื่อรีเซ็ต
              </Link>
              <SubmitButton loading={submitting} label="เข้าสู่ระบบ" />
            </form>
          )}

          {mode === "pin" && (
            <form onSubmit={handlePinLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">PIN 6 หลัก</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full px-4 py-3 rounded-xl border border-border-light bg-bg-primary font-mono text-lg tracking-widest"
                  required
                />
              </div>
              <p className="text-xs text-text-tertiary">ตั้ง PIN ได้หลังเข้าสู่ระบบที่หน้าตั้งค่าความปลอดภัย</p>
              <SubmitButton loading={submitting} label="เข้าด้วย PIN" />
            </form>
          )}

          {errorMsg && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{errorMsg}</p>}

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-light" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-bg-primary px-2 text-text-tertiary">หรือ</span>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={submitting}
              className={secondaryButtonClass}
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Fingerprint className="w-5 h-5 text-text-secondary" />
              )}
              เข้าด้วย PassKey
            </button>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting}
              className={secondaryButtonClass}
            >
              <GoogleIcon />
              เข้าสู่ระบบด้วย Google
            </button>
          </div>

          <p className="text-xs text-text-tertiary text-center mt-2">
            PassKey ใช้ได้กับบัญชีที่ลงทะเบียนแล้ว · Google ครั้งแรกต้องยืนยันตัวตน
          </p>
        </div>
      </main>
    </div>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full py-3.5 bg-line-green text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
      {label}
    </button>
  );
}
