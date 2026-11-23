import {
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { phpFetchHeaders } from "@/lib/api-client";
import { readTurnstileToken } from "@/lib/turnstile";
import type { AgentFallbackPayload } from "@/lib/agent/fallback";

type SendOptions = Parameters<ChatTransport<UIMessage>["sendMessages"]>[0];

type AgentJson = {
  id?: string;
  parts?: Array<{
    type?: string;
    text?: string;
    toolCallId?: string;
    input?: unknown;
    output?: unknown;
  }>;
  finishReason?: string;
};

// useChat still owns the bubbles. This transport posts one JSON body to PHP
// and replays it as UI message chunks, so the thinking log renders. Tokens
// do not trickle. SSE stays off until AGENT_SSE is implemented on the host.
export class PhpAgentChatTransport implements ChatTransport<UIMessage> {
  constructor(
    private readonly options: {
      api?: string;
      prepareBody?: (
        messages: UIMessage[],
        chatId: string
      ) => Record<string, unknown>;
      onFallback?: (payload: AgentFallbackPayload) => void;
    } = {}
  ) {}

  async sendMessages({
    messages,
    chatId,
    abortSignal,
    body,
  }: SendOptions): Promise<ReadableStream<UIMessageChunk>> {
    const extra =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const prepared = this.options.prepareBody?.(messages, chatId) ?? {
      messages,
      sessionId: chatId,
    };
    const token = readTurnstileToken();
    const payload = {
      ...extra,
      ...prepared,
      ...(token ? { turnstileToken: token } : {}),
    };
    const response = await fetch(this.options.api ?? "/api/agent/chat", {
      method: "POST",
      headers: phpFetchHeaders("POST"),
      body: JSON.stringify(payload),
      credentials: "include",
      signal: abortSignal,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (isFallback(data)) {
        this.options.onFallback?.(data);
        throw new Error(JSON.stringify(data));
      }
      throw new Error(
        JSON.stringify({
          fallback: true,
          reason: "unknown",
          message: "ผู้ช่วยตอบไม่ได้ในตอนนี้",
          suggestedRoutes: [],
        })
      );
    }
    if (!isAgentJson(data)) {
      throw new Error("agent response was empty");
    }
    return replay(data);
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}

function isFallback(value: unknown): value is AgentFallbackPayload {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { fallback?: unknown }).fallback === true
  );
}

function isAgentJson(value: unknown): value is AgentJson {
  return !!value && typeof value === "object";
}

function replay(body: AgentJson): ReadableStream<UIMessageChunk> {
  const messageId = body.id || `agent-${Date.now()}`;
  const chunks: UIMessageChunk[] = [
    { type: "start", messageId },
    { type: "start-step" },
  ];
  let textIndex = 0;
  for (const part of body.parts ?? []) {
    if (part.type === "text" && part.text) {
      const id = `text-${textIndex++}`;
      chunks.push({ type: "text-start", id });
      chunks.push({ type: "text-delta", id, delta: part.text });
      chunks.push({ type: "text-end", id });
      continue;
    }
    if (typeof part.type === "string" && part.type.startsWith("tool-")) {
      const toolName = part.type.slice("tool-".length);
      const toolCallId = part.toolCallId || `call-${toolName}-${textIndex}`;
      chunks.push({ type: "tool-input-start", toolCallId, toolName });
      chunks.push({
        type: "tool-input-available",
        toolCallId,
        toolName,
        input: part.input ?? {},
      });
      chunks.push({
        type: "tool-output-available",
        toolCallId,
        output: part.output ?? null,
      });
    }
  }
  chunks.push({ type: "finish-step" });
  chunks.push({ type: "finish", finishReason: "stop" });
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}
