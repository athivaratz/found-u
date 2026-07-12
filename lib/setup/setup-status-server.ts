import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import { SETUP_STATUS_ID } from "@/lib/setup/constants";
import { parseSetupStatusData } from "@/lib/setup/schemas/setup-status";
import { isUndefinedTableError } from "@/lib/setup/probe";

export type SetupStatusSnapshot = {
  databaseReady: boolean;
  setupCompleted: boolean;
  hydrationError?: string;
  currentStep?: number;
};

async function hasAdminAccount(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isUndefinedTableError(error)) return false;
      return false;
    }
    return Boolean(data);
  } catch {
    return false;
  }
}

/** Backfill bug: is_completed=true but no wizard admin was ever created */
async function repairStaleSetupComplete(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { error } = await admin.from("system_config").upsert(
      {
        id: SETUP_STATUS_ID,
        config_data: { is_completed: false, current_step: 1 },
        updated_at: now,
      },
      { onConflict: "id" }
    );
    return !error;
  } catch {
    return false;
  }
}

export async function fetchSetupStatusAdmin(): Promise<SetupStatusSnapshot> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("system_config")
      .select("config_data")
      .eq("id", SETUP_STATUS_ID)
      .maybeSingle();

    if (error) {
      if (isUndefinedTableError(error)) {
        return { databaseReady: false, setupCompleted: false };
      }
      return {
        databaseReady: false,
        setupCompleted: false,
        hydrationError: error.message,
      };
    }

    const status = parseSetupStatusData(data?.config_data);
    let setupCompleted = status?.is_completed ?? false;

    if (setupCompleted && !(await hasAdminAccount())) {
      await repairStaleSetupComplete();
      setupCompleted = false;
    }

    return {
      databaseReady: true,
      setupCompleted,
      currentStep: setupCompleted ? status?.current_step : 1,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      databaseReady: false,
      setupCompleted: false,
      hydrationError: message,
    };
  }
}

export async function fetchSetupStatusAnon(
  supabase: SupabaseClient<Database>
): Promise<{ setupCompleted: boolean; error?: string }> {
  const { data, error } = await supabase
    .from("system_config")
    .select("config_data")
    .eq("id", SETUP_STATUS_ID)
    .maybeSingle();

  if (error) {
    if (isUndefinedTableError(error)) {
      return { setupCompleted: false, error: error.message };
    }
    return { setupCompleted: false, error: error.message };
  }

  const status = parseSetupStatusData(data?.config_data);
  const markedComplete = status?.is_completed ?? false;

  if (markedComplete) {
    const hasAdmin = await hasAdminAccount();
    if (!hasAdmin) {
      await repairStaleSetupComplete();
      return { setupCompleted: false };
    }
  }

  return { setupCompleted: markedComplete };
}
