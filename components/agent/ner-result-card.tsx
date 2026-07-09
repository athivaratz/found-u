"use client";

import { cn } from "@/lib/utils";

export type NerResultData = {
  item: string;
  description?: string | null;
  location?: string | null;
  time?: string | null;
  category?: string | null;
  target?: "lost" | "found";
  contact?: string | null;
  contactType?: string | null;
  remark?: string | null;
};

type NerResultCardProps = {
  data: NerResultData;
  className?: string;
};

export function NerResultCard({ data, className }: NerResultCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl p-4 mb-3 bg-bg-card border border-border-light",
        className
      )}
    >
      <p className="text-xs font-medium text-line-green mb-2">ข้อมูลที่สกัดได้</p>
      <p className="font-semibold text-text-primary text-sm">{data.item || "ไม่ระบุชื่อ"}</p>
      {data.description ? (
        <p className="text-xs text-text-secondary mt-1">{data.description}</p>
      ) : null}
      <div className="text-xs text-text-tertiary mt-2 space-y-0.5">
        {data.location ? <p>📍 {data.location}</p> : null}
        {data.time ? <p>🕐 {data.time}</p> : null}
        {data.category ? <p>หมวด: {data.category}</p> : null}
        {data.contact ? (
          <p>
            ติดต่อ: {data.contact}
            {data.contactType ? ` (${data.contactType})` : ""}
          </p>
        ) : null}
        {data.remark ? <p>หมายเหตุ: {data.remark}</p> : null}
      </div>
    </div>
  );
}
