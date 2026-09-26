const PRIVATE_ITEM_KEYS = [
  "contacts",
  "finderContacts",
  "finder_contacts",
  "userId",
  "user_id",
  "studentId",
  "student_id",
] as const;

type PrivateItemKey = (typeof PRIVATE_ITEM_KEYS)[number];

/** Fields a public match payload must not include. */
export function redactPublicItemFields<T extends object>(
  item: T
): Omit<T, PrivateItemKey> {
  const hidden = new Set<string>(PRIVATE_ITEM_KEYS);
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (!hidden.has(key)) copy[key] = value;
  }
  return copy as Omit<T, PrivateItemKey>;
}
