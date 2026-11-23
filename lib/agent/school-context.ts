import { getAppSettingsAdmin } from "@/lib/ai-rate-limit";

const DEFAULT_SCHOOL_NAME = "โรงเรียนนี้";

async function getSchoolBrandingData(): Promise<{ school_name?: string } | null> {
  return null;
}

export async function getRuntimeSchoolName(): Promise<string> {
  const branding = await getSchoolBrandingData();
  if (branding?.school_name?.trim()) {
    return branding.school_name.trim();
  }

  const settings = await getAppSettingsAdmin();
  const ogTitle = settings.ogTitle;
  if (ogTitle?.includes("|")) {
    const parsed = ogTitle.split("|")[0]?.trim();
    if (parsed) return parsed;
  }

  return DEFAULT_SCHOOL_NAME;
}

export { DEFAULT_SCHOOL_NAME };
