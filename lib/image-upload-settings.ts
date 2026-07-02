import type { AppSettings } from "@/lib/types";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import type { CompressionOptions } from "@/lib/storage";

export function getMaxUploadBytes(settings: Pick<AppSettings, "maxImageSize">): number {
  const mb = settings.maxImageSize ?? DEFAULT_APP_SETTINGS.maxImageSize ?? 5;
  return mb * 1024 * 1024;
}

export function getCompressionOptionsFromSettings(
  settings: Pick<AppSettings, "compressionQuality">
): CompressionOptions {
  return {
    initialQuality: settings.compressionQuality ?? DEFAULT_APP_SETTINGS.compressionQuality ?? 0.8,
    maxWidthOrHeight: 1024,
    maxSizeMB: 0.5,
  };
}
