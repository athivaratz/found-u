import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { verifySetupActionCookie, signSetupActionCookie } from "@/lib/setup/setup-cookie";
import { SetupGuardError } from "@/lib/setup/wizard-db";

export const SETUP_ACTION_COOKIE = "fu_setup_action";
export const SETUP_ACTION_COOKIE_MAX_AGE = 60 * 60;

export const setupActionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: SETUP_ACTION_COOKIE_MAX_AGE,
  path: "/",
};

export async function mintSetupActionCookieValue(): Promise<string | null> {
  const signed = await signSetupActionCookie();
  return signed || null;
}

export async function applySetupActionCookie(
  response: NextResponse
): Promise<void> {
  const signed = await mintSetupActionCookieValue();
  if (!signed) return;
  response.cookies.set(SETUP_ACTION_COOKIE, signed, setupActionCookieOptions);
}

export async function ensureSetupActionCookie(): Promise<void> {
  const signed = await mintSetupActionCookieValue();
  if (!signed) return;
  const cookieStore = await cookies();
  cookieStore.set(SETUP_ACTION_COOKIE, signed, setupActionCookieOptions);
}

export async function assertSetupActionAuthorized(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SETUP_ACTION_COOKIE)?.value;
  if (!(await verifySetupActionCookie(token))) {
    throw new SetupGuardError(
      "ไม่ได้รับอนุญาตให้ตั้งค่าระบบ — เปิดหน้า /setup ใหม่",
      "forbidden"
    );
  }
}
