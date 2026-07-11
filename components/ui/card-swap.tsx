"use client";

import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import gsap from "gsap";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import styles from "./card-swap.module.css";

type EasingType = "smooth" | "linear";

type SwapConfig = {
  ease: string;
  durDrop: number;
  durMove: number;
  durReturn: number;
  promoteOverlap: number;
  returnDelay: number;
};

type CardSwapProps = {
  width?: number | string;
  height?: number | string;
  /** width ÷ height — e.g. 97/70 */
  aspectRatio?: number;
  /** ความกว้างอ้างอิงสำหรับสเกล cardDistance / verticalDistance */
  baseWidth?: number;
  cardDistance?: number;
  verticalDistance?: number;
  delay?: number;
  pauseOnHover?: boolean;
  onCardClick?: (idx: number) => void;
  skewAmount?: number;
  easing?: EasingType;
  children: React.ReactNode;
};

function buildDimensionStyle(
  width: number | string,
  height: number | string | undefined,
  aspectRatio: number | undefined
): React.CSSProperties {
  if (aspectRatio != null) {
    return { width, aspectRatio };
  }
  return { width, height };
}

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  customClass?: string;
};

const makeSlot = (i: number, distX: number, distY: number, total: number) => ({
  x: i * distX,
  y: -i * distY,
  z: -i * distX * 1.5,
  zIndex: total - i,
});

const placeNow = (
  el: HTMLDivElement,
  slot: { x: number; y: number; z: number; zIndex: number },
  skew: number
) =>
  gsap.set(el, {
    x: slot.x,
    y: slot.y,
    z: slot.z,
    xPercent: -50,
    yPercent: -50,
    skewY: skew,
    transformOrigin: "center center",
    zIndex: slot.zIndex,
    force3D: true,
  });

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ customClass, className, ...rest }, ref) => (
    <div
      ref={ref}
      {...rest}
      className={[styles.card, customClass ?? "", className ?? ""].join(" ").trim()}
    />
  )
);
Card.displayName = "Card";

