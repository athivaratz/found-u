import { randomBytes } from "crypto";

const challengeStore = new Map<
  string,
  { challenge: string; studentId?: string; uid?: string; discoverable?: boolean; expiresAt: number }
>();

export function storeChallenge(
  key: string,
  data: { challenge: string; studentId?: string; uid?: string; discoverable?: boolean }
): void {
  challengeStore.set(key, { ...data, expiresAt: Date.now() + 5 * 60 * 1000 });
}

export function consumeChallenge(
  key: string
): { challenge: string; studentId?: string; uid?: string; discoverable?: boolean } | null {
  const entry = challengeStore.get(key);
  challengeStore.delete(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return {
    challenge: entry.challenge,
    studentId: entry.studentId,
    uid: entry.uid,
    discoverable: entry.discoverable,
  };
}

export function newChallengeKey(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}
