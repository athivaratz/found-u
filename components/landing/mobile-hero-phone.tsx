"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { m } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { focusRing } from "@/components/landing/landing-tokens";
import { cn } from "@/lib/utils";

export type MobileHeroImage = {
  fileName: string;
  label: string;
  url: string;
  width: number;
  height: number;
};

type MobileHeroPhoneProps = {
  images: MobileHeroImage[];
  /** ระยะห่างระหว่างการสลับภาพ (ms) */
  intervalMs?: number;
  className?: string;
};

const PHONE_MAX_WIDTH = 320;
const BEZEL = 8;
const DEFAULT_RATIO = 9 / 19;
const SWIPE_THRESHOLD_PX = 48;

/** ease-out-quint — matches DESIGN motion guidance */
const slideEase = [0.22, 1, 0.36, 1] as const;

function imageAspect(img: MobileHeroImage) {
  if (img.width > 0 && img.height > 0) return img.width / img.height;
  return DEFAULT_RATIO;
}

export function MobileHeroPhone({
  images,
  intervalMs = 3500,
  className,
}: MobileHeroPhoneProps) {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const safeActiveIndex =
    images.length === 0 ? 0 : Math.min(activeIndex, images.length - 1);

  const screenAspect = useMemo(() => {
    if (images.length === 0) return DEFAULT_RATIO;
    return Math.min(...images.map(imageAspect));
  }, [images]);

  useEffect(() => {
    if (images.length <= 1 || reduceMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [images.length, intervalMs, reduceMotion]);

  const goToSlide = (index: number) => {
    if (images.length === 0) return;
    setActiveIndex(((index % images.length) + images.length) % images.length);
  };

  const goNext = () => goToSlide(safeActiveIndex + 1);
  const goPrev = () => goToSlide(safeActiveIndex - 1);

  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null || images.length <= 1) return;
    const endX = event.changedTouches[0]?.clientX;
    if (endX === undefined) return;
    const delta = endX - touchStartX.current;
    if (Math.abs(delta) >= SWIPE_THRESHOLD_PX) {
      if (delta < 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  };

  if (images.length === 0) {
    return (
      <div className={cn("mx-auto w-full max-w-[320px] px-2", className)}>
        <div
          className="w-full max-w-[320px] rounded-[40px] border border-border-light bg-bg-tertiary p-2"
          style={{ aspectRatio: String(DEFAULT_RATIO) }}
        >
          <div
            role="status"
            aria-live="polite"
            className="flex h-full min-h-[200px] items-center justify-center rounded-[32px] bg-bg-secondary px-4 text-center text-sm text-text-secondary"
          >
            กำลังโหลดตัวอย่างหน้าจอ...
          </div>
        </div>
      </div>
    );
  }

  const activeLabel = images[safeActiveIndex]?.label ?? "";
  const slideTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.35, ease: slideEase };

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[336px] px-2 max-sm:landscape:max-w-[280px]",
        className
      )}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {activeLabel ? `ตัวอย่างหน้าจอ: ${activeLabel}` : ""}
      </p>
      <div className="flex justify-center">
        <div
          className="w-full max-w-[320px] rounded-[40px] border border-border-light bg-bg-tertiary p-2"
          style={{ maxWidth: PHONE_MAX_WIDTH + BEZEL * 2 }}
        >
          <div className="relative overflow-hidden rounded-[32px] bg-bg-secondary">
            <div className="pointer-events-none absolute left-1/2 top-2.5 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-bg-primary/95 shadow-sm" />

            <div
              className="relative w-full touch-pan-y overflow-hidden"
              style={{ aspectRatio: screenAspect }}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {images.map((img, idx) => {
                const isActive = idx === safeActiveIndex;
                const isNear = Math.abs(idx - safeActiveIndex) <= 1;
                return (
                  <m.div
                    key={img.fileName}
                    className="absolute inset-0"
                    animate={{
                      opacity: isActive ? 1 : 0,
                      x: reduceMotion
                        ? 0
                        : isActive
                          ? 0
                          : idx < safeActiveIndex
                            ? -18
                            : 18,
                    }}
                    transition={slideTransition}
                    style={{ pointerEvents: "none" }}
                  >
                    <Image
                      src={img.url}
                      alt={isActive ? img.label : ""}
                      aria-hidden={!isActive}
                      fill
                      sizes="320px"
                      priority={idx === 0 || isNear}
                      className="object-contain object-top"
                      unoptimized={img.url.endsWith(".svg")}
                    />
                  </m.div>
                );
              })}
            </div>
          </div>

          {images.length > 1 && (
            <div
              className="mt-2 flex justify-center gap-0.5"
              role="group"
              aria-label={`ตัวอย่างหน้าจอ ${safeActiveIndex + 1} จาก ${images.length}`}
            >
              {images.map((img, idx) => {
                const isActive = idx === safeActiveIndex;
                return (
                  <button
                    key={img.fileName}
                    type="button"
                    aria-label={`ดูตัวอย่าง ${idx + 1}: ${img.label}`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => goToSlide(idx)}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full",
                      focusRing,
                      "focus-visible:ring-offset-bg-tertiary"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "rounded-full motion-reduce:transition-none",
                        isActive
                          ? "h-1.5 w-5 bg-line-green transition-all duration-300"
                          : "h-1.5 w-1.5 bg-border-medium transition-all duration-300"
                      )}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
