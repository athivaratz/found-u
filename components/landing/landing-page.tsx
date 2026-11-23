"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { listHelpPages } from "@/lib/help/data";
import {
  normalizeComingSoonMessage,
  type PublicHeroImage,
} from "@/lib/landing-public-data";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import { LandingPageClient } from "@/components/landing/landing-page-client";

const fallbackMessage = DEFAULT_APP_SETTINGS.comingSoonMessage ?? "พบกันเร็วๆนี้";

export function LandingPage() {
  const [comingSoon, setComingSoon] = useState(false);
  const [comingSoonMessage, setComingSoonMessage] = useState(fallbackMessage);
  const [heroImages, setHeroImages] = useState<PublicHeroImage[]>([]);
  const [mobileHeroImages, setMobileHeroImages] = useState<PublicHeroImage[]>([]);
  const [helpLinks, setHelpLinks] = useState<{ href: string; label: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await apiFetch<{
          comingSoonEnabled?: boolean;
          comingSoonMessage?: string;
        }>("/api/public-settings");
        if (cancelled) return;
        setComingSoon(Boolean(settings.comingSoonEnabled));
        setComingSoonMessage(
          normalizeComingSoonMessage(settings.comingSoonMessage, fallbackMessage)
        );
      } catch {
        // The landing page still renders with the built-in copy.
      }
      try {
        const [desk, mobile] = await Promise.all([
          apiFetch<{ images?: PublicHeroImage[] }>("/api/public-images?folder=img"),
          apiFetch<{ images?: PublicHeroImage[] }>(
            "/api/public-images?folder=" + encodeURIComponent("img/mobile_responsive")
          ),
        ]);
        if (cancelled) return;
        setHeroImages(desk.images ?? []);
        setMobileHeroImages(mobile.images ?? []);
      } catch {
        // The client already has a fallback hero image.
      }
      try {
        const pages = await listHelpPages();
        if (cancelled) return;
        setHelpLinks(
          pages.map((page) => ({ href: `/help/${page.slug}`, label: page.title }))
        );
      } catch {
        // Footer help links stay empty until the API answers.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <LandingPageClient
      comingSoon={comingSoon}
      comingSoonMessage={comingSoonMessage}
      heroImages={heroImages}
      mobileHeroImages={mobileHeroImages}
      helpLinks={helpLinks}
    />
  );
}
