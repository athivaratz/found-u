import { NextResponse } from "next/server";
import { z } from "zod";
import { clearAiCredentialsCache } from "@/lib/ai/credentials-resolver";
import { encryptSecret } from "@/lib/setup/credentials-crypto";
import { getAiCredentialsData, saveAiCredentialsData } from "@/lib/setup/wizard-db";
import { wizardAiProviderSchema } from "@/lib/setup/validations/wizard-ai";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({
  provider: wizardAiProviderSchema.optional(),
  geminiApiKey: z.string().optional(),
  openrouterApiKey: z.string().optional(),
  openrouterModel: z.string().optional(),
});

function isPlaceholderKey(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  return /^[•*.\s]+$/.test(value.trim());
}

async function isAdminUser(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("accounts").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin";
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await isAdminUser(user.id))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const record = await getAiCredentialsData();
  if (!record) {
    return NextResponse.json({
      provider: "none",
      openrouterModel: null,
      hasGeminiKey: false,
      hasOpenrouterKey: false,
      configuredAt: null,
    });
  }

  return NextResponse.json({
    provider: record.provider,
    openrouterModel: record.openrouter_model ?? null,
    hasGeminiKey: Boolean(record.gemini_api_key_encrypted),
    hasOpenrouterKey: Boolean(record.openrouter_api_key_encrypted),
    configuredAt: record.configured_at ?? null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  const current = await getAiCredentialsData();
  const provider = parsed.data.provider ?? current?.provider ?? "none";

  const patch: Parameters<typeof saveAiCredentialsData>[0] = { provider };

  if (parsed.data.openrouterModel?.trim()) {
    patch.openrouter_model = parsed.data.openrouterModel.trim();
  }

  if (!isPlaceholderKey(parsed.data.geminiApiKey)) {
    patch.gemini_api_key_encrypted = encryptSecret(parsed.data.geminiApiKey!.trim());
  }

  if (!isPlaceholderKey(parsed.data.openrouterApiKey)) {
    patch.openrouter_api_key_encrypted = encryptSecret(parsed.data.openrouterApiKey!.trim());
  }

  await saveAiCredentialsData(patch);
  clearAiCredentialsCache();

  const updated = await getAiCredentialsData();
  return NextResponse.json({
    ok: true,
    provider: updated?.provider ?? provider,
    openrouterModel: updated?.openrouter_model ?? null,
    hasGeminiKey: Boolean(updated?.gemini_api_key_encrypted),
    hasOpenrouterKey: Boolean(updated?.openrouter_api_key_encrypted),
    configuredAt: updated?.configured_at ?? null,
  });
}
