import { getToolName, isToolUIPart, type UIMessage } from "ai";

/** Detect reportFoundItem failures caused by school GPS / permission. */
export function findLatestFoundLocationBlock(messages: UIMessage[]): {
  message: string;
  locationCode: string | null;
} | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts || []) {
      if (!isToolUIPart(part) || part.state !== "output-available") continue;
      if (getToolName(part) !== "reportFoundItem") continue;
      const output = part.output as {
        ok?: boolean;
        message?: string;
        data?: { locationBlocked?: boolean; locationCode?: string | null };
      } | null;
      if (!output || output.ok !== false) continue;
      if (!output.data?.locationBlocked && !output.message) continue;
      if (
        output.data?.locationBlocked ||
        (typeof output.message === "string" &&
          (/ตำแหน่ง|โรงเรียน|GPS|พิกัด|อนุญาต/i.test(output.message)))
      ) {
        return {
          message: output.message || "ยังดำเนินการแจ้งเจอของให้ไม่ได้",
          locationCode: output.data?.locationCode ?? null,
        };
      }
    }
  }
  return null;
}

/** Explicit lost-item intent — must not trigger found GPS gate. */
export function isLostReportPrompt(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/(เจอของ|แจ้งเจอ|ของเจอ|ของตก|ลืมของไว้|คนลืม)/.test(t)) {
    return false;
  }
  return (
    t.includes("แจ้งของหาย") ||
    t.includes("ทำหาย") ||
    t.includes("ของหาย") ||
    t.includes("report lost") ||
    t.includes("lost item") ||
    /ช่วย.*(แจ้ง|ลงทะเบียน).*หาย/.test(t)
  );
}

/** User is pivoting away from found-report (search / list / tracking). */
export function isNonFoundPivotPrompt(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (isLostReportPrompt(t)) return true;
  return (
    /ค้นหา|หาของ|ลิสต์|รายการของ|ของฉัน|ติดตาม|tracking|สถานะรหัส/.test(t) &&
    !/(แจ้งเจอ|เจอของ|ของตก|ลืมของไว้)/.test(t)
  );
}

/**
 * Detect found-item report intent early (before the model asks for details).
 * Covers casual Thai phrasing like "เหมือนมีคนลืมของไว้ ขอแจ้งหน่อย".
 */
export function isFoundReportPrompt(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (isLostReportPrompt(t)) return false;

  return (
    t.includes("แจ้งเจอ") ||
    t.includes("เจอของ") ||
    t.includes("ของเจอ") ||
    t.includes("ของตก") ||
    t.includes("ลืมของไว้") ||
    t.includes("คนลืม") ||
    t.includes("มีคนลืม") ||
    t.includes("report found") ||
    t.includes("found item") ||
    /ช่วย.*(แจ้ง|ลงทะเบียน).*(เจอ|พบ)/.test(t) ||
    /(เจอ|พบ).*(ของ|ไอเทม|iphone|โทรศัพท์|กระเป๋า)/.test(t) ||
    // "ขอแจ้งหน่อย" / "ขอแจ้ง" with found-ish context (forgot / left behind / item)
    /(ขอ)?แจ้ง(หน่อย|ให้|ลง)?/.test(t) &&
      /(ลืม|เจอ|พบ|ตก|ของไว้|ของใคร)/.test(t)
  );
}

/** Assistant just asked for found-item fields — follow-ups still need GPS. */
export function assistantAskedForFoundDetails(messages: UIMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const text = (msg.parts || [])
      .map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
      .join("\n");
    if (!text.trim()) continue;
    const looksFoundIntake =
      /(เจอ|พบ|ของที่เจอ|สถานที่เจอ|แจ้ง.*เจอ|ลงทะเบียนของเจอ)/.test(text) &&
      /(อะไร|ที่ไหน|รายละเอียด|สี|ยี่ห้อ|เวลา|เบอร์|ติดต่อ)/.test(text);
    if (looksFoundIntake) return true;
    // Only inspect the latest assistant turn
    return false;
  }
  return false;
}
