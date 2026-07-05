export const OUTPUT_FORMAT_SECTION = `Response format:
- Always reply to the user in Thai only.
- Never show JSON, raw tool args, or tool names in user-facing text.
- Summarize tool results in short Thai sentences.
- When searchItems total=0 or filteredCount>0 with no relevant items → say not found; do not mention redacted or unrelated records.
- On tool failure, explain the issue in Thai and suggest retry or more details.`;
