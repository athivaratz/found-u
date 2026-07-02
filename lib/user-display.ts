import type { User } from "@/lib/auth";
import type { AppUser } from "@/lib/types";

function isBlockedLegacyGoogleAvatar(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "lh3.googleusercontent.com" || host.endsWith(".googleusercontent.com");
  } catch {
    return false;
  }
}

/** ชื่อที่แสดงใน UI: ชื่อที่ตั้งเอง → ชื่อเล่น → ชื่อจริง → ชื่อจาก Supabase */
export function getUserShownName(
  appUser: AppUser | null | undefined,
  supabaseUser?: User | null
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
    (supabaseUser?.user_metadata?.display_name as string | undefined)?.trim() ||
    (supabaseUser?.user_metadata?.full_name as string | undefined)?.trim() ||
    appUser?.displayName?.trim();
  if (displayName) return displayName;

  return "Found-U";
}

/** อักษรย่อสำหรับ avatar placeholder */
export function getUserInitials(
  appUser: AppUser | null | undefined,
  supabaseUser?: User | null
): string {
  const name = getUserShownName(appUser, supabaseUser);
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

/** ตั้ง PIN แล้ว — ใช้ auth_methods เมื่อมีรายการจริง มิฉะนั้นใช้ hasPin จาก session */
export function hasPinAuthMethod(
  appUser: AppUser | null | undefined,
  hasPinFromSession?: boolean
): boolean {
  const methods = appUser?.authMethods;
  if (Array.isArray(methods) && methods.length > 0) {
    return methods.includes("pin");
  }
  return Boolean(hasPinFromSession);
}

/** อีเมลที่แสดงต่อผู้ใช้ — แสดงเฉพาะอีเมลที่ไม่ใช่ synthetic */
export function getUserPublicEmail(
  appUser: AppUser | null | undefined,
  supabaseUser?: User | null
): string | null {
  const candidates = [
    appUser?.email,
    supabaseUser?.email,
  ];

  for (const email of candidates) {
    if (email && !isSchoolSyntheticEmail(email)) {
      return email.trim();
    }
  }

  return null;
}

/** รูปโปรไฟล์จากระบบ */
export function getProfilePhotoUrl(
  appUser: AppUser | null | undefined,
  supabaseUser?: User | null
): string | null {
  const url =
    appUser?.photoURL ||
    (supabaseUser?.user_metadata?.avatar_url as string | undefined);
  if (!url || url.trim() === "") return null;
  if (isBlockedLegacyGoogleAvatar(url)) return null;

  return url;
}
