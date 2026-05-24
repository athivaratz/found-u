/** Shared motion presets — use with LazyMotion + m component */

export const easeOut = [0.22, 1, 0.36, 1] as const;

export const duration = {
  fast: 0.2,
  normal: 0.28,
  slow: 0.36,
} as const;

export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: duration.normal, ease: easeOut },
};

export const slideUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: duration.normal, ease: easeOut },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: duration.normal, ease: easeOut },
};

export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: duration.fast, ease: easeOut },
};

/** Returns transition duration 0 when user prefers reduced motion */
export function motionSafe<T extends { transition?: object }>(variant: T, reduced: boolean): T {
  if (!reduced) return variant;
  return {
    ...variant,
    transition: { duration: 0 },
  };
}
