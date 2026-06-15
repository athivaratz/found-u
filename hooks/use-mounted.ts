"use client";

import { useEffect, useState } from "react";

/** True after the first client paint — use before reading browser-only state (theme, localStorage). */
export function useMounted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
