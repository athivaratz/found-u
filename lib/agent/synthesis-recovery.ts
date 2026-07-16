import { generateText, type LanguageModel, type ModelMessage } from "ai";
import type { AppSettings } from "@/lib/types";
import { looksTruncatedThai } from "@/lib/agent/text-completeness";
import { filterAgentOutputText } from "@/lib/agent/output-language-filter";

const RECOVERY_PROMPT = `The assistant started a Thai summary after tool results but the text was cut off.
Write ONLY the continuation in Thai to complete the user-facing summary.
English is allowed only for technical terms (e.g. Tracking Code, LOST-XXXXXX).
Never use Chinese, Japanese, Korean, or other non-Thai/non-English scripts.
Do not repeat what was already said. Finish every sentence and list item.
Do not use JSON or tool names.`;

export function needsSynthesisRecovery(
  text: string,
  finishReason: string | undefined,
  hadToolOutput: boolean
): boolean {
  if (!hadToolOutput) return false;
  return looksTruncatedThai(text, finishReason);
}

export async function runSynthesisRecovery(options: {
  model: LanguageModel;
  messages: ModelMessage[];
  partialText: string;
  settings: AppSettings;
}): Promise<string | null> {
  const { model, messages, partialText, settings } = options;
  if (!partialText.trim()) return null;

  try {
    const result = await generateText({
      model,
      messages: [
        ...messages,
        {
          role: "user",
          content: `${RECOVERY_PROMPT}\n\nPartial assistant text so far:\n${partialText}`,
        },
      ],
      maxOutputTokens: settings.agentMaxOutputTokens ?? 4096,
      temperature: settings.agentTemperature ?? 0.3,
    });

    const recovery = filterAgentOutputText(result.text.trim());
    if (!recovery) return null;
    if (looksTruncatedThai(recovery, result.finishReason)) return recovery;
    return recovery;
  } catch (error) {
    console.warn("[agent/recovery] synthesis failed:", error);
    return null;
  }
}
