"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { focusRing } from "@/components/landing/landing-tokens";
import { cn } from "@/lib/utils";

type ComingSoonCtaProps = {
  comingSoon: boolean;
  message?: string;
  href?: string;
  label: string;
  className?: string;
  showArrow?: boolean;
};

export function ComingSoonCta({
  comingSoon,
  message = "พบกันเร็วๆนี้",
  href = "/auth",
  label,
  className,
  showArrow = false,
}: ComingSoonCtaProps) {
  if (comingSoon) {
    return (
      <button
        type="button"
        disabled
        aria-label={message}
        className={cn(
          "inline-flex max-w-full items-center justify-center gap-2 rounded-full",
          className,
          "cursor-not-allowed bg-bg-tertiary text-sm font-medium text-text-primary hover:bg-bg-tertiary"
        )}
      >
        <span className="line-clamp-2 text-center">{message}</span>
      </button>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2",
        focusRing,
        className
      )}
    >
      {label}
      {showArrow ? <ArrowRight className="h-5 w-5 shrink-0" aria-hidden /> : null}
    </Link>
  );
}
