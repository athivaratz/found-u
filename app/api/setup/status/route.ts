import { NextResponse } from "next/server";
import { getCachedDatabaseReadyState, ensureDatabaseReady } from "@/lib/setup/ensure-database-ready";
import { fetchSetupStatusAdmin } from "@/lib/setup/setup-status-server";
import { hasSupabaseAdminEnv } from "@/lib/setup/db-url";

export async function GET() {
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({
      databaseReady: false,
      setupCompleted: false,
      hydrationReason: "missing_env",
      hydrationError:
        "ยังไม่ได้ตั้งค่า Supabase — ติดตั้ง Supabase integration ใน Vercel แล้ว redeploy",
    });
  }

  let hydration = getCachedDatabaseReadyState();
  if (!hydration) {
    hydration = await ensureDatabaseReady();
  }

  const status = await fetchSetupStatusAdmin();

  return NextResponse.json({
    databaseReady: status.databaseReady || hydration.ready,
    setupCompleted: status.setupCompleted,
    hydrationError: status.hydrationError || hydration.error,
    hydrationReason: hydration.reason,
    hydrationMode: hydration.mode,
  });
}
