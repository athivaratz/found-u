import { z } from "zod";

export const SetupStatusDataSchema = z.object({
  is_completed: z.boolean(),
  current_step: z.number().int().min(1).max(10).optional(),
  hydrated_at: z.string().optional(),
  backfilled_at: z.string().optional(),
  completed_at: z.string().optional(),
  completed_by: z.string().optional(),
});

export type SetupStatusData = z.infer<typeof SetupStatusDataSchema>;

export const SchoolBrandingSchema = z.object({
  school_name: z.string().min(2).max(200),
  logo_url: z.string().url().optional(),
  updated_at: z.string().optional(),
});

export type SchoolBrandingData = z.infer<typeof SchoolBrandingSchema>;

export const AiCredentialsSchema = z.object({
  provider: z.enum(["auto", "gemini", "openrouter", "none"]),
  gemini_api_key_encrypted: z.string().optional(),
  openrouter_api_key_encrypted: z.string().optional(),
  openrouter_model: z.string().optional(),
  configured_at: z.string().optional(),
});

export type AiCredentialsData = z.infer<typeof AiCredentialsSchema>;

export const SystemConfigRowSchema = z.object({
  id: z.string(),
  config_data: z.unknown(),
  updated_at: z.string().optional(),
});

export function parseSetupStatusData(value: unknown): SetupStatusData | null {
  const parsed = SetupStatusDataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseSchoolBrandingData(value: unknown): SchoolBrandingData | null {
  const parsed = SchoolBrandingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseAiCredentialsData(value: unknown): AiCredentialsData | null {
  const parsed = AiCredentialsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** DB current_step (1-based) → wizard UI step index (0-based) */
export function dbStepToWizardIndex(currentStep?: number): number {
  const idx = (currentStep ?? 1) - 1;
  return Math.min(2, Math.max(0, idx));
}

/** Wizard UI step index (0-based) → DB current_step (1-based) */
export function wizardIndexToDbStep(index: number): number {
  return Math.min(3, Math.max(1, index + 1));
}
