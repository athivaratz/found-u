import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import type { StoredChatMessage } from "@/lib/chat/types";
import { getChatDB } from "@/lib/chat/storage/db";
import { updateSessionRecord } from "@/lib/chat/storage/session-store";
import { buildPreviewFromMessages, buildTitleFromMessages } from "@/lib/chat/titles";

const TRACKING_CODE_RE = /(?:LOST|FOUND)-[A-Z0-9]{4,}/gi;

function extractMessageMetadata(message: UIMessage): StoredChatMessage["metadata"] {
  let hasReportSuccess = false;
  const trackingCodes = new Set<string>();

  for (const part of message.parts || []) {
    if (!isToolUIPart(part) || part.state !== "output-available") continue;
    const output = part.output as { resultType?: string; ok?: boolean; data?: unknown } | undefined;
    if (output?.resultType === "report" && output.ok) {
      hasReportSuccess = true;
    }
    const json = JSON.stringify(output?.data ?? "");
    const matches = json.match(TRACKING_CODE_RE);
    if (matches) {
      for (const code of matches) trackingCodes.add(code.toUpperCase());
    }
  }

  return {
    hasReportSuccess,
    trackingCodes: trackingCodes.size > 0 ? [...trackingCodes] : undefined,
  };
}

function uiMessageToStored(message: UIMessage, sessionId: string): StoredChatMessage {
  return {
    id: message.id,
    sessionId,
    role: message.role as StoredChatMessage["role"],
    parts: message.parts ?? [],
    createdAt: new Date().toISOString(),
    metadata: message.role === "assistant" ? extractMessageMetadata(message) : undefined,
  };
}

function storedToUiMessage(stored: StoredChatMessage): UIMessage {
  return {
    id: stored.id,
    role: stored.role,
    parts: (stored.parts as UIMessage["parts"]) ?? [],
  };
}

export async function loadMessagesForSession(sessionId: string): Promise<UIMessage[]> {
  const db = getChatDB();
  const rows = await db.messages.where("sessionId").equals(sessionId).sortBy("createdAt");
  return rows.map(storedToUiMessage);
}

export async function saveMessagesForSession(
  sessionId: string,
  messages: UIMessage[]
): Promise<void> {
  const db = getChatDB();
  const stored = messages.map((m) => uiMessageToStored(m, sessionId));

  await db.transaction("rw", db.messages, async () => {
    await db.messages.where("sessionId").equals(sessionId).delete();
    if (stored.length > 0) {
      await db.messages.bulkPut(stored);
    }
  });

  const preview = buildPreviewFromMessages(messages);
  const title = buildTitleFromMessages(messages);
  await updateSessionRecord(sessionId, {
    messageCount: messages.length,
    preview,
    ...(title ? { title } : {}),
  });
}

export function estimateSessionSizeBytes(messages: UIMessage[]): number {
  try {
    return new Blob([JSON.stringify(messages)]).size;
  } catch {
    return JSON.stringify(messages).length * 2;
  }
}
