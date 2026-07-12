/** Shared landing page styles — aligned with DESIGN.md type ramp and globals tokens */

export const primaryCtaClass =
  "rounded-full bg-line-green-cta text-white transition-[transform,colors] duration-150 hover:bg-line-green-cta-hover active:scale-[0.98] motion-reduce:active:scale-100";

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 focus-visible:ring-offset-2";

export const secondaryCtaClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-border-light bg-bg-card px-7 py-3.5 text-base font-medium text-text-primary transition-[transform,colors] duration-150 hover:bg-bg-tertiary active:scale-[0.98] motion-reduce:active:scale-100";

/** DESIGN.md display: clamp(1.75rem, 5vw, 2.25rem) */
export const heroHeadingClass =
  "text-balance text-[length:clamp(1.75rem,5vw,2.25rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-text-primary";

/** DESIGN.md headline: 1.25rem / 600 */
export const sectionHeadingClass =
  "text-balance text-xl font-semibold leading-[1.3] text-text-primary";

export const shell = "page-padding mx-auto w-full max-w-5xl";
export const heroShell = "page-padding relative z-20 mx-auto w-full max-w-6xl";
export const sectionY = "py-16 md:py-20";
export const sectionYHero =
  "pt-12 pb-20 md:pt-16 md:pb-28 landing-hero-compact max-md:landscape:py-8";
export const sectionYCta = "py-12 md:py-16";
export const sectionIntro = "space-y-3";
export const sectionBody = "mt-12 md:mt-14";
export const proseWidth = "max-w-[65ch]";
export const deferredSection = "landing-deferred-section";
