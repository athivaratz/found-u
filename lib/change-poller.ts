// One poller for the whole tab. Components subscribe to table names.
// GET /api/changes returns stamps and an ETag. 304 means nothing moved.
// The timer stops while the tab is hidden and backs off when the request fails.

import { apiRequest } from "@/lib/api-client";

type Listener = {
  tables: string[];
  intervalMs: number;
  onChange: () => void;
};

const listeners = new Set<Listener>();
let etag: string | null = null;
let stamps: Record<string, string> = {};
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let failures = 0;
let visibilityBound = false;

const DEFAULT_MS = 25_000;
const LOG_TABLES = new Set(["activity_logs", "error_logs"]);

export function subscribeChanges(
  tables: string[],
  onChange: () => void,
  intervalMs = DEFAULT_MS
): () => void {
  const listener: Listener = { tables, intervalMs, onChange };
  listeners.add(listener);
  bindVisibility();
  onChange();
  schedule(0);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

export function intervalForTables(tables: string[]): number {
  return tables.some((name) => LOG_TABLES.has(name)) ? 10_000 : DEFAULT_MS;
}

function bindVisibility() {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule(0);
  });
}

function nextDelay(): number {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return 30_000;
  }
  if (failures > 0) {
    const base = Math.min(60_000, 2_000 * 2 ** (failures - 1));
    return base + Math.random() * base * 0.2;
  }
  let ms = DEFAULT_MS;
  for (const listener of listeners) ms = Math.min(ms, listener.intervalMs);
  return ms;
}

function schedule(ms: number) {
  if (listeners.size === 0) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void poll();
  }, ms);
}

function tableSet(): string[] {
  const names = new Set<string>();
  for (const listener of listeners) {
    for (const name of listener.tables) names.add(name);
  }
  return [...names].slice(0, 20);
}

async function poll() {
  if (inFlight || listeners.size === 0) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    schedule(nextDelay());
    return;
  }
  const tables = tableSet();
  if (tables.length === 0) return;
  inFlight = true;
  try {
    const headers = new Headers();
    if (etag) headers.set("If-None-Match", etag);
    const response = await apiRequest(`/api/changes?tables=${encodeURIComponent(tables.join(","))}`, {
      headers,
    });
    if (response.status === 304) {
      failures = 0;
      await response.arrayBuffer().catch(() => undefined);
      return;
    }
    if (!response.ok) {
      failures += 1;
      await response.arrayBuffer().catch(() => undefined);
      return;
    }
    const nextEtag = response.headers.get("ETag");
    const body = (await response.json()) as { tables?: Record<string, string> };
    const next = body.tables ?? {};
    const changed = new Set<string>();
    for (const name of Object.keys(next)) {
      if (stamps[name] !== next[name]) changed.add(name);
    }
    stamps = next;
    if (nextEtag) etag = nextEtag;
    failures = 0;
    if (changed.size === 0) return;
    for (const listener of listeners) {
      if (listener.tables.some((name) => changed.has(name))) listener.onChange();
    }
  } catch {
    failures += 1;
  } finally {
    inFlight = false;
    schedule(nextDelay());
  }
}
