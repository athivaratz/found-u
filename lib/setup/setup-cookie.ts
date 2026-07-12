import { SETUP_OK_COOKIE_MAX_AGE } from "@/lib/setup/constants";

function getCookieSecret(): string {
  return (
    process.env.SETUP_SECRETS_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toBase64Url(new Uint8Array(signature));
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function signPayload(payload: string): Promise<string> {
  const secret = getCookieSecret();
  if (!secret) return "";
  const sig = await hmacSha256(secret, payload);
  return `${payload}.${sig}`;
}

async function verifySignedValue(
  value: string | undefined,
  prefix: string
): Promise<boolean> {
  if (!value || !getCookieSecret()) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!payload.startsWith(`${prefix}:`)) return false;

  const exp = Number.parseInt(payload.split(":")[1] ?? "0", 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const expected = await hmacSha256(getCookieSecret(), payload);
  try {
    return timingSafeEqualStrings(sig, expected);
  } catch {
    return false;
  }
}

export async function signSetupOkCookie(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SETUP_OK_COOKIE_MAX_AGE;
  return signPayload(`ok:${exp}`);
}

export async function verifySetupOkCookie(value: string | undefined): Promise<boolean> {
  return verifySignedValue(value, "ok");
}

export async function signSetupActionCookie(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  return signPayload(`setup:${exp}`);
}

export async function verifySetupActionCookie(value: string | undefined): Promise<boolean> {
  return verifySignedValue(value, "setup");
}
