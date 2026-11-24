"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: { sitekey: string; theme?: "auto" | "light" | "dark" }
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// Managed widget. An empty site key (local docker without Turnstile) renders nothing.
export function TurnstileWidget({ className }: { className?: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ turnstileSiteKey?: string }>("/api/public-config")
      .then((body) => {
        if (!cancelled) setSiteKey((body.turnstileSiteKey ?? "").trim());
      })
      .catch(() => {
        if (!cancelled) setSiteKey("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = holder.current;
    if (!siteKey || !el) return;
    let widgetId = "";
    let cancelled = false;

    const render = () => {
      if (cancelled || !window.turnstile || !holder.current) return;
      widgetId = window.turnstile.render(holder.current, {
        sitekey: siteKey,
        theme: "auto",
      });
    };

    if (window.turnstile) {
      render();
    } else {
      let script = document.querySelector<HTMLScriptElement>('script[data-turnstile="1"]');
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT;
        script.async = true;
        script.dataset.turnstile = "1";
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
      if (window.turnstile) render();
    }

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <div className={className}>
      <div ref={holder} />
    </div>
  );
}
