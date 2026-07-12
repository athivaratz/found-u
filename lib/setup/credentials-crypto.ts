import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_SALT = "found-u-setup-secrets-v1";

function getEncryptionKey(): Buffer {
  const secret = process.env.SETUP_SECRETS_KEY?.trim();
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SETUP_SECRETS_KEY is required in production");
  }
  const material =
    secret || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!material) {
    throw new Error("Missing encryption key material for setup secrets");
  }
  return scryptSync(material, KEY_SALT, 32);
}

export function encryptSecret(plain: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(cipherText: string): string {
  const buffer = Buffer.from(cipherText, "base64");
  if (buffer.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted secret format");
  }
  const iv = buffer.subarray(0, IV_LENGTH);
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + TAG_LENGTH);
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function tryDecryptSecret(cipherText: string | undefined): string | undefined {
  if (!cipherText) return undefined;
  try {
    return decryptSecret(cipherText);
  } catch {
    return undefined;
  }
}
