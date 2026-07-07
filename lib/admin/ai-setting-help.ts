import { normalizeAgentSettings } from "@/lib/agent/normalize-agent-settings";
import type { AppSettings } from "@/lib/types";

export type AiSettingHelp = {
  label: string;
  description: string;
  whenToUse: string;
  recommended: string;
  autoValue?: string;
};

export const AI_SETTING_HELP: Record<string, AiSettingHelp> = {
  agentProvider: {
    label: "Agent Provider",
    description: "เลือกว่าแชท Agent ใช้ AI จากที่ไหนเป็นหลัก",
    whenToUse: "ตั้งครั้งเดียวตาม API key ที่มี",
    recommended: "Auto (Gemini ก่อน → OpenRouter สำรอง)",
    autoValue: "auto",
  },
  agentFallbackProvider: {
    label: "Fallback Provider",
    description: "ถ้า provider หลักล้ม จะสลับไปใช้ตัวนี้",
    whenToUse: "เมื่อต้องการ uptime สูง",
    recommended: "openrouter",
  },
  agentTemperature: {
    label: "Temperature (Agent)",
    description: "ความสุ่มของคำตอบ 0=ตรงประเด็น 1=สร้างสรรค์",
    whenToUse: "ใช้กับแชท Agent เท่านั้น (ไม่ใช่ NER/Vision)",
    recommended: "Auto / 0.3",
    autoValue: "0.3",
  },
  agentMaxOutputTokens: {
    label: "Max Output Tokens (Agent)",
    description:
      "จำนวน token สูงสุดต่อ 1 รอบ LLM (เรียก tool 1 รอบ + สรุป 1 รอบ แยกกัน)",
    whenToUse: "สำคัญมากหลัง tool calls — ถ้าต่ำจะตัดกลางประโยค",
    recommended: "Auto / 4096 (OpenRouter) หรือ 2048 (Gemini)",
    autoValue: "4096",
  },
  agentMaxSteps: {
    label: "Max Steps",
    description: "จำนวนรอบ tool loop สูงสุด (เช่น เรียก tool + สรุป = 2 รอบ)",
    whenToUse: "เพิ่มเมื่อ agent ต้องเรียกหลาย tool ต่อคำถาม",
    recommended: "Auto / 4",
    autoValue: "4",
  },
  agentContextMaxMessages: {
    label: "Context Messages",
    description: "จำกัดจำนวนข้อความเก่าในประวัติที่ส่งให้ AI",
    whenToUse: "แชทยาว — ลดถ้าต้องการประหยัด token",
    recommended: "Auto / 8",
    autoValue: "8",
  },
  agentContextMaxTokens: {
    label: "Context Max Tokens",
    description: "งบ token รวมของประวัติแชทที่ส่งให้ model",
    whenToUse: "แชทยาวมากหรือมี tool output ใหญ่",
    recommended: "Auto / 6000",
    autoValue: "6000",
  },
  agentContextStrategy: {
    label: "Context Strategy",
    description: "วิธีตัดประวัติ: messages / tokens / hybrid",
    whenToUse: "hybrid สมดุลที่สุดสำหรับแชททั่วไป",
    recommended: "Auto / hybrid",
    autoValue: "hybrid",
  },
  agentMemoryMaxFacts: {
    label: "Memory Facts",
    description: "จำนวนข้อเท็จจริงจากอุปกรณ์ที่ inject เข้า prompt",
    whenToUse: "จำ preference ผู้ใช้ระหว่าง session",
    recommended: "5",
  },
  agentModel: {
    label: "Gemini Agent Model",
    description: "โมเดล Gemini สำหรับแชท Agent (เมื่อใช้ Gemini)",
    whenToUse: "เมื่อ agentProvider = gemini หรือ auto",
    recommended: "gemini-2.0-flash",
  },
  aiNerTopP: {
    label: "Top-P (NER)",
    description: "สุ่มจากคำที่มีความน่าจะเป็นรวม P% — ใช้กับ NER เท่านั้น",
    whenToUse: "ไม่ใช่ Agent chat",
    recommended: "0.8",
  },
  agentOpenRouterReasoningEffort: {
    label: "OpenRouter Reasoning",
    description: "โหมดคิดก่อนตอบ — กิน token output มาก",
    whenToUse: "OpenRouter เท่านั้น — แนะนำ none",
    recommended: "Auto / none",
    autoValue: "none",
  },
  agentOpenRouterLockProvider: {
    label: "Lock Provider",
    description: "ล็อก upstream provider (เช่น Baidu) — ใช้เมื่อทดสอบแล้วเสถียร",
    whenToUse: "production ที่ต้องการความสม่ำเสมอ",
    recommended: "ปิด (ให้ OpenRouter เลือกเอง)",
  },
  agentOpenRouterProviderSort: {
    label: "Provider Sort",
    description: "เรียง provider อัตโนมัติเมื่อไม่ lock",
    whenToUse: "เมื่อไม่ lock provider",
    recommended: "Auto / latency",
    autoValue: "latency",
  },
};

export function getEffectiveAgentSettings(
  settings: AppSettings
): AppSettings {
  return normalizeAgentSettings(settings);
}

export function formatEffectiveHint(
  key: string,
  settings: AppSettings
): string | null {
  const effective = getEffectiveAgentSettings(settings);
  const map: Partial<Record<string, unknown>> = {
    agentMaxOutputTokens: effective.agentMaxOutputTokens,
    agentMaxSteps: effective.agentMaxSteps,
    agentOpenRouterReasoningEffort: effective.agentOpenRouterReasoningEffort,
    agentContextStrategy: effective.agentContextStrategy,
  };
  const value = map[key];
  if (value == null) return null;
  return `ใช้จริงหลัง normalize: ${String(value)}`;
}
