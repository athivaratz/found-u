import {
  getPublicHeroImages,
  getPublicLandingSettings,
} from "@/lib/landing-public-data";
import { LandingPageClient } from "@/components/landing/landing-page-client";

export async function LandingPage() {
  const [settings, heroImages, mobileHeroImages] = await Promise.all([
    getPublicLandingSettings(),
    getPublicHeroImages("img"),
    getPublicHeroImages("img/mobile_responsive"),
  ]);

  return (
    <LandingPageClient
      comingSoon={settings.comingSoonEnabled}
      comingSoonMessage={settings.comingSoonMessage}
      heroImages={heroImages}
      mobileHeroImages={mobileHeroImages}
    />
  );
}
