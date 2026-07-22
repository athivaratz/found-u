"use client";

import { useEffect } from "react";

const VIEWPORT_CONTENT =
  "width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover";

/**
 * Samsung / some Android WebViews still shrink the whole page when they
 * treat the layout as desktop-width (classic ~980px + scale-to-fit). That
 * makes rem UI look tiny and leaves a huge empty band above the bottom nav.
 *
 * Re-assert a device-width viewport and clip horizontal overflow that can
 * trigger shrink-to-fit after first paint / orientation changes.
 */
export function AndroidViewportGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!/Android/i.test(navigator.userAgent)) return;

    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;

    const repair = () => {
      meta.setAttribute("content", VIEWPORT_CONTENT);

      const root = document.documentElement;
      const body = document.body;
      root.style.maxWidth = "100%";
      body.style.maxWidth = "100%";
      root.style.overflowX = "clip";
      body.style.overflowX = "clip";

      const vv = window.visualViewport;
      const zoomedOut = vv != null && vv.scale < 0.98;
      const widerThanScreen =
        root.scrollWidth > Math.ceil(window.innerWidth) + 2;

      if (zoomedOut || widerThanScreen) {
        // Meta refresh alone is enough on most WebViews; scroll nudge helps
        // a few Samsung Internet builds recompute layout.
        window.scrollTo(0, 0);
      }
    };

    repair();
    const onOrient = () => {
      // Wait for the new visual viewport before repairing.
      window.setTimeout(repair, 150);
    };
    window.addEventListener("orientationchange", onOrient);
    vvListen(repair);

    return () => {
      window.removeEventListener("orientationchange", onOrient);
      vvUnlisten(repair);
    };
  }, []);

  return null;
}

function vvListen(handler: () => void) {
  window.visualViewport?.addEventListener("resize", handler);
  window.visualViewport?.addEventListener("scroll", handler);
}

function vvUnlisten(handler: () => void) {
  window.visualViewport?.removeEventListener("resize", handler);
  window.visualViewport?.removeEventListener("scroll", handler);
}
