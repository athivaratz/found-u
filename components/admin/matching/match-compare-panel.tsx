"use client";

import { memo } from "react";
import Image from "next/image";
import { MapPin, Calendar, Hash } from "lucide-react";
import { cn, formatThaiDate } from "@/lib/utils";
import type { FoundItem, LostItem } from "@/lib/types";
import type { AdminMatchPair } from "@/lib/match-admin-client";

const CONFIDENCE_LABEL = {
  high: {
    label: "มั่นใจสูง",
    className: "bg-line-green-light text-line-green-dark dark:text-line-green",
  },
  medium: {
    label: "ปานกลาง",
    className: "bg-status-warning-light text-amber-800 dark:text-amber-200",
  },
  low: {
    label: "ต่ำ",
    className: "bg-bg-tertiary text-text-secondary",
  },
} as const;

function ItemVisual({
  photoUrl,
  categoryIcon,
  alt,
  compact,
  priority,
}: {
  photoUrl?: string | null;
  categoryIcon: string;
  alt: string;
  compact?: boolean;
  priority?: boolean;
}) {
  if (photoUrl) {
    return (
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl bg-bg-secondary",
          compact ? "aspect-[16/10] sm:aspect-[4/3]" : "aspect-[4/3]"
        )}
      >
        <Image
          src={photoUrl}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 40vw"
          unoptimized
          priority={priority}
          loading={priority ? undefined : "lazy"}
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center rounded-xl bg-bg-secondary",
        compact ? "aspect-[16/10] sm:aspect-[4/3]" : "aspect-[4/3]"
      )}
    >
      <span className={cn(compact ? "text-3xl sm:text-4xl" : "text-4xl")} aria-hidden>
        {categoryIcon}
      </span>
    </div>
  );
}

function SideCard({
  kind,
  title,
  location,
  date,
  trackingCode,
  photoUrl,
  categoryIcon,
  meta,
  className,
  imagePriority,
}: {
  kind: "lost" | "found";
  title: string;
  location: string;
  date: Date | string;
  trackingCode: string;
  photoUrl?: string | null;
  categoryIcon: string;
  meta?: string | null;
  className?: string;
  imagePriority?: boolean;
}) {
  const kindLabel = kind === "lost" ? "ของหาย" : "ของเจอ";
  const kindClass =
    kind === "lost"
      ? "bg-status-error-light text-red-800 dark:text-red-200"
      : "bg-line-green-light text-line-green-dark dark:text-line-green";

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border-light bg-bg-card p-3 sm:gap-3 sm:p-4",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", kindClass)}>
          {kindLabel}
        </span>
        {meta ? (
          <span className="truncate text-xs text-text-secondary" title={meta}>
            {meta}
          </span>
        ) : null}
      </div>
      <ItemVisual
        photoUrl={photoUrl}
        categoryIcon={categoryIcon}
        alt={`รูป${kindLabel} ${title}`}
        compact
        priority={imagePriority}
      />
      <div className="min-w-0 space-y-1.5">
        <h3 className="line-clamp-2 text-balance text-base font-medium text-text-primary">
          {title}
        </h3>
        <p className="flex items-start gap-1.5 text-sm text-text-secondary">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-2 break-words">{location || "—"}</span>
        </p>
        <p className="flex items-center gap-1.5 text-sm text-text-secondary">
          <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{formatThaiDate(date)}</span>
        </p>
        <p className="flex items-center gap-1.5 font-mono text-xs text-text-secondary">
          <Hash className="h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{trackingCode}</span>
        </p>
      </div>
    </article>
  );
}

/** Compact score strip — text + badge, no decorative ring */
function ScoreSummary({
  match,
  confidence,
}: {
  match: AdminMatchPair;
  confidence: (typeof CONFIDENCE_LABEL)[keyof typeof CONFIDENCE_LABEL];
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-bg-secondary/80 px-3 py-2.5 sm:px-4"
      aria-label={`คะแนนความคล้าย ${match.scorePercentage} เปอร์เซ็นต์ · ${confidence.label}`}
    >
      <p className="text-sm text-text-primary">
        <span className="tabular-nums font-medium">{match.scorePercentage}%</span>
        <span className="text-text-secondary"> ความคล้าย</span>
      </p>
      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", confidence.className)}>
        {confidence.label}
      </span>
      {match.reasons.length > 0 ? (
        <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {match.reasons.slice(0, 4).map((reason) => (
            <li
              key={reason}
              className="max-w-full truncate rounded-full bg-bg-card px-2 py-0.5 text-xs text-text-secondary"
              title={reason}
            >
              {reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MatchComparePanelInner({
  match,
  getCategoryIcon,
}: {
  match: AdminMatchPair;
  getCategoryIcon: (category?: string) => string;
}) {
  const lost = match.lostItem as LostItem;
  const found = match.foundItem as FoundItem;
  const confidence = CONFIDENCE_LABEL[match.confidence];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      <div className="order-1 sm:col-span-2">
        <ScoreSummary match={match} confidence={confidence} />
      </div>

      <SideCard
        className="order-2"
        kind="lost"
        title={lost.itemName}
        location={lost.locationLost}
        date={lost.dateLost}
        trackingCode={lost.trackingCode}
        categoryIcon={getCategoryIcon(lost.category)}
        meta={lost.description}
      />

      <SideCard
        className="order-3"
        kind="found"
        title={found.itemName?.trim() || found.description}
        location={found.locationFound}
        date={found.dateFound}
        trackingCode={found.trackingCode}
        photoUrl={found.photoUrl}
        categoryIcon={getCategoryIcon(found.category)}
        meta={[found.brand, found.color].filter(Boolean).join(" · ") || found.description}
        imagePriority
      />
    </div>
  );
}

export const MatchComparePanel = memo(MatchComparePanelInner);
