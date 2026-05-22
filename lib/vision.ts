import { DEFAULT_APP_SETTINGS, type ItemCategory } from "@/lib/types";

export interface VisionExtractedData {
  itemName: string;
  category: ItemCategory;
  color: string | null;
  brand: string | null;
  details: string | null;
  confidence: "low" | "medium" | "high";
}

export interface AIVisionConfig {
  model?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
}

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_API_KEY = process.env.GEMMA_API_KEY;

const DEFAULT_VISION_MODEL = DEFAULT_APP_SETTINGS.aiVisionModel || "gemini-1.5-flash";

const ALLOWED_CATEGORIES: ItemCategory[] = [
  "wallet",
  "phone",
  "keys",
  "bag",
  "electronics",
  "documents",
  "clothing",
  "accessories",
  "other",
];

function normalizeModelName(model: string): string {
  return model.replace(/^models\//, "");
}

function buildGenerateContentUrl(model: string): string {
  return `${GEMINI_API_BASE_URL}/${normalizeModelName(model)}:generateContent`;
}

function resolveVisionConfig(config?: AIVisionConfig) {
  return {
    model: config?.model || DEFAULT_VISION_MODEL,
    temperature: config?.temperature ?? DEFAULT_APP_SETTINGS.aiVisionTemperature ?? 0.1,
    topP: config?.topP ?? DEFAULT_APP_SETTINGS.aiVisionTopP ?? 0.8,
    maxOutputTokens: config?.maxOutputTokens ?? DEFAULT_APP_SETTINGS.aiVisionMaxOutputTokens ?? 256,
  };
}

const VISION_PROMPT = `You are an AI that identifies a found item from a photo.

Return ONLY JSON that follows this schema. No extra text.

--- Schema ---
1. itemName (String): Short item name, e.g., "wallet", "phone", "earbuds"
2. category (String): Must be one of:
  - "wallet", "phone", "keys", "bag", "electronics", "documents", "clothing", "accessories", "other"
3. color (String/null): Primary color if visible, otherwise null
4. brand (String/null): Brand if visible, otherwise null
5. details (String/null): Extra visible details, otherwise null
6. confidence (String): "low" | "medium" | "high" overall confidence

--- Rules ---
- Output JSON only
- If unclear, use null or "other"
- Do not guess from context not visible in the image

JSON Output:`;

export async function extractVisionData(
  imageBase64: string,
  mimeType: string,
  config?: AIVisionConfig
): Promise<VisionExtractedData | null> {
  if (!GEMINI_API_KEY) {
    console.error("GEMMA_API_KEY not found");
    return null;
  }

  try {
    const resolvedConfig = resolveVisionConfig(config);
    const response = await fetch(`${buildGenerateContentUrl(resolvedConfig.model)}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: VISION_PROMPT },
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: resolvedConfig.temperature,
          maxOutputTokens: resolvedConfig.maxOutputTokens,
          topP: resolvedConfig.topP,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      return null;
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error("Invalid response format from Gemini API");
      return null;
    }

    const generatedText = data.candidates[0].content.parts[0].text;
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in response");
      return null;
    }

    const parsedData = JSON.parse(jsonMatch[0]);

    const normalizedCategory = ALLOWED_CATEGORIES.includes(parsedData.category)
      ? parsedData.category
      : "other";

    return {
      itemName: parsedData.itemName || normalizedCategory,
      category: normalizedCategory,
      color: parsedData.color ?? null,
      brand: parsedData.brand ?? null,
      details: parsedData.details ?? null,
      confidence: parsedData.confidence || "low",
    } as VisionExtractedData;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return null;
  }
}
