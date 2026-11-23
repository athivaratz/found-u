import { turnstileHeader } from "@/lib/turnstile";

// Same-origin calls to the PHP API. The session lives in an HttpOnly cookie.
// This file never reads or stores that secret. Unsafe methods copy the
// readable CSRF cookie into X-CSRF-Token. Cloudflare's custom rule looks
// for X-Requested-With: foundu, so every request sends it.

export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;
  retryAfterMs?: number;
  payload: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    payload: Record<string, unknown>,
    field?: string,
    retryAfterMs?: number
  ) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
    this.field = field;
    this.retryAfterMs = retryAfterMs;
  }
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = decodeURIComponent(part.slice(0, eq));
    if (key === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

export function csrfToken(): string | null {
  return readCookie("foundu_csrf") ?? readCookie("__Host-foundu-csrf");
}

// Pages that still call fetch() directly (vision, NER, match, AI keys)
// need the same CSRF header and X-Requested-With as apiFetch. This does
// not retry. A 429 from quota should show immediately.
export function phpFetchHeaders(method = "GET"): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "foundu",
    ...turnstileHeader(),
  };
  const verb = method.toUpperCase();
  if (verb !== "GET" && verb !== "HEAD" && verb !== "OPTIONS") {
    headers["Content-Type"] = "application/json";
    const token = csrfToken();
    if (token) headers["X-CSRF-Token"] = token;
  }
  return headers;
}

export function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 60_000);
    }
    const when = Date.parse(retryAfter);
    if (!Number.isNaN(when)) {
      return Math.min(Math.max(0, when - Date.now()), 60_000);
    }
  }
  const base = Math.min(8_000, 250 * 2 ** attempt);
  const jitter = Math.random() * base * 0.3;
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type ApiInit = Omit<RequestInit, "body"> & {
  json?: unknown;
  body?: BodyInit | null;
};

function buildHeaders(method: string, init: ApiInit): Headers {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Requested-With", "foundu");
  const turnstile = turnstileHeader();
  if (turnstile["X-Turnstile-Token"]) {
    headers.set("X-Turnstile-Token", turnstile["X-Turnstile-Token"]);
  }
  if (init.json !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (UNSAFE.has(method)) {
    const token = csrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }
  return headers;
}

// Retries only 429, up to four extra attempts, and prefers Retry-After.
export async function apiRequest(path: string, init: ApiInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = buildHeaders(method, init);
  const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;

  let attempt = 0;
  for (;;) {
    const response = await fetch(path, {
      ...init,
      method,
      headers,
      body,
      credentials: "include",
    });
    if (response.status !== 429 || attempt >= 4) return response;
    const wait = retryDelayMs(attempt, response.headers.get("Retry-After"));
    attempt += 1;
    await response.arrayBuffer().catch(() => undefined);
    await sleep(wait);
  }
}

export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const response = await apiRequest(path, init);
  if (response.status === 204 || response.status === 304) {
    return undefined as T;
  }
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      payload = { error: text };
    }
  }
  if (!response.ok) {
    const code = typeof payload.error === "string" ? payload.error : "request_failed";
    const field = typeof payload.field === "string" ? payload.field : undefined;
    const retryAfterMs =
      typeof payload.retryAfterMs === "number" ? payload.retryAfterMs : undefined;
    throw new ApiError(response.status, code, payload, field, retryAfterMs);
  }
  return payload as T;
}
