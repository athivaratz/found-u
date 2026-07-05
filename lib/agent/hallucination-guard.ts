import type { UIMessage } from "ai";
import { getToolName, isToolUIPart } from "ai";

const TRACKING_CODE_IN_TEXT = /(?:LOST|FOUND)-[A-Z0-9]{4,}/i;

function getAssistantText(message: UIMessage): string {
  return (message.parts || [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function hasSuccessfulReportTool(message: UIMessage): boolean {
  for (const part of message.parts || []) {
    if (!isToolUIPart(part) || part.state !== "output-available") continue;
    const name = getToolName(part);
    if (name !== "reportLostItem" && name !== "reportFoundItem") continue;
    const output = part.output as { ok?: boolean } | undefined;
    if (output?.ok) return true;
  }
  return false;
}

/** Log-only guard: assistant cited a tracking code without a successful report tool in the same turn. */
export function warnHallucinatedTrackingCodes(messages: UIMessage[]): void {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return;

  const text = getAssistantText(lastAssistant);
  if (!TRACKING_CODE_IN_TEXT.test(text)) return;
  if (hasSuccessfulReportTool(lastAssistant)) return;

  console.warn(
    "[agent/chat] possible hallucinated tracking code in assistant text without report tool success",
    { snippet: text.slice(0, 120) }
  );
}
