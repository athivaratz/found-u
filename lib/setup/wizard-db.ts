import { createAdminClient } from "@/lib/supabase/admin";
import {
  AI_CREDENTIALS_ID,
  SCHOOL_BRANDING_ID,
  SETUP_STATUS_ID,
} from "@/lib/setup/constants";
import {
  parseAiCredentialsData,
  parseSchoolBrandingData,
  parseSetupStatusData,
  type AiCredentialsData,
  type SchoolBrandingData,
  type SetupStatusData,
} from "@/lib/setup/schemas/setup-status";
import { fetchSetupStatusAdmin } from "@/lib/setup/setup-status-server";

export class SetupGuardError extends Error {
  constructor(
    message: string,
    public readonly code: "completed" | "not_ready" | "forbidden"
  ) {
    super(message);
    this.name = "SetupGuardError";
  }
}

export async function assertSetupNotCompleted(): Promise<void> {
  const status = await fetchSetupStatusAdmin();
  if (!status.databaseReady) {
    throw new SetupGuardError("ฐานข้อมูลยังไม่พร้อม", "not_ready");
  }
  if (status.setupCompleted) {
    throw new SetupGuardError("ตั้งค่าระบบเสร็จแล้ว", "completed");
  }
}

export async function assertDatabaseReady(): Promise<void> {
  const status = await fetchSetupStatusAdmin();
  if (!status.databaseReady) {
    throw new SetupGuardError("ฐานข้อมูลยังไม่พร้อม", "not_ready");
  }
}

async function readConfigData<T>(
  id: string,
  parser: (value: unknown) => T | null
): Promise<T | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("system_config")
    .select("config_data")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return parser(data?.config_data);
}

export async function getSetupStatusData(): Promise<SetupStatusData | null> {
  return readConfigData(SETUP_STATUS_ID, parseSetupStatusData);
}

export async function updateSetupStatusData(
  partial: Partial<SetupStatusData>
): Promise<void> {
  const admin = createAdminClient();
  const current = (await getSetupStatusData()) ?? { is_completed: false };
  const merged: SetupStatusData = { ...current, ...partial };
  const now = new Date().toISOString();

  const { error } = await admin.from("system_config").upsert(
    {
      id: SETUP_STATUS_ID,
      config_data: merged,
      updated_at: now,
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

export async function getSchoolBrandingData(): Promise<SchoolBrandingData | null> {
  return readConfigData(SCHOOL_BRANDING_ID, parseSchoolBrandingData);
}

export async function saveSchoolBrandingData(
  data: SchoolBrandingData
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("system_config").upsert(
    {
      id: SCHOOL_BRANDING_ID,
      config_data: { ...data, updated_at: now },
      updated_at: now,
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

export async function getAiCredentialsData(): Promise<AiCredentialsData | null> {
  return readConfigData(AI_CREDENTIALS_ID, parseAiCredentialsData);
}

export async function saveAiCredentialsData(
  data: AiCredentialsData
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("system_config").upsert(
    {
      id: AI_CREDENTIALS_ID,
      config_data: { ...data, configured_at: data.configured_at ?? now },
      updated_at: now,
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

export async function upsertAppSettingsOg(
  og: { ogTitle: string; ogDescription: string; ogImage?: string }
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: row, error: fetchError } = await admin
    .from("app_settings")
    .select("settings")
    .eq("id", "default")
    .maybeSingle();

  if (fetchError) throw fetchError;

  const current =
    row?.settings && typeof row.settings === "object"
      ? (row.settings as Record<string, unknown>)
      : {};

  const merged = {
    ...current,
    ogTitle: og.ogTitle,
    ogDescription: og.ogDescription,
    ...(og.ogImage ? { ogImage: og.ogImage } : {}),
    updatedAt: now,
    updatedBy: "setup-wizard",
  };

  const { error } = await admin.from("app_settings").upsert(
    {
      id: "default",
      settings: merged,
      updated_at: now,
      updated_by: "setup-wizard",
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

export function buildSupabasePublicUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  const normalizedPath = path.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/${bucket}/${normalizedPath}`;
}

export async function uploadToSupabaseBucket(
  bucket: string,
  path: string,
  file: Blob,
  contentType: string
): Promise<string> {
  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await admin.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true,
  });

  if (error) throw error;
  return buildSupabasePublicUrl(bucket, path);
}
