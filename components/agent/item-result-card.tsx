"use client";

import Link from "next/link";
import { formatThaiDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type SerializedItem = {
  type: "lost" | "found";
  id: string;
  trackingCode?: string;
  itemName?: string | null;
  category?: string | null;
  description?: string | null;
  location?: string;
  locationPlaceName?: string | null;
  photoUrl?: string | null;
  status?: string;
  dateLost?: string;
  dateFound?: string;
};

type ItemResultCardProps = {
  item: SerializedItem;
  className?: string;
  isNew?: boolean;
};

const statusLabels: Record<string, string> = {
  searching: "กำลังค้นหา",
  pending_room_confirm: "รอส่งห้องบุคคล",
  found: "พบแล้ว",
  claimed: "รับคืนแล้ว",
  expired: "หมดอายุ",
};

export function ItemResultCard({ item, className, isNew }: ItemResultCardProps) {
  const name = item.itemName || item.description || "ไม่ระบุชื่อ";
  const location = item.locationPlaceName || item.location || "-";
  const dateStr = item.dateLost || item.dateFound;
  const dateLabel = dateStr ? formatThaiDate(new Date(dateStr)) : "-";

  return (
    <div
      className={cn(
        "rounded-2xl p-4 agent-glass",
        "bg-white/70 dark:bg-white/5 border border-white/30 dark:border-white/10",
        "min-w-[260px] max-w-sm shrink-0",
        isNew && "ring-2 ring-line-green/40",
        className
      )}
    >
      {isNew ? (
        <p className="text-xs font-semibold text-line-green mb-2">
          แจ้ง{item.type === "lost" ? "ของหาย" : "เจอของ"}สำเร็จ
        </p>
      ) : null}
      {item.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.photoUrl}
          alt={name}
          className="w-full h-28 object-cover rounded-xl mb-3"
        />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-text-primary text-sm line-clamp-2">{name}</h4>
        <span
          className={cn(
            "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full shrink-0",
            item.type === "lost"
              ? "bg-status-error-light text-status-error"
              : "bg-line-green-light text-line-green"
          )}
        >
          {item.type === "lost" ? "หาย" : "เจอ"}
        </span>
      </div>
      <p className="text-xs text-text-secondary mt-2">
        สถานะ: {statusLabels[item.status || ""] || item.status || "-"}
        {item.trackingCode ? ` · ${item.trackingCode}` : ""}
      </p>
      <p className="text-xs text-text-tertiary mt-1 truncate">📍 {location} · {dateLabel}</p>
      <div className="flex gap-2 mt-3 pt-3 border-t border-border-light/60">
        {item.trackingCode ? (
          <Link
            href={`/tracking?code=${encodeURIComponent(item.trackingCode)}`}
            className="flex-1 text-center text-xs font-medium py-2 rounded-xl bg-line-green text-white hover:bg-line-green-hover transition-colors"
          >
            ติดตามรหัส
          </Link>
        ) : null}
        <Link
          href="/list"
          className="flex-1 text-center text-xs font-medium py-2 rounded-xl bg-bg-tertiary text-text-primary hover:bg-bg-secondary transition-colors"
        >
          ดูรายการ
        </Link>
      </div>
    </div>
  );
}
