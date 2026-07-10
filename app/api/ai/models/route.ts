import { NextResponse } from "next/server";
import { resolveAiCredentials, getGeminiApiKey } from "@/lib/ai/credentials-resolver";

export const dynamic = "force-dynamic";

const LIST_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export async function GET() {
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

    const data = await response.json() as {
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
