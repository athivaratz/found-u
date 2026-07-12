"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { FeatureItem } from "@/components/landing/features-motion-carousel";

const FeaturesMotionCarousel = dynamic(
  () =>
    import("@/components/landing/features-motion-carousel").then(
      (mod) => mod.FeaturesMotionCarousel
    ),
  {
    ssr: false,
    loading: () => <FeaturesCarouselSkeleton />,
  }
);

function FeaturesCarouselSkeleton() {
  return (
    <div
      className="w-full space-y-5"
      role="status"
      aria-live="polite"
      aria-label="กำลังโหลดฟีเจอร์"
    >
      <div className="h-[14rem] animate-pulse rounded-2xl bg-bg-tertiary sm:h-[15rem] md:h-[16rem]" />
      <div className="flex items-center justify-between gap-3">
        <div className="h-11 w-11 shrink-0 rounded-full bg-bg-tertiary" />
        <div className="flex flex-1 justify-center gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-3 w-3 rounded-full bg-bg-tertiary" />
          ))}
        </div>
        <div className="h-11 w-11 shrink-0 rounded-full bg-bg-tertiary" />
      </div>
    </div>
  );
}

type LandingFeaturesCarouselLazyProps = {
  features: FeatureItem[];
};

export function LandingFeaturesCarouselLazy({
  features,
}: LandingFeaturesCarouselLazyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || shouldLoad) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef} className="min-h-[14rem] sm:min-h-[15rem] md:min-h-[16rem]">
      {shouldLoad ? (
        <FeaturesMotionCarousel features={features} />
      ) : (
        <FeaturesCarouselSkeleton />
      )}
    </div>
  );
}
