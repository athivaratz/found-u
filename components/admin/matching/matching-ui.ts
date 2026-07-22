/** Matching-specific types + re-exports of shared admin primitives. */

export type MatchBusyAction = "confirm" | "reject" | null;

export {
  adminFocusRingClass as matchFocusRingClass,
  adminCtaClass as matchCtaClass,
  adminSecondaryCtaClass as matchSecondaryCtaClass,
} from "@/components/admin/admin-ui";
