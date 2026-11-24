import { apiFetch } from "@/lib/api-client";
import type { ItemCategory } from "@/lib/types";

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

// PHP owns the Gemini call. This only posts the picture.
export async function extractVisionData(
  imageBase64: string,
  mimeType: string,
  _config?: AIVisionConfig,
  options?: { includeDebug?: boolean }
): Promise<VisionExtractedData | VisionExtractResult | null> {
  try {
    const body = await apiFetch<{
      data?: VisionExtractedData;
      debug?: VisionExtractDebug;
    }>("/api/vision", {
      method: "POST",
      json: {
        imageDataUrl: `data:${mimeType};base64,${imageBase64}`,
        testMode: Boolean(options?.includeDebug),
      },
    });
    const data = body.data ? normalizeVisionPayload(body.data as unknown as Record<string, unknown>) : null;
    if (!data) return null;
    if (!options?.includeDebug) return data;
    return { data, debug: body.debug };
  } catch (error) {
    console.error("Vision request failed:", error);
    return null;
  }
}
