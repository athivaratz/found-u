"use client";

/**
 * Motion Carousel — adapted from Animate UI (Embla + Framer Motion)
 * @see https://animate-ui.com/docs/components/community/motion-carousel
 */

import * as React from "react";
import { motion, type Transition } from "framer-motion";
import type { EmblaCarouselType, EmblaOptionsType } from "embla-carousel";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export type MotionCarouselSlide = {
  id: string;
  /** Short label for pill pagination */
  label: string;
  content: React.ReactNode;
};

type MotionCarouselProps = {
  slides: MotionCarouselSlide[];
  options?: EmblaOptionsType;
  className?: string;
};

type EmblaControls = {
  selectedIndex: number;
  scrollSnaps: number[];
  prevDisabled: boolean;
  nextDisabled: boolean;
  onDotClick: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
};

const springTransition: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 24,
  mass: 1,
};

function useEmblaControls(emblaApi: EmblaCarouselType | undefined): EmblaControls {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([]);
  const [prevDisabled, setPrevDisabled] = React.useState(true);
  const [nextDisabled, setNextDisabled] = React.useState(true);

  const onDotClick = React.useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi]
  );
  const onPrev = React.useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const onNext = React.useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const updateSelectionState = React.useCallback((api: EmblaCarouselType) => {
    setSelectedIndex(api.selectedScrollSnap());
    setPrevDisabled(!api.canScrollPrev());
    setNextDisabled(!api.canScrollNext());
  }, []);

  const onInit = React.useCallback(
    (api: EmblaCarouselType) => {
      setScrollSnaps(api.scrollSnapList());
      updateSelectionState(api);
    },
    [updateSelectionState]
  );

  const onSelect = React.useCallback(
    (api: EmblaCarouselType) => {
      updateSelectionState(api);
    },
    [updateSelectionState]
  );

  React.useEffect(() => {
    if (!emblaApi) return;
    onInit(emblaApi);
    emblaApi.on("reInit", onInit).on("select", onSelect);
    return () => {
      emblaApi.off("reInit", onInit).off("select", onSelect);
    };
  }, [emblaApi, onInit, onSelect]);

  return {
    selectedIndex,
    scrollSnaps,
    prevDisabled,
    nextDisabled,
    onDotClick,
    onPrev,
    onNext,
  };
}

function CarouselNavButton({
  onClick,
  disabled,
  children,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-light bg-bg-card text-text-primary transition-colors",
        "hover:bg-bg-secondary disabled:pointer-events-none disabled:opacity-40"
      )}
    >
      {children}
    </button>
  );
}

function DotButton({
  selected = false,
  label,
  onClick,
  reducedMotion,
}: {
  selected?: boolean;
  label: string;
  onClick: () => void;
  reducedMotion: boolean;
}) {
  const transition = reducedMotion ? { duration: 0 } : springTransition;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout={!reducedMotion}
      initial={false}
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex cursor-pointer select-none items-center justify-center overflow-hidden rounded-full border-none text-xs font-medium",
        selected ? "bg-line-green text-white" : "bg-bg-tertiary text-text-tertiary"
      )}
      animate={{
        width: selected ? 72 : 12,
        height: selected ? 28 : 12,
      }}
      transition={transition}
    >
      <motion.span
        layout={!reducedMotion}
        initial={false}
        className="block whitespace-nowrap px-2.5 py-0.5"
        animate={{
          opacity: selected ? 1 : 0,
          scale: selected ? 1 : 0,
          filter: selected ? "blur(0px)" : "blur(4px)",
        }}
        transition={transition}
      >
        {label}
      </motion.span>
    </motion.button>
  );
}

export function MotionCarousel({ slides, options, className }: MotionCarouselProps) {
  const reducedMotion = useReducedMotion();
  const [emblaRef, emblaApi] = useEmblaCarousel(options);
  const {
    selectedIndex,
    scrollSnaps,
    prevDisabled,
    nextDisabled,
    onDotClick,
    onPrev,
    onNext,
  } = useEmblaControls(emblaApi);

  const slideTransition = reducedMotion ? { duration: 0 } : springTransition;

  return (
    <div
      className={cn(
        "w-full space-y-5",
        "[--slide-height:14rem] sm:[--slide-height:15rem] md:[--slide-height:16rem]",
        "[--slide-spacing:1rem] [--slide-size:88%] sm:[--slide-size:72%] md:[--slide-size:58%]",
        className
      )}
    >
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex touch-pan-y touch-pinch-zoom">
          {slides.map((slide, index) => {
            const isActive = index === selectedIndex;

            return (
              <motion.div
                key={slide.id}
                className="mr-[var(--slide-spacing)] flex h-[var(--slide-height)] min-w-0 flex-none basis-[var(--slide-size)]"
              >
                <motion.div
                  className="flex size-full min-w-0"
                  initial={false}
                  animate={{ scale: isActive ? 1 : 0.92, opacity: isActive ? 1 : 0.72 }}
                  transition={slideTransition}
                >
                  {slide.content}
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <CarouselNavButton onClick={onPrev} disabled={prevDisabled} label="สไลด์ก่อนหน้า">
          <ChevronLeft className="h-5 w-5" />
        </CarouselNavButton>

        <div
          className="flex flex-1 flex-wrap items-center justify-center gap-2"
          role="tablist"
          aria-label="เลือกฟีเจอร์"
        >
          {scrollSnaps.map((_, index) => (
            <DotButton
              key={slides[index]?.id ?? index}
              label={slides[index]?.label ?? `สไลด์ ${index + 1}`}
              selected={index === selectedIndex}
              onClick={() => onDotClick(index)}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>

        <CarouselNavButton onClick={onNext} disabled={nextDisabled} label="สไลด์ถัดไป">
          <ChevronRight className="h-5 w-5" />
        </CarouselNavButton>
      </div>
    </div>
  );
}
