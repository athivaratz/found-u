import { z } from "zod";

export const wizardAiProviderSchema = z.enum(["auto", "gemini", "openrouter", "none"]);

export const wizardAiConfigSchema = z
  .object({
    provider: wizardAiProviderSchema,
    geminiApiKey: z.string().optional(),
    openrouterApiKey: z.string().optional(),
    openrouterModel: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.provider === "none") return;

    if (data.provider === "gemini" || data.provider === "auto") {
      if (!data.geminiApiKey?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "กรุณากรอก Gemini API key",
          path: ["geminiApiKey"],
        });
      }
    }

    if (data.provider === "openrouter" || data.provider === "auto") {
      if (!data.openrouterApiKey?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "กรุณากรอก OpenRouter API key",
          path: ["openrouterApiKey"],
        });
      }
    }
  });

export type WizardAiConfigInput = z.infer<typeof wizardAiConfigSchema>;

export const WIZARD_FREE_OPENROUTER_MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
] as const;
