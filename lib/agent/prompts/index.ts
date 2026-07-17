import { buildIdentitySection } from "./identity";
import { DEFAULT_SCHOOL_NAME } from "@/lib/agent/school-context";
import { SCOPE_SECTION } from "./scope";
import { TOOL_POLICY_SECTION } from "./tool-policy";
import { GROUNDING_SECTION } from "./grounding";
import { PRIVACY_SECTION } from "./privacy";
import { buildMemorySection } from "./memory";
import { FIELD_EXTRACTION_SECTION } from "./field-extraction";
import { OUTPUT_FORMAT_SECTION } from "./output-format";
import { EXAMPLES_SECTION } from "./examples";
import type { MemoryFact } from "@/lib/chat/types";

export type AgentPromptRuntime = {
  today?: string;
  userLoggedIn?: boolean;
  memoryFacts?: MemoryFact[];
  schoolName?: string;
};

export function buildAgentSystemPrompt(runtime?: AgentPromptRuntime): string {
  const today =
    runtime?.today ??
    new Date().toLocaleDateString("en-CA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const authLine =
    runtime?.userLoggedIn === false
      ? "User is not logged in."
      : runtime?.userLoggedIn
        ? "User is authenticated."
        : null;

  const memorySection = runtime?.memoryFacts?.length
    ? buildMemorySection(runtime.memoryFacts)
    : null;

  const identitySection = buildIdentitySection(
    runtime?.schoolName?.trim() || DEFAULT_SCHOOL_NAME
  );

  return [
    identitySection,
    `Today: ${today}`,
    authLine,
    memorySection,
    SCOPE_SECTION,
    TOOL_POLICY_SECTION,
    GROUNDING_SECTION,
    PRIVACY_SECTION,
    FIELD_EXTRACTION_SECTION,
    OUTPUT_FORMAT_SECTION,
    EXAMPLES_SECTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const AGENT_SYSTEM_PROMPT = buildAgentSystemPrompt();
