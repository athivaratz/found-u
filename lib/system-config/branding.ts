import { z } from "zod";
import { readSystemConfig } from "@/lib/system-config/read";

export const SCHOOL_BRANDING_ID = "school_branding";

export const SchoolBrandingSchema = z.object({
  school_name: z.string().min(2).max(200),
  logo_url: z.string().url().optional(),
  updated_at: z.string().optional(),
});

export type SchoolBrandingData = z.infer<typeof SchoolBrandingSchema>;

export function parseSchoolBrandingData(value: unknown): SchoolBrandingData | null {
  const parsed = SchoolBrandingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function getSchoolBrandingData(): Promise<SchoolBrandingData | null> {
  return readSystemConfig(SCHOOL_BRANDING_ID, parseSchoolBrandingData);
}
