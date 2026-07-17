import {
  getPublicHeroImages,
  getPublicLandingSettings,
} from "@/lib/landing-public-data";
import { listHelpPages } from "@/lib/help/data";
import { LandingPageClient } from "@/components/landing/landing-page-client";

export async function LandingPage() {
  const [settings, heroImages, mobileHeroImages, helpPages] = await Promise.all([
    getPublicLandingSettings(),
    getPublicHeroImages("img"),
    getPublicHeroImages("img/mobile_responsive"),
    listHelpPages(),
  ]);

  return (
    <LandingPageClient
      comingSoon={settings.comingSoonEnabled}
      comingSoonMessage={settings.comingSoonMessage}
      heroImages={heroImages}
      mobileHeroImages={mobileHeroImages}
      helpLinks={helpPages.map((page) => ({
        href: `/help/${page.slug}`,
        label: page.title,
      }))}
    />
  );
}
