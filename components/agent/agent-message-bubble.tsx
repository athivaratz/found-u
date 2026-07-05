"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import {
  isToolUIPart,
  type UIMessage,
} from "ai";
import { AgentThinkingLog } from "@/components/agent/agent-thinking-log";
import {
  ItemResultCard,
  type SerializedItem,
} from "@/components/agent/item-result-card";
import { MatchResultCard } from "@/components/agent/match-result-card";
import { NerResultCard, type NerResultData } from "@/components/agent/ner-result-card";
import { cn } from "@/lib/utils";

function extractTextFromMessage(message: UIMessage): string {
  return (message.parts || [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function extractToolArtifacts(message: UIMessage) {
  const items: SerializedItem[] = [];
  const newItems: SerializedItem[] = [];
  const matches: Array<{
    scorePercentage: number;
    confidence: string;
    lostItem: SerializedItem;
    foundItem: SerializedItem;
    reasons?: string[];
  }> = [];
  const nerResults: NerResultData[] = [];

  for (const part of message.parts || []) {
    if (!isToolUIPart(part) || part.state !== "output-available") continue;
    const output = part.output as {
      resultType?: string;
      data?: unknown;
    } | undefined;
    if (!output?.data) continue;

    if (output.resultType === "ner" && output.data) {
      nerResults.push(output.data as NerResultData);
    } else if (output.resultType === "report" && output.data) {
      const data = output.data as {
        item?: SerializedItem;
        matches?: typeof matches;
      };
      if (data.item) {
        newItems.push(data.item);
        items.push(data.item);
      }
      if (data.matches?.length) {
        matches.push(...data.matches);
      }
    } else if (output.resultType === "items") {
      const data = output.data as { lost?: SerializedItem[]; found?: SerializedItem[] };
      items.push(...(data.lost || []), ...(data.found || []));
    } else if (output.resultType === "tracking" && output.data) {
      items.push(output.data as SerializedItem);
    } else if (output.resultType === "match" && Array.isArray(output.data)) {
      matches.push(...(output.data as typeof matches));
    }
  }

  return { items, newItems, matches, nerResults };
}

type AgentMessageBubbleProps = {
  message: UIMessage;
  isStreaming?: boolean;
  showThinkingLog?: boolean;
};

export function AgentMessageBubble({
  message,
  isStreaming,
  showThinkingLog = true,
}: AgentMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const text = extractTextFromMessage(message);
  const { items, newItems, matches, nerResults } = isUser
    ? { items: [], newItems: [], matches: [], nerResults: [] }
    : extractToolArtifacts(message);

  const newItemIds = new Set(newItems.map((item) => item.id));

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-line-green/10 text-text-primary text-[15px] leading-relaxed">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-6 group">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-line-green to-emerald-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 max-w-none">
        {showThinkingLog ? (
          <AgentThinkingLog message={message} isStreaming={isStreaming} />
        ) : null}

        {nerResults.map((ner, i) => (
          <NerResultCard key={`ner-${i}`} data={ner} />
        ))}

        {items.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
            {items.map((item) => (
              <ItemResultCard
                key={`${item.type}-${item.id}`}
                item={item}
                isNew={newItemIds.has(item.id)}
              />
            ))}
          </div>
        )}

        {matches.map((match, i) => (
          <MatchResultCard key={i} match={match} className="mb-3" />
        ))}

        {text ? (
          <div className="relative">
            <p className="text-[15px] leading-relaxed text-text-primary whitespace-pre-wrap">
              {text}
              {isStreaming ? <span className="agent-stream-cursor" aria-hidden /> : null}
            </p>
            {!isStreaming && (
              <button
                type="button"
                onClick={handleCopy}
                className="absolute -top-1 right-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-bg-tertiary text-text-tertiary transition-opacity"
                aria-label="คัดลอก"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-line-green" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
