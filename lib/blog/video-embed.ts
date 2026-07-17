export type VideoProvider = "youtube" | "bunny" | "file";

export type ParsedVideoEmbed = {
  provider: VideoProvider;
  /** Canonical playable URL or embed src */
  src: string;
  /** Display / accessibility title */
  title: string;
  /** Provider-specific id when known */
  videoId?: string;
};

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Extract first iframe src from pasted HTML embed code */
export function extractIframeSrc(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

export function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }
    if (host.includes("youtube")) {
      if (u.pathname.startsWith("/embed/")) {
        return u.pathname.split("/")[2] || null;
      }
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/")[2] || null;
      }
      if (u.pathname.startsWith("/live/")) {
        return u.pathname.split("/")[2] || null;
      }
      return u.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Bunny Stream iframe embeds:
 * https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}
 * https://iframe.mediadelivery.net/play/{libraryId}/{videoId}
 */
export function isBunnyEmbedUrl(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return (
    host === "iframe.mediadelivery.net" ||
    host === "player.mediadelivery.net" ||
    host.endsWith(".b-cdn.net") && url.includes("/embed")
  );
}

export function toBunnyEmbedSrc(url: string): string {
  try {
    const u = new URL(url);
    // Normalize play → embed
    if (u.pathname.startsWith("/play/")) {
      u.pathname = u.pathname.replace(/^\/play\//, "/embed/");
    }
    // Prefer privacy-friendly defaults for embeds in articles
    if (!u.searchParams.has("autoplay")) u.searchParams.set("autoplay", "false");
    if (!u.searchParams.has("preload")) u.searchParams.set("preload", "true");
    return u.toString();
  } catch {
    return url;
  }
}

export function toYoutubeEmbedSrc(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

function isDirectMediaUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return (
      path.endsWith(".mp4") ||
      path.endsWith(".webm") ||
      path.endsWith(".m3u8") ||
      path.endsWith(".ogg")
    );
  } catch {
    return false;
  }
}

/**
 * Parse a pasted URL or full iframe embed HTML into a normalized video embed.
 */
export function parseVideoEmbedInput(input: string): ParsedVideoEmbed | null {
  const raw = input.trim();
  if (!raw) return null;

  const fromIframe = extractIframeSrc(raw);
  const url = fromIframe || raw;

  // YouTube
  const ytId = extractYoutubeId(url);
  if (ytId) {
    return {
      provider: "youtube",
      src: toYoutubeEmbedSrc(ytId),
      videoId: ytId,
      title: "YouTube video",
    };
  }

  const host = hostnameOf(url);
  if (host && YOUTUBE_HOSTS.has(host)) {
    // Fallback if ID extraction failed but host matches
    return null;
  }

  // Bunny.net Stream iframe / player
  if (isBunnyEmbedUrl(url) || host === "iframe.mediadelivery.net") {
    return {
      provider: "bunny",
      src: toBunnyEmbedSrc(url),
      title: "Bunny Stream video",
    };
  }

  // Direct file / HLS (Video.js)
  if (isDirectMediaUrl(url)) {
    return {
      provider: "file",
      src: url,
      title: "Video",
    };
  }

  // Bunny CDN progressive / playlist without /embed in path
  if (host?.endsWith(".b-cdn.net") || host?.endsWith(".mediadelivery.net")) {
    if (url.includes("/play/") || url.includes("/embed/")) {
      return {
        provider: "bunny",
        src: toBunnyEmbedSrc(url),
        title: "Bunny Stream video",
      };
    }
    return {
      provider: "file",
      src: url,
      title: "Bunny video",
    };
  }

  return null;
}
