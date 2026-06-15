"use client";

import { useEffect } from "react";
import { auth } from "@/lib/auth";
import { deferAfterFirstPaint, subscribeToBfcacheRestore } from "@/lib/bfcache";

export function BfcacheRestoreHandler() {
  useEffect(() => {
    return subscribeToBfcacheRestore(() => {
      deferAfterFirstPaint(() => {
        void auth.refreshNetwork();
      });
    });
  }, []);

  return null;
}
