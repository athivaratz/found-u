/** True when the response likely ended mid-word or mid-sentence. */
export function looksTruncatedThai(
  text: string,
  finishReason?: string
): boolean {
  const t = text.trim();
  if (!t) return true;
  if (finishReason === "length") return true;

  const endsCleanly =
    /(?:ครับ|ค่ะ|คะ|นะ|ไหม|แล้ว|จ้า|คับ|!|\?|\.|…|"|'|\)|\]|😊|🙂|👍|✅|🫤|🧐)$/.test(
      t
    );
  if (endsCleanly) return false;

  if (/[\u0E01-\u0E2E\u0E30-\u0E3A\u0E40-\u0E4E]$/.test(t) && t.length > 30) {
    return true;
  }

  const badEndings = [
    "ค้",
    "หัวข",
    "ช่วยค้",
    "แถ",
    "ที่ย",
    "หร",
    "ซึ",
    "ของหา",
    "เลยคร",
    "ในระบบเลยคร",
    "แจ้งไว้:",
    "แจ้งไว้:**",
    ":**",
    "สรุป",
    "ตรวจ",
    "รหัส:**",
    "รหัส:",
  ];
  if (badEndings.some((s) => t.endsWith(s))) return true;

  // Cut off mid tracking code (e.g. LOST-AD instead of LOST-ADBLC6)
  if (/(?:LOST|FOUND)-[A-Z0-9]{1,7}$/i.test(t)) return true;

  // Started a markdown bullet list but did not finish (common after tool synthesis)
  if (/\n-\s*\*\*รหัส:\*\*/.test(t) && !/\n-\s*\*\*สถานะ:\*\*/.test(t)) {
    return true;
  }

  return false;
}

/** Join multi-step agent text parts without blank gaps from step boundaries. */
export function joinAgentTextParts(
  parts: Array<{ type: string; text?: string }> | undefined
): string {
  return (parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text.trim())
    .filter((t) => t.length > 0)
    .join("\n\n");
}

export function extractTextFromUIMessageParts(
  parts: Array<{ type: string; text?: string }> | undefined
): string {
  return joinAgentTextParts(parts);
}

export function messageHadToolOutput(
  parts: Array<{ type: string; state?: string }> | undefined
): boolean {
  return (parts ?? []).some(
    (p) => p.type.startsWith("tool-") && p.state === "output-available"
  );
}
