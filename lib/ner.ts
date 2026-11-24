import { apiFetch } from "@/lib/api-client";
import { extractNERFallback } from "./ner-fallback";

// NER goes through PHP. The rule-based fallback stays for a failed request.

export interface NERExtractedData {
  item: string;
  description: string | null;
  location: string | null;
  time: string | null;
  contact: string | null;
  contactType: string | null; // ประเภทช่องทางติดต่อ: phone, line, instagram, facebook, email
  category: string | null; // ประเภทของ: wallet, phone, keys, bag, electronics, documents, clothing, accessories, other
  remark: string | null;
  target: "lost" | "found";
}

export interface AIGenerationConfig {
  model?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
}

export async function extractNERData(
  text: string,
  type: "lost" | "found",
  _config?: AIGenerationConfig
): Promise<NERExtractedData | null> {
  try {
    return await apiFetch<NERExtractedData>("/api/ner", {
      method: "POST",
      json: { text, type },
    });
  } catch (error) {
    console.error("NER request failed:", error);
    return extractNERFallback(text, type);
  }
}

// Helper function to normalize text for better matching
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Generate n-grams from text (better for Thai text matching)
function generateNGrams(text: string, n: number = 2): Set<string> {
  const normalized = normalizeText(text);
  const ngrams = new Set<string>();
  
  // Character-level n-grams (good for Thai)
  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.add(normalized.substring(i, i + n));
  }
  
  return ngrams;
}

// Calculate Jaccard similarity between two sets
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// Check if text contains any of the keywords
export function containsKeyword(text: string, keywords: string[]): boolean {
  const normalized = normalizeText(text);
  return keywords.some(kw => normalized.includes(normalizeText(kw)));
}

// Calculate similarity score between two strings (0-1)
// Uses multiple methods for better accuracy
export function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);

  // Exact match
  if (s1 === s2) return 1;

  // Check if one contains the other (partial match)
  if (s1.includes(s2) || s2.includes(s1)) {
    const shorter = s1.length < s2.length ? s1 : s2;
    const longer = s1.length < s2.length ? s2 : s1;
    return 0.7 + (0.3 * shorter.length / longer.length);
  }

  // N-gram based similarity (good for Thai)
  const ngrams1 = generateNGrams(s1, 2);
  const ngrams2 = generateNGrams(s2, 2);
  const ngramScore = jaccardSimilarity(ngrams1, ngrams2);

  // Word-based similarity
  const words1 = s1.split(' ').filter(w => w.length > 0);
  const words2 = s2.split(' ').filter(w => w.length > 0);
  const commonWords = words1.filter(word => 
    words2.some(w2 => w2.includes(word) || word.includes(w2))
  );
  const wordScore = words1.length + words2.length > 0 
    ? (commonWords.length * 2) / (words1.length + words2.length)
    : 0;

  // Combine scores with weights
  return Math.max(ngramScore * 0.6 + wordScore * 0.4, ngramScore, wordScore);
}
