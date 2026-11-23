// The export only builds the "_" placeholder. Apache rewrites the real URL
// onto that file, so the param baked into the HTML is "_". The browser
// address is the one that matters.

export function segmentAfter(pathname: string, prefix: string): string {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  const base = prefix.replace(/\/+$/, "") || "/";
  if (path === base || !path.startsWith(base + "/")) return "";
  const segment = path.slice(base.length + 1).split("/")[0] ?? "";
  if (segment === "" || segment === "_") return "";
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
