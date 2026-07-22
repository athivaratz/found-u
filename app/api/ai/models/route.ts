import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveAiCredentials,
  getGeminiApiKey,
} from "@/lib/ai/credentials-resolver";

export const dynamic = "force-dynamic";

const LIST_MODELS_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

async function isAdminUser(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("accounts")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return data?.role === "admin";
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!(await isAdminUser(user.id))) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const credentials = await resolveAiCredentials();
    const apiKey = getGeminiApiKey(credentials);
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(`${LIST_MODELS_URL}?key=${apiKey}`);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to list models", details: errorText },
        { status: response.status }
      );
    }

    const data = (await response.json()) as {
      models?: Array<{
        name?: string;
        displayName?: string;
        description?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const models = (data.models || []).map((model) => ({
      name: model.name,
      displayName: model.displayName,
      description: model.description,
      supportedGenerationMethods: model.supportedGenerationMethods || [],
    }));

    return NextResponse.json({ models });
  } catch (error) {
    console.error("Error listing AI models:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
