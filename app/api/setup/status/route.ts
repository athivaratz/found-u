import { NextResponse } from "next/server";
import { getCachedDatabaseReadyState, ensureDatabaseReady } from "@/lib/setup/ensure-database-ready";
import { fetchSetupStatusAdmin } from "@/lib/setup/setup-status-server";

export async function GET() {
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
