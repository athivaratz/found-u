"use client";

import { StudentAppShell } from "@/components/layout/student-app-shell";
import { AgentChatShell } from "@/components/agent/agent-chat-shell";
import "@/app/agent-globals.css";

export default function AssistantPage() {
  return (
    <StudentAppShell variant="assistant" maxWidth="full" showBottomNav={false}>
      <AgentChatShell />
    </StudentAppShell>
  );
}
