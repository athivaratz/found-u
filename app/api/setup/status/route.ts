import { NextResponse } from "next/server";
import {
  getCachedDatabaseReadyState,
  ensureDatabaseReady,
} from "@/lib/setup/ensure-database-ready";
import { fetchSetupStatusAdmin } from "@/lib/setup/setup-status-server";
import { hasMinimumSetupEnv } from "@/lib/setup/db-url";
import {
  SETUP_ACTION_COOKIE,
  assertSetupActionAuthorized,
} from "@/lib/setup/setup-auth";
import { signSetupActionCookie } from "@/lib/setup/setup-cookie";

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
    const signed = await signSetupActionCookie();
    if (signed) {
      response.cookies.set(SETUP_ACTION_COOKIE, signed, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60,
        path: "/",
      });
    }
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
