import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRelationError } from "@/lib/supabase/missing-relation";

export async function readSystemConfig<T>(
  id: string,
  parser: (value: unknown) => T | null
): Promise<T | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("system_config")
      .select("config_data")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      if (isMissingRelationError(error)) return null;
      throw error;
    }
    return parser(data?.config_data);
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}
