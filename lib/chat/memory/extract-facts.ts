import type { UIMessage } from "ai";
import { getToolName, isToolUIPart } from "ai";
import type { MemoryFact } from "@/lib/chat/types";

function getUserText(message: UIMessage): string {
  return (message.parts || [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

export function extractFactsFromMessages(
  messages: UIMessage[],
  options: { userId: string; sessionId: string; lastN?: number }
): Omit<MemoryFact, "id" | "createdAt" | "expiresAt">[] {
  const { userId, sessionId, lastN = 4 } = options;
  const facts: Omit<MemoryFact, "id" | "createdAt" | "expiresAt">[] = [];
  const slice = messages.slice(-lastN);

  for (const message of slice) {
    if (message.role !== "assistant") continue;

    for (const part of message.parts || []) {
      if (!isToolUIPart(part) || part.state !== "output-available") continue;
      const toolName = getToolName(part);
      const output = part.output as {
        ok?: boolean;
        resultType?: string;
        data?: {
          type?: string;
          item?: {
            itemName?: string;
            trackingCode?: string;
            location?: string;
          };
          trackingCode?: string;
        };
      } | undefined;

      if (!output?.ok) continue;

      if (toolName === "reportLostItem" && output.data?.item) {
        const item = output.data.item;
        facts.push({
          userId,
          sessionId,
          type: "report_lost",
          content: `แจ้งของหาย: ${item.itemName || "ไม่ระบุ"}${item.location ? ` ที่ ${item.location}` : ""}`,
          trackingCode: item.trackingCode,
        });
      }

      if (toolName === "reportFoundItem" && output.data?.item) {
        const item = output.data.item;
        facts.push({
          userId,
          sessionId,
          type: "report_found",
          content: `แจ้งเจอของ: ${item.itemName || item.location || "ไม่ระบุ"}`,
          trackingCode: item.trackingCode,
        });
      }

      if (toolName === "lookupTrackingCode" && output.data) {
        const item = output.data as {
          itemName?: string;
          trackingCode?: string;
          location?: string;
        };
        facts.push({
          userId,
          sessionId,
          type: "lookup_tracking",
          content: `เช็ครหัส ${item.trackingCode || ""}: ${item.itemName || "รายการ"}`,
          trackingCode: item.trackingCode,
        });
      }

      if (toolName === "searchItems" && output.resultType === "items") {
        const data = output.data as { total?: number } | undefined;
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const query = lastUser ? getUserText(lastUser) : "";
        if (query && data?.total !== undefined) {
          facts.push({
            userId,
            sessionId,
            type: "search_topic",
            content: `ค้นหา: ${query.slice(0, 80)} (${data.total} รายการ)`,
          });
        }
      }
    }
  }

  return facts;
}

export function dedupeFacts(
  facts: Omit<MemoryFact, "id" | "createdAt" | "expiresAt">[]
): Omit<MemoryFact, "id" | "createdAt" | "expiresAt">[] {
  const seen = new Set<string>();
  const result: Omit<MemoryFact, "id" | "createdAt" | "expiresAt">[] = [];
  for (const fact of facts) {
    const key = `${fact.type}:${fact.trackingCode ?? fact.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(fact);
  }
  return result;
}
