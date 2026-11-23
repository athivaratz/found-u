// Server components cannot call a relative /api. In docker, FOUNDU_API_ORIGIN
// points at the PHP container. Production is the same host, so APP_URL works.
// P11 serves the static export from Apache and can drop this helper.

export function phpOrigin(): string {
  const configured = process.env.FOUNDU_API_ORIGIN || process.env.APP_URL || "http://127.0.0.1:8080";
  return configured.replace(/\/$/, "");
}

export async function phpGet<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${phpOrigin()}${path}`, {
      headers: { Accept: "application/json", "X-Requested-With": "foundu" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    console.error("[php]", path, error);
    return null;
  }
}
