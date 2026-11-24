export type PublicHeroImage = {
  fileName: string;
  label: string;
  url: string;
  width: number;
  height: number;
};

export type PublicLandingSettings = {
  comingSoonEnabled: boolean;
  comingSoonMessage: string;
};

export function normalizeComingSoonMessage(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
