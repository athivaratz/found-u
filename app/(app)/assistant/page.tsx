"use client";

import { AssistantAppShell } from "@/components/layout/assistant-app-shell";
import { AgentChatShell } from "@/components/agent/agent-chat-shell";
import "@/app/agent-globals.css";

export default function AssistantPage() {
  return (
    <AssistantAppShell>
      <AgentChatShell />
    </AssistantAppShell>
  );
}
