import { IDENTITY_SECTION } from "./identity";
import { SCOPE_SECTION } from "./scope";
import { TOOL_POLICY_SECTION } from "./tool-policy";
import { GROUNDING_SECTION } from "./grounding";
import { FIELD_EXTRACTION_SECTION } from "./field-extraction";
import { OUTPUT_FORMAT_SECTION } from "./output-format";
import { EXAMPLES_SECTION } from "./examples";

export function buildAgentSystemPrompt(runtime?: { today?: string }): string {
  const today =
    runtime?.today ??
    new Date().toLocaleDateString("th-TH", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  return [
    IDENTITY_SECTION,
    `วันนี้: ${today}`,
    SCOPE_SECTION,
    TOOL_POLICY_SECTION,
    GROUNDING_SECTION,
    FIELD_EXTRACTION_SECTION,
    OUTPUT_FORMAT_SECTION,
    EXAMPLES_SECTION,
  ].join("\n\n");
}

export const AGENT_SYSTEM_PROMPT = buildAgentSystemPrompt();
