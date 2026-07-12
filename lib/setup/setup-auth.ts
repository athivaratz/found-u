import { cookies } from "next/headers";
import { verifySetupActionCookie } from "@/lib/setup/setup-cookie";
import { SetupGuardError } from "@/lib/setup/wizard-db";

export const SETUP_ACTION_COOKIE = "fu_setup_action";

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
