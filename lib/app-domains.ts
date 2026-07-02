import type { NextRequest } from "next/server";

/** โดเมนหลักที่ให้บริการแอป (ทุกโดเมนใช้งานได้โดยไม่ redirect ข้ามโดเมน) */
export const PRIMARY_APP_DOMAINS = [
  "foundu.forum",
  "foundu.bodin2.ac.th",
] as const;

export type PrimaryAppDomain = (typeof PRIMARY_APP_DOMAINS)[number];

export const DEFAULT_PRIMARY_DOMAIN: PrimaryAppDomain = PRIMARY_APP_DOMAINS[0];

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
}

export function isPrimaryAppDomain(host: string): boolean {
  const normalized = normalizeHost(host);
  return (PRIMARY_APP_DOMAINS as readonly string[]).includes(normalized);
}

export function getRequestHost(request?: NextRequest): string | null {
  const forwardedHost = request?.headers.get("x-forwarded-host");
  const host = request?.headers.get("host");
  const requestHost = forwardedHost || host;
  return requestHost ? normalizeHost(requestHost) : null;
}

function getHostFromEnvUrl(envValue: string): string | null {
  try {
    const host = envValue.startsWith("http") ? new URL(envValue).hostname : envValue;
    return normalizeHost(host);
  } catch {
    return null;
  }
}

export function getPrimaryDomainFromEnv(): PrimaryAppDomain {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) {
    const host = getHostFromEnvUrl(envUrl);
    if (host && isPrimaryAppDomain(host)) {
      return host as PrimaryAppDomain;
    }
  }
  return DEFAULT_PRIMARY_DOMAIN;
}

export function getDefaultAppUrl(): string {
  return `https://${getPrimaryDomainFromEnv()}`;
}

/** Origin จาก request ถ้าเป็นโดเมนหลักที่รองรับ */
export function getOriginFromRequest(request?: NextRequest): string | null {
  const requestHost = getRequestHost(request);
  if (requestHost && isPrimaryAppDomain(requestHost)) {
    const proto = request?.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${requestHost}`;
  }
  return null;
}

/** Relying Party ID สำหรับ WebAuthn จาก request */
export function getRpIdFromRequest(request?: NextRequest): string | null {
  const requestHost = getRequestHost(request);
  if (requestHost && isPrimaryAppDomain(requestHost)) {
    return requestHost;
  }
  return null;
}

export function getAppOrigin(request?: NextRequest): string {
  const fromRequest = getOriginFromRequest(request);
  if (fromRequest) return fromRequest;

  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function getAppRpId(request?: NextRequest): string {
  const fromRequest = getRpIdFromRequest(request);
  if (fromRequest) return fromRequest;

  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (envUrl) {
    const host = getHostFromEnvUrl(envUrl);
    if (host) return host;
  }

  return "localhost";
}
