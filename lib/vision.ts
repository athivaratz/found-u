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

export interface VisionExtractDebug {
  model: string;
  generationConfig: {
    temperature: number;
    topP: number;
    maxOutputTokens: number;
  };
  rawModelText: string;
  rawParsedJson: Record<string, unknown> | null;
  geminiResponse: unknown;
}

export interface VisionExtractResult {
  data: VisionExtractedData;
  debug?: VisionExtractDebug;
}

export const VISION_FIELD_LABELS: Record<keyof VisionExtractedData, string> = {
  itemName: "ชื่อของที่เจอ",
  category: "หมวดหมู่",
  color: "สี",
  brand: "ยี่ห้อ",
  details: "รายละเอียด",
  confidence: "ความมั่นใจ",
};

export const VISION_CATEGORY_LABELS: Record<ItemCategory, string> = {
  wallet: "กระเป๋า/เงิน",
  phone: "โทรศัพท์",
  keys: "กุญแจ",
  bag: "กระเป๋า",
  electronics: "อิเล็กทรอนิกส์",
  documents: "เอกสาร",
  clothing: "เสื้อผ้า",
  accessories: "เครื่องประดับ",
  other: "อื่นๆ",
};

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

const VISION_PROMPT = `คุณเป็น AI วิเคราะห์รูปสิ่งของ (Found Item Vision)

ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น

--- Schema ---
1. itemName (String): ชื่อสิ่งของสั้นๆ เช่น กระเป๋าสตางค์ โทรศัพท์ หูฟัง
2. category (String): ต้องเป็นหนึ่งใน wallet, phone, keys, bag, electronics, documents, clothing, accessories, other
3. color (String/null): สีหลักที่เห็น หรือ null
4. brand (String/null): ยี่ห้อที่เห็น หรือ null
5. details (String/null): รายละเอียดที่เห็น หรือ null
6. confidence (String): "low" | "medium" | "high"

--- กฎ ---
- ห้ามเดาสิ่งที่มองไม่เห็นในรูป
- ถ้าไม่ชัด ใช้ null หรือ "other"

ตัวอย่าง output:
{"itemName":"หูฟัง","category":"electronics","color":"ดำ","brand":null,"details":"ไร้สาย","confidence":"high"}`;

function normalizeVisionPayload(parsedData: Record<string, unknown>): VisionExtractedData {
  const rawCategory = String(parsedData.category || "");
  const normalizedCategory = ALLOWED_CATEGORIES.includes(rawCategory as ItemCategory)
    ? (rawCategory as ItemCategory)
    : "other";

  return {
    itemName: String(parsedData.itemName || normalizedCategory),
    category: normalizedCategory,
    color: parsedData.color == null ? null : String(parsedData.color),
    brand: parsedData.brand == null ? null : String(parsedData.brand),
    details: parsedData.details == null ? null : String(parsedData.details),
    confidence:
      parsedData.confidence === "high" ||
      parsedData.confidence === "medium" ||
      parsedData.confidence === "low"
        ? parsedData.confidence
        : "low",
  };
}

export function mapVisionToFoundForm(data: VisionExtractedData) {
  return {
    itemName: data.itemName || "",
    category: data.category || "",
    color: data.color || "",
    brand: data.brand || "",
    description: data.details || "",
    confidence: data.confidence,
  };
}

export async function extractVisionData(
  imageBase64: string,
  mimeType: string,
  config?: AIVisionConfig,
  options?: { includeDebug?: boolean }
): Promise<VisionExtractedData | VisionExtractResult | null> {
  if (!GEMINI_API_KEY) {
    console.error("GEMMA_API_KEY not found");
    return null;
  }

  try {
    const resolvedConfig = resolveVisionConfig(config);
    const generationConfig = {
      temperature: resolvedConfig.temperature,
      maxOutputTokens: resolvedConfig.maxOutputTokens,
      topP: resolvedConfig.topP,
      responseMimeType: "application/json",
    };

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
        generationConfig,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      return null;
    }

    const geminiResponse = await response.json();

    if (
      !geminiResponse.candidates ||
      !geminiResponse.candidates[0] ||
      !geminiResponse.candidates[0].content
    ) {
      console.error("Invalid response format from Gemini API");
      return null;
    }

    const generatedText = geminiResponse.candidates[0].content.parts[0].text as string;
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);

    let rawParsedJson: Record<string, unknown> | null = null;
    let normalized: VisionExtractedData | null = null;

    if (jsonMatch) {
      try {
        rawParsedJson = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        normalized = normalizeVisionPayload(rawParsedJson);
      } catch (parseError) {
        console.error("Failed to parse vision JSON:", parseError);
      }
    } else {
      console.error("No JSON found in response");
    }

    if (!normalized) {
      return null;
    }

    if (!options?.includeDebug) {
      return normalized;
    }

    return {
      data: normalized,
      debug: {
        model: resolvedConfig.model,
        generationConfig,
        rawModelText: generatedText,
        rawParsedJson,
        geminiResponse,
      },
    };
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return null;
  }
}
