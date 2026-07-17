"use client";

import { useEffect, useRef } from "react";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";
import "video.js/dist/video-js.css";
import type { VideoProvider } from "@/lib/blog/video-embed";
import { cn } from "@/lib/utils";

type ArticleVideoProps = {
  provider: VideoProvider;
  src: string;
  title?: string;
  className?: string;
};

function EmbedFrame({
  src,
  title,
  className,
}: {
  src: string;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border-light bg-black",
        className
      )}
    >
      <div className="relative aspect-video w-full">
        <iframe
          src={src}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>
  );
}

function VideoJsPlayer({
  src,
  title,
  className,
}: {
  src: string;
  title: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const isHls = src.toLowerCase().includes(".m3u8");
    const player = videojs(el, {
      controls: true,
      responsive: true,
      fluid: true,
      preload: "metadata",
      sources: [
        {
          src,
          type: isHls ? "application/x-mpegURL" : "video/mp4",
        },
      ],
    });
    playerRef.current = player;

    return () => {
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, [src]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border-light bg-black",
        className
      )}
    >
      <div data-vjs-player>
        <video
          ref={videoRef}
          className="video-js vjs-big-play-centered vjs-fluid"
          playsInline
          title={title}
        />
      </div>
    </div>
  );
}

export function ArticleVideo({
  provider,
  src,
  title = "Video",
  className,
}: ArticleVideoProps) {
  if (!src) return null;

  if (provider === "youtube" || provider === "bunny") {
    return <EmbedFrame src={src} title={title} className={className} />;
  }

  return <VideoJsPlayer src={src} title={title} className={className} />;
}
