import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import { PREVIEW_MAX_LENGTH, TITLE_MAX_LENGTH } from "@/lib/chat/constants";

function getTextFromMessage(message: UIMessage): string {
  return (message.parts || [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

function truncate(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function buildPreviewFromMessages(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = getTextFromMessage(messages[i]);
    if (text) return truncate(text, PREVIEW_MAX_LENGTH);
  }
  return "";
}

export function buildTitleFromMessages(messages: UIMessage[]): string {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts || []) {
      if (!isToolUIPart(part) || part.state !== "output-available") continue;
      const output = part.output as {
        resultType?: string;
        ok?: boolean;
        data?: { type?: string; item?: { itemName?: string } };
      } | undefined;
      if (output?.resultType !== "report" || !output.ok) continue;
      const itemName = output.data?.item?.itemName;
      if (itemName) {
        const kind = output.data?.type === "found" ? "แจ้งเจอ" : "แจ้งหาย";
        return truncate(`${kind}${itemName}`, TITLE_MAX_LENGTH);
      }
    }
  }

  const firstUser = messages.find((m) => m.role === "user");
  if (firstUser) {
    const text = getTextFromMessage(firstUser);
    if (text) return truncate(text, TITLE_MAX_LENGTH);
  }

  return "แชทใหม่";
}
