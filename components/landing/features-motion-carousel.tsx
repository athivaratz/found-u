"use client";

import type { LucideIcon } from "lucide-react";
import { MotionCarousel, type MotionCarouselSlide } from "@/components/ui/motion-carousel";
import { cn } from "@/lib/utils";

export type FeatureItem = {
  id: string;
  icon: LucideIcon;
  title: string;
  text: string;
  tint: string;
  dotLabel: string;
};

type FeaturesMotionCarouselProps = {
  features: FeatureItem[];
};

export function FeaturesMotionCarousel({ features }: FeaturesMotionCarouselProps) {
  const slides: MotionCarouselSlide[] = features.map((feature) => {
    const Icon = feature.icon;
    return {
      id: feature.id,
      label: feature.dotLabel,
      content: (
        <article
          className={cn(
            "flex h-full w-full flex-col rounded-2xl border border-border-light bg-bg-card p-6 shadow-card",
            "md:p-7"
          )}
        >
          <div
            className={cn(
              "mb-4 flex h-12 w-12 items-center justify-center rounded-xl",
              feature.tint
            )}
          >
            <Icon className="h-6 w-6" aria-hidden />
          </div>
          <h3 className="text-lg font-semibold text-text-primary md:text-xl">
            {feature.title}
          </h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-text-secondary md:text-base">
            {feature.text}
          </p>
        </article>
      ),
    };
  });

  return (
    <MotionCarousel
      slides={slides}
      options={{
        align: "center",
        loop: true,
        containScroll: false,
      }}
    />
  );
}
