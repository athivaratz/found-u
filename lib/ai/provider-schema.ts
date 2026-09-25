import { z } from "zod";

export const wizardAiProviderSchema = z.enum(["auto", "gemini", "openrouter", "none"]);

export const WIZARD_FREE_OPENROUTER_MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
] as const;
