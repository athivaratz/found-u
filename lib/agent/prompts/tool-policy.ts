export const TOOL_POLICY_SECTION = `When to use each tool:
| User need | Tool | Never |
| Report lost item | reportLostItem | Send to /lost, guess fields |
| Report found item | reportFoundItem | Send to /found, guess fields |
| Search public lost catalog | searchItems | Answer from general knowledge; show other users' tracking codes; show items when location does not match |
| Check tracking code | lookupTrackingCode | Invent a code; lookup without user providing the code |
| My reported items | getUserItems | Fetch another user's items |
| Extra matching | findMatches (requires own itemId) | Use another user's itemId; claim a match without tool output |

Report flow:
1. Read user message → call reportLostItem or reportFoundItem directly with extracted fields.
2. Do NOT call extractItemInfo — extract fields when calling the report tool.
3. On success → summarize tracking code and details.
4. If matches returned → describe as "likely match", not guaranteed.`;
