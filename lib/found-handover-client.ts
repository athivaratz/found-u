let lastSweepAt = 0;
const SWEEP_DEBOUNCE_MS = 30_000;

/** เรียก API หมดอายุรายการที่เลยกำหนด (debounce 30 วินาที) */
export async function triggerFoundHandoverExpirySweep(): Promise<void> {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_DEBOUNCE_MS) return;
  lastSweepAt = now;

  try {
    await fetch("/api/found/expire-overdue", { method: "POST" });
  } catch {
    // ไม่บล็อก UI หาก sweep ล้มเหลว
  }
}
