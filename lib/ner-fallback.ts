import { detectCategoryFromText } from "@/lib/matching";
import type { NERExtractedData } from "@/lib/ner";

/** Rule-based NER when Gemini JSON parsing fails */
export function extractNERFallback(
  text: string,
  target: "lost" | "found"
): NERExtractedData {
  const trimmed = text.trim();
  const category = detectCategoryFromText(trimmed) || guessCategory(trimmed);

  const timeMatch = trimmed.match(
    /(?:เวลา|ตอน|ประมาณ)?\s*(\d{1,2}[.:]\d{2}(?:\s*น\.?)?|\d{1,2}\s*โมง(?:\s*(?:เช้า|บ่าย|เย็น))?)/i
  );

  const brandMatch = trimmed.match(/ยี่ห้อ\s*([^\s,]+)/i);
  const locationMatch = trimmed.match(
    /(?:หาย(?:ที่|แถว)?|เจอ(?:ที่|แถว)?|ที่|แถว)\s*([^,.\n]+)/i
  );

  const featureMatch = trimmed.match(
    /(?:ลักษณะเด่น|จุดเด่น|มี)\s*([^,.\n]+)/i
  );

  let item = "สิ่งของ";
  if (/หูฟัง/i.test(trimmed)) item = "หูฟัง";
  else if (/กุญแจ/i.test(trimmed)) item = "กุญแจ";
  else if (/โทรศัพท์|มือถือ/i.test(trimmed)) item = "โทรศัพท์";
  else if (/กระเป๋า/i.test(trimmed)) item = "กระเป๋า";
  else if (/บัตร/i.test(trimmed)) item = "บัตร";
  else {
    const first = trimmed.split(/[,.]/)[0]?.trim();
    if (first && first.length < 40) item = first.replace(/^แจ้ง/, "").trim() || item;
  }

  const descriptionParts: string[] = [];
  if (brandMatch?.[1]) descriptionParts.push(`ยี่ห้อ ${brandMatch[1]}`);
  if (featureMatch?.[1]) descriptionParts.push(featureMatch[1].trim());

  return {
    item,
    description: descriptionParts.length > 0 ? descriptionParts.join(", ") : null,
    location: locationMatch?.[1]?.trim() || null,
    time: timeMatch?.[1]?.trim() || null,
    contact: extractContact(trimmed),
    contactType: extractContactType(trimmed),
    category,
    remark: null,
    target,
  };
}

function guessCategory(text: string): NERExtractedData["category"] {
  if (/หูฟัง|airpod|earphone|headphone/i.test(text)) return "electronics";
  if (/กุญแจ/i.test(text)) return "keys";
  if (/โทรศัพท์|มือถือ|iphone|samsung/i.test(text)) return "phone";
  if (/บัตร|เอกสาร/i.test(text)) return "documents";
  if (/เสื้อ|กางเกง|หมวก/i.test(text)) return "clothing";
  return "other";
}

function extractContact(text: string): string | null {
  const phone = text.match(/0\d[\d-]{7,10}/);
  if (phone) return phone[0];
  const line = text.match(/(?:line|ไลน์)[:\s]*@?[\w.]+/i);
  if (line) return line[0];
  return null;
}

function extractContactType(text: string): NERExtractedData["contactType"] {
  if (/0\d[\d-]{7,10}/.test(text)) return "phone";
  if (/(?:line|ไลน์)/i.test(text)) return "line";
  if (/(?:ig|instagram)/i.test(text)) return "instagram";
  if (/(?:fb|facebook|เฟส)/i.test(text)) return "facebook";
  if (/@.+\.(com|co\.th)/i.test(text)) return "email";
  return null;
}
