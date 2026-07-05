import { IDENTITY_SECTION } from "./identity";
import { SCOPE_SECTION } from "./scope";
import { TOOL_POLICY_SECTION } from "./tool-policy";
import { GROUNDING_SECTION } from "./grounding";
import { PRIVACY_SECTION } from "./privacy";
import { FIELD_EXTRACTION_SECTION } from "./field-extraction";
import { OUTPUT_FORMAT_SECTION } from "./output-format";
import { EXAMPLES_SECTION } from "./examples";

export type AgentPromptRuntime = {
  today?: string;
  userLoggedIn?: boolean;
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

  return [
    IDENTITY_SECTION,
    `Today: ${today}`,
    authLine,
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
