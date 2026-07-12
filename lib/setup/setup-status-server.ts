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
    return {
      databaseReady: true,
      setupCompleted: status?.is_completed ?? false,
      currentStep: status?.current_step,
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
  return { setupCompleted: status?.is_completed ?? false };
}
