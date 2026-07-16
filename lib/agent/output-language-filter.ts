/**
 * Strips non-Thai/non-English scripts from agent output while preserving
 * emoji, digits, and common punctuation (e.g. LOST-XXXXXX).
 */
const BLOCKED_SCRIPTS =
  /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\uAC00-\uD7AF\u0600-\u06FF\u0400-\u04FF\u0370-\u03FF\u0590-\u05FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0B00-\u0B7F\u0C00-\u0C7F\u0D00-\u0D7F\u0E80-\u0EFF\u0F00-\u0FFF\u1000-\u109F\u1100-\u11FF\u1780-\u17FF\u1B00-\u1B7F]/gu;

export function filterAgentOutputText(text: string): string {
  if (!text) return text;
  return text.replace(BLOCKED_SCRIPTS, "");
}
