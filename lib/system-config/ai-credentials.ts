import { z } from "zod";
import { readSystemConfig } from "@/lib/system-config/read";
import { createAdminClient } from "@/lib/supabase/admin";

export const AI_CREDENTIALS_ID = "ai_credentials";

export const AiCredentialsSchema = z.object({
  provider: z.enum(["auto", "gemini", "openrouter", "none"]),
  gemini_api_key_encrypted: z.string().optional(),
  openrouter_api_key_encrypted: z.string().optional(),
  openrouter_model: z.string().optional(),
  configured_at: z.string().optional(),
});

export type AiCredentialsData = z.infer<typeof AiCredentialsSchema>;

export function parseAiCredentialsData(value: unknown): AiCredentialsData | null {
  const parsed = AiCredentialsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function getAiCredentialsData(): Promise<AiCredentialsData | null> {
  return readSystemConfig(AI_CREDENTIALS_ID, parseAiCredentialsData);
}

export async function saveAiCredentialsData(
  data: Partial<AiCredentialsData> & Pick<AiCredentialsData, "provider">
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const current = (await getAiCredentialsData()) ?? { provider: data.provider };
  const merged: AiCredentialsData = {
    ...current,
    ...data,
    configured_at: data.configured_at ?? current.configured_at ?? now,
  };

  if (!data.gemini_api_key_encrypted && current.gemini_api_key_encrypted) {
    merged.gemini_api_key_encrypted = current.gemini_api_key_encrypted;
  }
  if (!data.openrouter_api_key_encrypted && current.openrouter_api_key_encrypted) {
    merged.openrouter_api_key_encrypted = current.openrouter_api_key_encrypted;
  }
  if (!data.openrouter_model && current.openrouter_model) {
    merged.openrouter_model = current.openrouter_model;
  }

  const { error } = await admin.from("system_config").upsert(
    {
      id: AI_CREDENTIALS_ID,
      config_data: merged,
      updated_at: now,
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}
