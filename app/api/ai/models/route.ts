import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GEMINI_API_KEY = process.env.GEMMA_API_KEY;
const LIST_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export async function GET() {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMMA_API_KEY not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(`${LIST_MODELS_URL}?key=${GEMINI_API_KEY}`);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to list models", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    const models = (data.models || []).map((model: any) => ({
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
