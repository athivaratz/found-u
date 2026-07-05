import { TRACKING_CODE_PREFIX_RE } from "./trgm-config";

export function sanitizeSearchQuery(value: string): string {
  return value.replace(/,/g, " ").trim();
}

export function normalizeSearchQuery(value: string): string {
  return sanitizeSearchQuery(value);
}

export function escapeIlike(value: string): string {
  return sanitizeSearchQuery(value).replace(/[%_\\]/g, "\\$&");
}

export function isTrackingCodeQuery(value: string): boolean {
  return TRACKING_CODE_PREFIX_RE.test(value.trim());
}
