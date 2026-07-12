/** Recursively omit object keys whose values are `undefined`. */
export type StripUndefined<T> = T extends undefined
  ? undefined
  : T extends Date
    ? T
    : T extends readonly (infer U)[]
      ? StripUndefined<U>[]
      : T extends object
        ? {
            [K in keyof T as undefined extends T[K] ? never : K]: StripUndefined<
              Exclude<T[K], undefined>
            >;
          }
        : T;

/** Remove undefined values so Firestore addDoc/setDoc does not throw. */
export function stripUndefined<T>(value: T): StripUndefined<T> {
  if (value === undefined) {
    return value as StripUndefined<T>;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as StripUndefined<T>;
  }

  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested !== undefined) {
        result[key] = stripUndefined(nested);
      }
    }
    return result as StripUndefined<T>;
  }

  return value as StripUndefined<T>;
}
