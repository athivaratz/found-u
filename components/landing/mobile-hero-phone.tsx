"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { m } from "framer-motion";

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
};

const PHONE_MAX_WIDTH = 320;
const BEZEL = 8;
const DEFAULT_RATIO = 9 / 19;

function imageAspect(img: MobileHeroImage) {
  if (img.width > 0 && img.height > 0) return img.width / img.height;
  return DEFAULT_RATIO;
}

export function MobileHeroPhone({ images, intervalMs = 3500 }: MobileHeroPhoneProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeActiveIndex =
    images.length === 0 ? 0 : Math.min(activeIndex, images.length - 1);

  const screenAspect = useMemo(() => {
    if (images.length === 0) return DEFAULT_RATIO;
    return Math.min(...images.map(imageAspect));
  }, [images]);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [images.length, intervalMs]);

  if (images.length === 0) {
    return (
      <div className="mx-auto mt-8 flex w-full max-w-[320px] justify-center px-2 md:hidden">
        <div
          className="w-full max-w-[320px] rounded-[40px] border border-border-light bg-bg-tertiary p-2"
          style={{ aspectRatio: String(DEFAULT_RATIO) }}
        >
          <div className="flex h-full min-h-[200px] items-center justify-center rounded-[32px] bg-bg-secondary text-sm text-text-tertiary">
            กำลังโหลดตัวอย่างหน้าจอ...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-8 flex w-full max-w-[336px] justify-center px-2 md:hidden">
      <div
        className="w-full max-w-[320px] rounded-[40px] border border-border-light bg-bg-tertiary p-2 shadow-lg shadow-black/10 dark:shadow-black/40"
        style={{ maxWidth: PHONE_MAX_WIDTH + BEZEL * 2 }}
      >
        <div className="relative overflow-hidden rounded-[32px] bg-bg-secondary">
          <div className="pointer-events-none absolute left-1/2 top-2.5 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-bg-primary/95 shadow-sm" />

          <div
            className="relative w-full overflow-hidden"
            style={{ aspectRatio: screenAspect }}
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
                    x: isActive ? 0 : idx < activeIndex ? -18 : 18,
                  }}
                  transition={{ duration: 0.45, ease: "easeInOut" }}
                  style={{ pointerEvents: "none" }}
                >
                  <Image
                    src={img.url}
                    alt={img.label}
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
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
            {images.map((img, idx) => (
              <span
                key={img.fileName}
                className={`h-1.5 rounded-full transition-all ${
                  idx === safeActiveIndex
                    ? "w-5 bg-line-green"
                    : "w-1.5 bg-border-medium"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
