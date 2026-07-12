import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminEnv } from "@/lib/setup/db-url";
import { getDefaultAppUrl } from "@/lib/app-domains";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";

export const OG_METADATA_CACHE_TAG = "app-og-settings";

interface OgSettings {
  title: string;
  description: string;
  image?: string;
}

function defaultOgSettings(): OgSettings {
  return {
    title: DEFAULT_APP_SETTINGS.ogTitle || "foundu.forum",
    description:
      DEFAULT_APP_SETTINGS.ogDescription || "ระบบแจ้งของหาย-ของเจอ",
  };
}

async function fetchOgSettings(): Promise<OgSettings> {
  if (!hasSupabaseAdminEnv()) {
    return defaultOgSettings();
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("settings")
      .eq("id", "default")
      .maybeSingle();

    const settings = (data?.settings ?? {}) as Record<string, unknown>;

    return {
      title:
        (typeof settings.ogTitle === "string" && settings.ogTitle) ||
        DEFAULT_APP_SETTINGS.ogTitle ||
        "foundu.forum",
      description:
        (typeof settings.ogDescription === "string" && settings.ogDescription) ||
        DEFAULT_APP_SETTINGS.ogDescription ||
        "ระบบแจ้งของหาย-ของเจอ",
      image: typeof settings.ogImage === "string" ? settings.ogImage : undefined,
    };
  } catch (error) {
    console.error("Error fetching OG settings:", error);
    return defaultOgSettings();
  }
}

const getCachedOgSettings = unstable_cache(fetchOgSettings, ["app-og-settings"], {
  revalidate: 60,
  tags: [OG_METADATA_CACHE_TAG],
});

function toAbsoluteImageUrl(image: string | undefined, metadataBase: URL): string | undefined {
  if (!image) return undefined;
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  return new URL(image, metadataBase).toString();
}

export async function buildSiteMetadata(): Promise<Metadata> {
  const og = await getCachedOgSettings();
  const metadataBase = new URL(getDefaultAppUrl());
  const imageUrl = toAbsoluteImageUrl(og.image, metadataBase);
  const images = imageUrl
    ? [{ url: imageUrl, width: 1200, height: 630, alt: og.title }]
    : undefined;

  return {
    title: og.title,
    description: og.description,
    keywords: ["lost and found", "ของหาย", "แจ้งของหาย", "โรงเรียน"],
    authors: [{ name: "scfondue" }],
    icons: {
      icon: [
        { url: "/favicon.ico" },
        { url: "/favicon.svg", type: "image/svg+xml" },
      ],
      apple: "/logo.png",
    },
    metadataBase,
    openGraph: {
      title: og.title,
      description: og.description,
      type: "website",
      siteName: "foundu.forum",
      locale: "th_TH",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: og.title,
      description: og.description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}
