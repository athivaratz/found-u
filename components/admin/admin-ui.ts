/** Shared admin UI primitives — Items, Matching, and siblings stay in sync. */

export const adminFocusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

export const adminCtaClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-line-green-cta px-5 text-sm font-medium text-white active:bg-line-green-cta-hover motion-safe:transition-colors motion-safe:duration-200 touch-manipulation";

export const adminSecondaryCtaClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-bg-tertiary px-5 text-sm font-medium text-text-primary active:bg-border-light motion-safe:transition-colors motion-safe:duration-200 touch-manipulation";

/** Page shell padding aligned across admin tools (safe areas + mobile-first rhythm). */
export const adminPageShellClass =
  "space-y-4 py-4 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:space-y-5 sm:py-5 sm:pl-[max(1rem,env(safe-area-inset-left,0px))] sm:pr-[max(1rem,env(safe-area-inset-right,0px))] lg:space-y-6 lg:p-6 lg:pl-[max(1.5rem,env(safe-area-inset-left,0px))] lg:pr-[max(1.5rem,env(safe-area-inset-right,0px))] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]";
