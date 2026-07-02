import type { AppSettings, FoundItem } from "@/lib/types";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";

export function getFoundHandoverDeadlineMinutes(settings?: AppSettings): number {
  const minutes = settings?.foundHandoverDeadlineMinutes ?? DEFAULT_APP_SETTINGS.foundHandoverDeadlineMinutes ?? 60;
  return Math.max(1, Math.min(24 * 60, minutes));
}

export function isFoundHandoverDeadlineEnabled(settings?: AppSettings): boolean {
  return settings?.foundHandoverDeadlineEnabled !== false;
}

/** คำนวณเวลาหมดเขตส่งห้องบุคคล (จากฟิลด์หรือ createdAt + นาทีจาก settings) */
export function resolveHandoverDeadlineAt(
  item: Pick<FoundItem, "handoverDeadlineAt" | "createdAt">,
  settings?: AppSettings
): Date | null {
  if (!isFoundHandoverDeadlineEnabled(settings)) return null;
  if (item.handoverDeadlineAt) return item.handoverDeadlineAt;
  if (item.createdAt) {
    const minutes = getFoundHandoverDeadlineMinutes(settings);
    return new Date(item.createdAt.getTime() + minutes * 60 * 1000);
  }
  return null;
}

export function computeHandoverDeadlineFromNow(settings?: AppSettings): Date | null {
  if (!isFoundHandoverDeadlineEnabled(settings)) return null;
  const minutes = getFoundHandoverDeadlineMinutes(settings);
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function isHandoverPastDeadline(
  item: Pick<FoundItem, "status" | "handoverDeadlineAt" | "createdAt">,
  settings?: AppSettings
): boolean {
  if (item.status !== "pending_room_confirm") return false;
  if (!isFoundHandoverDeadlineEnabled(settings)) return false;
  const deadline = resolveHandoverDeadlineAt(item, settings);
  if (!deadline) return false;
  return Date.now() > deadline.getTime();
}

export function formatHandoverDeadlineThai(date: Date): string {
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatHandoverCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "หมดเวลาแล้ว";
  const totalSec = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours} ชม. ${minutes} นาที`;
  }
  if (minutes > 0) {
    return `${minutes} นาที ${seconds} วินาที`;
  }
  return `${seconds} วินาที`;
}
