import type { User } from "firebase/auth";
import type { AppUser } from "@/lib/types";

/** ชื่อที่แสดงใน UI: ชื่อที่ตั้งเอง → ชื่อเล่น → ชื่อจริง → Firebase displayName */
export function getUserShownName(
  appUser: AppUser | null | undefined,
  firebaseUser?: User | null
): string {
  const shown = appUser?.shownName?.trim();
  if (shown) return shown;

  const nickname = appUser?.nickname?.trim();
  if (nickname) return nickname;

  const realName = [appUser?.firstName, appUser?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (realName) return realName;

  const displayName =
    firebaseUser?.displayName?.trim() || appUser?.displayName?.trim();
  if (displayName) return displayName;

  return "Found-U";
}

/** อักษรย่อสำหรับ avatar placeholder */
export function getUserInitials(
  appUser: AppUser | null | undefined,
  firebaseUser?: User | null
): string {
  const name = getUserShownName(appUser, firebaseUser);
  if (name === "Found-U") return "F";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/** อีเมลภายในระบบจากโรงเรียน (ไม่แสดงต่อผู้ใช้) */
export function isSchoolSyntheticEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return true;
  return /@students\./i.test(email.trim());
}

/** เชื่อมบัญชี Google แล้ว — ใช้ Firestore authMethods เป็นหลักเมื่อมีฟิลด์นี้ */
export function hasGoogleAccountLinked(
  appUser: AppUser | null | undefined,
  firebaseUser?: User | null
): boolean {
  if (Array.isArray(appUser?.authMethods)) {
    return appUser.authMethods.includes("google");
  }
  return !!firebaseUser?.providerData?.some((p) => p.providerId === "google.com");
}

/** อีเมลที่แสดงต่อผู้ใช้ — มีเมื่อเชื่อม Google เท่านั้น */
export function getUserPublicEmail(
  appUser: AppUser | null | undefined,
  firebaseUser?: User | null
): string | null {
  if (!hasGoogleAccountLinked(appUser, firebaseUser)) return null;

  const googleProvider = firebaseUser?.providerData?.find(
    (p) => p.providerId === "google.com"
  );
  const candidates = [
    googleProvider?.email,
    appUser?.email,
    firebaseUser?.email,
  ];

  for (const email of candidates) {
    if (email && !isSchoolSyntheticEmail(email)) {
      return email.trim();
    }
  }

  return null;
}

/** รูปโปรไฟล์มีได้เมื่อเชื่อม Google และมี photoURL จริง */
export function getProfilePhotoUrl(
  appUser: AppUser | null | undefined,
  firebaseUser?: User | null
): string | null {
  if (!hasGoogleAccountLinked(appUser, firebaseUser)) return null;

  const url = appUser?.photoURL || firebaseUser?.photoURL;
  if (!url || url.trim() === "") return null;

  return url;
}