export default function CardSwap({
  width = 500,
  height = 400,
  aspectRatio,
  baseWidth = 680,
  cardDistance = 60,
  verticalDistance = 70,
  delay = 5000,
  pauseOnHover = false,
  onCardClick,
  skewAmount = 6,
  easing = "smooth",
  children,
}: CardSwapProps) {
  const reduceMotion = useReducedMotion();
  const dimensionStyle = useMemo(
    () => buildDimensionStyle(width, height, aspectRatio),
    [width, height, aspectRatio]
  );
  const [layoutScale, setLayoutScale] = useState(1);
  const config: SwapConfig =
    easing === "linear"
      ? {
          ease: "power1.inOut",
          durDrop: 0.8,
          durMove: 0.8,
          durReturn: 0.8,
          promoteOverlap: 0.45,
          returnDelay: 0.2,
        }
      : {
          ease: "power2.out",
          durDrop: 0.55,
          durMove: 0.5,
          durReturn: 0.55,
          promoteOverlap: 0.5,
          returnDelay: 0.1,
        };

  const childArr = useMemo(() => Children.toArray(children), [children]);
  const refs = useMemo(
    () => childArr.map(() => React.createRef<HTMLDivElement>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [childArr.length]
  );

  const order = useRef(Array.from({ length: childArr.length }, (_, i) => i));
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const container = useRef<HTMLDivElement>(null);

  const scaledCardDistance = cardDistance * layoutScale;
  const scaledVerticalDistance = verticalDistance * layoutScale;

  useEffect(() => {
    const node = container.current;
    if (!node) return;

    const updateScale = () => {
      const w = node.getBoundingClientRect().width;
      if (w > 0) setLayoutScale(w / baseWidth);
    };

    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(node);
    return () => ro.disconnect();
  }, [baseWidth]);

  useEffect(() => {
    if (refs.length < 2) return;

    let disposed = false;
    let swapTimer: ReturnType<typeof setTimeout> | undefined;
    let paused = false;

    const placeAll = () => {
      const total = refs.length;
      refs.forEach((r, i) => {
        if (r.current) {
          placeNow(
            r.current,
            makeSlot(i, scaledCardDistance, scaledVerticalDistance, total),
            skewAmount
          );
        }
      });
    };

    const scheduleNext = () => {
      if (disposed || paused) return;
      swapTimer = setTimeout(runSwap, delay);
    };

    const runSwap = () => {
      if (disposed || paused || order.current.length < 2) return;

      const [front, ...rest] = order.current;
      const elFront = refs[front].current;
      if (!elFront) {
        scheduleNext();
        return;
      }

      tlRef.current?.kill();

      const tl = gsap.timeline({
        onComplete: () => {
          if (!disposed && !paused) scheduleNext();
        },
      });
      tlRef.current = tl;

      tl.to(elFront, {
        y: "+=500",
        duration: config.durDrop,
        ease: config.ease,
      });

      tl.addLabel("promote", `-=${config.durDrop * config.promoteOverlap}`);
      rest.forEach((idx, i) => {
        const el = refs[idx].current;
        if (!el) return;
        const slot = makeSlot(i, scaledCardDistance, scaledVerticalDistance, refs.length);
        tl.set(el, { zIndex: slot.zIndex }, "promote");
        tl.to(
          el,
          {
            x: slot.x,
            y: slot.y,
            z: slot.z,
            duration: config.durMove,
            ease: config.ease,
          },
          `promote+=${i * 0.15}`
        );
      });

      const backSlot = makeSlot(
        refs.length - 1,
        scaledCardDistance,
        scaledVerticalDistance,
        refs.length
      );
      tl.addLabel("return", `promote+=${config.durMove * config.returnDelay}`);
      tl.call(
        () => {
          gsap.set(elFront, { zIndex: backSlot.zIndex });
        },
        undefined,
        "return"
      );
      tl.to(
        elFront,
        {
          x: backSlot.x,
          y: backSlot.y,
          z: backSlot.z,
          duration: config.durReturn,
          ease: config.ease,
        },
        "return"
      );

      tl.call(() => {
        order.current = [...rest, front];
      });
    };

    const waitForRefs = (onReady: () => void) => {
      if (disposed) return;
      if (refs.every((r) => r.current)) {
        onReady();
        return;
      }
      requestAnimationFrame(() => waitForRefs(onReady));
    };

    waitForRefs(() => {
      placeAll();
      if (reduceMotion) return;
      runSwap();
    });

    const node = container.current;
    if (pauseOnHover && node) {
      const pause = () => {
        paused = true;
        if (swapTimer) clearTimeout(swapTimer);
        tlRef.current?.pause();
      };
      const resume = () => {
        paused = false;
        tlRef.current?.play();
        if (!tlRef.current || tlRef.current.progress() >= 1) scheduleNext();
      };
      node.addEventListener("mouseenter", pause);
      node.addEventListener("mouseleave", resume);

      return () => {
        disposed = true;
        paused = true;
        node.removeEventListener("mouseenter", pause);
        node.removeEventListener("mouseleave", resume);
        if (swapTimer) clearTimeout(swapTimer);
        tlRef.current?.kill();
      };
    }

    return () => {
      disposed = true;
      if (swapTimer) clearTimeout(swapTimer);
      tlRef.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scaledCardDistance,
    scaledVerticalDistance,
    delay,
    pauseOnHover,
    skewAmount,
    easing,
    refs.length,
    reduceMotion,
  ]);

  const rendered = childArr.map((child, i) =>
    isValidElement(child)
      ? cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          key: i,
          ref: refs[i],
          style: { ...dimensionStyle, ...((child.props as CardProps).style ?? {}) },
          onClick: (e: React.MouseEvent<HTMLDivElement>) => {
            (child.props as CardProps).onClick?.(e);
            onCardClick?.(i);
          },
        })
      : child
  );

  return (
    <div
      ref={container}
      className={styles.container}
      style={dimensionStyle}
      aria-label="ภาพตัวอย่างฟีเจอร์"
    >
      {rendered}
    </div>
  );
}
