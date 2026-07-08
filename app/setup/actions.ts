"use server";

import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";
import { encryptSecret } from "@/lib/setup/credentials-crypto";
import { createSetupWizardAdmin } from "@/lib/setup/create-wizard-admin";
import {
  SCHOOL_BRANDING_BUCKET,
  SETUP_OK_COOKIE,
} from "@/lib/setup/constants";
import {
  SetupGuardError,
  assertSetupNotCompleted,
  saveAiCredentialsData,
  saveSchoolBrandingData,
  updateSetupStatusData,
  uploadToSupabaseBucket,
  upsertAppSettingsOg,
} from "@/lib/setup/wizard-db";
import { wizardIndexToDbStep } from "@/lib/setup/schemas/setup-status";
import { wizardBrandingSchema } from "@/lib/setup/validations/wizard-branding";
import {
  WIZARD_FREE_OPENROUTER_MODELS,
  wizardAiConfigSchema,
} from "@/lib/setup/validations/wizard-ai";
import { wizardAdminSchema } from "@/lib/setup/validations/wizard-admin";
import { OG_METADATA_CACHE_TAG } from "@/lib/seo-metadata";
import { clearAiCredentialsCache } from "@/lib/ai/credentials-resolver";

export type SetupActionResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

function toActionError(error: unknown): SetupActionResult {
  if (error instanceof SetupGuardError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
}

async function testGeminiKey(apiKey: string): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error("Gemini API key ไม่ถูกต้องหรือเชื่อมต่อไม่ได้");
  }
}

async function testOpenRouterKey(apiKey: string, model: string): Promise<void> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Found-U Setup",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply OK only." }],
      max_tokens: 8,
    }),
  });
  if (!res.ok) {
    throw new Error("OpenRouter API key ไม่ถูกต้องหรือเชื่อมต่อไม่ได้");
  }
}

export async function saveBrandingAction(
  formData: FormData
): Promise<SetupActionResult> {
  try {
    await assertSetupNotCompleted();

    const schoolName = String(formData.get("schoolName") ?? "");
    const parsed = wizardBrandingSchema.safeParse({ schoolName });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
    }

    let logoUrl: string | undefined;
    const logoFile = formData.get("logo");
    if (logoFile instanceof File && logoFile.size > 0) {
      const ext = logoFile.type.includes("png")
        ? "png"
        : logoFile.type.includes("webp")
          ? "webp"
          : "jpg";
      const path = `logo-${Date.now()}.${ext}`;
      logoUrl = await uploadToSupabaseBucket(
        SCHOOL_BRANDING_BUCKET,
        path,
        logoFile,
        logoFile.type || "image/jpeg"
      );
    }

    const existingLogo = formData.get("existingLogoUrl");
    if (!logoUrl && typeof existingLogo === "string" && existingLogo.startsWith("http")) {
      logoUrl = existingLogo;
    }

    await saveSchoolBrandingData({
      school_name: parsed.data.schoolName,
      ...(logoUrl ? { logo_url: logoUrl } : {}),
    });

    const ogDescription = `ระบบแจ้งของหายและของเจอสำหรับ${parsed.data.schoolName}`;
    await upsertAppSettingsOg({
      ogTitle: `${parsed.data.schoolName} | Found-U`,
      ogDescription,
      ...(logoUrl ? { ogImage: logoUrl } : {}),
    });

    await updateSetupStatusData({ current_step: wizardIndexToDbStep(1) });
    revalidateTag(OG_METADATA_CACHE_TAG, { expire: 0 });

    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveAiConfigAction(input: {
  provider: "auto" | "gemini" | "openrouter" | "none";
  geminiApiKey?: string;
  openrouterApiKey?: string;
  openrouterModel?: string;
}): Promise<SetupActionResult> {
  try {
    await assertSetupNotCompleted();

    const parsed = wizardAiConfigSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
    }

    const model =
      parsed.data.openrouterModel?.trim() ||
      WIZARD_FREE_OPENROUTER_MODELS[0];

    await saveAiCredentialsData({
      provider: parsed.data.provider,
      ...(parsed.data.geminiApiKey?.trim()
        ? { gemini_api_key_encrypted: encryptSecret(parsed.data.geminiApiKey.trim()) }
        : {}),
      ...(parsed.data.openrouterApiKey?.trim()
        ? {
            openrouter_api_key_encrypted: encryptSecret(
              parsed.data.openrouterApiKey.trim()
            ),
          }
        : {}),
      openrouter_model: model,
    });

    await updateSetupStatusData({ current_step: wizardIndexToDbStep(2) });
    clearAiCredentialsCache();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function skipAiConfigAction(): Promise<SetupActionResult> {
  try {
    await assertSetupNotCompleted();
    await saveAiCredentialsData({ provider: "none" });
    await updateSetupStatusData({ current_step: wizardIndexToDbStep(2) });
    clearAiCredentialsCache();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function testAiCredentialsAction(input: {
  provider: "auto" | "gemini" | "openrouter";
  geminiApiKey?: string;
  openrouterApiKey?: string;
  openrouterModel?: string;
}): Promise<SetupActionResult> {
  try {
    await assertSetupNotCompleted();

    const model =
      input.openrouterModel?.trim() || WIZARD_FREE_OPENROUTER_MODELS[0];

    if (input.provider === "gemini" || input.provider === "auto") {
      const key = input.geminiApiKey?.trim();
      if (!key) return { ok: false, error: "กรุณากรอก Gemini API key" };
      await testGeminiKey(key);
    }

    if (input.provider === "openrouter" || input.provider === "auto") {
      const key = input.openrouterApiKey?.trim();
      if (!key) return { ok: false, error: "กรุณากรอก OpenRouter API key" };
      await testOpenRouterKey(key, model);
    }

    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function completeSetupAction(input: {
  studentId: string;
  password: string;
  confirmPassword: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
}): Promise<SetupActionResult> {
  try {
    await assertSetupNotCompleted();

    const parsed = wizardAdminSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
    }

    const { uid } = await createSetupWizardAdmin({
      studentId: parsed.data.studentId,
      password: parsed.data.password,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      nickname: parsed.data.nickname,
    });

    const now = new Date().toISOString();
    await updateSetupStatusData({
      is_completed: true,
      current_step: 3,
      completed_at: now,
      completed_by: uid,
    });

    revalidateTag(OG_METADATA_CACHE_TAG, { expire: 0 });

    const cookieStore = await cookies();
    cookieStore.delete(SETUP_OK_COOKIE);

    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
