// Leftover server modules from P7–P10 still name a database client.
// They throw if something calls them. The PHP API owns those writes.

// The modules that still import this are parked for later phases.
// Calling it throws. The return type stays loose so those files keep compiling.
export function createAdminClient(): any {
  throw new Error("This database call moved to the PHP API.");
}

export function createClient(): any {
  throw new Error("This database call moved to the PHP API.");
}
