export type GeolocationPermissionState = "granted" | "denied" | "prompt" | "unsupported";

export async function queryGeolocationPermission(): Promise<GeolocationPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unsupported";
  }

  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result.state as GeolocationPermissionState;
  } catch {
    return "unsupported";
  }
}

export function watchGeolocationPermission(
  onChange: (state: GeolocationPermissionState) => void
): (() => void) | undefined {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return undefined;
  }

  let permissionStatus: PermissionStatus | null = null;

  const handleChange = () => {
    if (permissionStatus) {
      onChange(permissionStatus.state as GeolocationPermissionState);
    }
  };

  navigator.permissions
    .query({ name: "geolocation" })
    .then((status) => {
      permissionStatus = status;
      onChange(status.state as GeolocationPermissionState);
      status.addEventListener("change", handleChange);
    })
    .catch(() => onChange("unsupported"));

  return () => {
    permissionStatus?.removeEventListener("change", handleChange);
  };
}
