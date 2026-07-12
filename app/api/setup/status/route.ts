import { NextResponse } from "next/server";
import {
  getCachedDatabaseReadyState,
  ensureDatabaseReady,
} from "@/lib/setup/ensure-database-ready";
import { fetchSetupStatusAdmin } from "@/lib/setup/setup-status-server";
import { hasMinimumSetupEnv } from "@/lib/setup/db-url";
import {
  assertSetupActionAuthorized,
  applySetupActionCookie,
} from "@/lib/setup/setup-auth";

export async function GET() {
  if (!hasMinimumSetupEnv()) {
    return NextResponse.json({
      databaseReady: false,
      setupCompleted: false,
      reason: "missing_env",
    });
  }

  let hydration = getCachedDatabaseReadyState();
  if (!hydration) {
    hydration = await ensureDatabaseReady();
  }

  const status = await fetchSetupStatusAdmin();
  const databaseReady = status.databaseReady || hydration.ready;

  const response = NextResponse.json({
    databaseReady,
    setupCompleted: status.setupCompleted,
    reason: hydration.reason,
  });

  if (databaseReady && !status.setupCompleted) {
    await applySetupActionCookie(response);
  }

  return response;
}

export async function POST() {
  try {
    await assertSetupActionAuthorized();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
}
