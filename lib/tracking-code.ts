import type { ItemStatus } from "@/lib/types";

/** Same alphabet as `generateTrackingCode` — no I, O, 0, or 1. */
export const TRACKING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TRACKING_CODE_BODY_LENGTH = 6;
/** Room for a spaced paste such as "FOUND - ABC234" before normalization. */
export const TRACKING_CODE_INPUT_MAX_LENGTH = 24;

const TRACKING_CODE_RE = new RegExp(
  `^(LOST|FOUND)-([${TRACKING_CODE_ALPHABET}]{${TRACKING_CODE_BODY_LENGTH}})$`
);

export type TrackingKind = "lost" | "found";

export type NormalizedTrackingCode =
  | { ok: true; code: string; kind: TrackingKind }
  | { ok: false; code: ""; kind: null; message: string };

const EMPTY_MESSAGE = "กรุณากรอกรหัสติดตาม";
const INVALID_MESSAGE =
  "รหัสติดตามต้องเป็น LOST- หรือ FOUND- ตามด้วยตัวอักษร 6 ตัว (เช่น LOST-ABC234)";

/**
 * Accepts the code students paste from a success screen:
 * optional spaces or an underscore in place of the hyphen, any letter case.
 */
export function normalizeTrackingCode(raw: string): NormalizedTrackingCode {
  const compact = raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_+/g, "-")
    .replace(/-+/g, "-");
  if (!compact) {
    return { ok: false, code: "", kind: null, message: EMPTY_MESSAGE };
  }

  const match = TRACKING_CODE_RE.exec(compact);
  if (!match) {
    return { ok: false, code: "", kind: null, message: INVALID_MESSAGE };
  }

  const prefix = match[1];
  return {
    ok: true,
    code: `${prefix}-${match[2]}`,
    kind: prefix === "FOUND" ? "found" : "lost",
  };
}

export function trackingStatusHint(kind: TrackingKind, status: ItemStatus): string {
  if (kind === "lost") {
    switch (status) {
      case "searching":
        return "กำลังตามหา รอดูว่ามีคนเจอ";
      case "pending_room_confirm":
        return "พบของแล้ว กำลังรอส่งหรือยืนยันที่ห้องบุคคล";
      case "found":
        return "ของถึงห้องบุคคลแล้ว กรุณาติดต่อรับคืนที่ห้องบุคคล";
      case "claimed":
        return "รับคืนเรียบร้อยแล้ว";
      case "expired":
        return "รายการนี้หมดอายุแล้ว";
      default:
        return "ไม่ทราบสถานะ";
    }
  }

  switch (status) {
    case "pending_room_confirm":
      return "รอส่งห้องบุคคล นำของไปที่จุดส่งมอบเพื่อให้เจ้าของมารับ";
    case "found":
      return "ถึงห้องบุคคลแล้ว เจ้าของสามารถมารับคืนได้";
    case "claimed":
      return "เจ้าของรับคืนเรียบร้อยแล้ว";
    case "expired":
      return "หมดเวลาส่งห้องบุคคล รายการนี้หมดอายุ";
    case "searching":
      return "กำลังดำเนินการ";
    default:
      return "ไม่ทราบสถานะ";
  }
}

/** Reporter contacts stay hidden unless the viewer owns the report or is an admin. */
export function canViewReporterContacts(input: {
  isAdmin: boolean;
  viewerId?: string | null;
  ownerId?: string | null;
}): boolean {
  if (input.isAdmin) return true;
  if (!input.viewerId || !input.ownerId) return false;
  return input.viewerId === input.ownerId;
}
