import { ApiError, apiFetch } from "@/lib/api-client";
import { intervalForTables, subscribeChanges } from "@/lib/change-poller";
import { coerceToDate, normalizeGeoPoint, normalizeGeoPolygon } from "@/lib/utils";
import { normalizeMapZones } from "@/lib/map-zones";
import { stripUndefined } from "@/lib/strip-undefined";
import { normalizeAgentSettings } from "@/lib/agent/normalize-agent-settings";
import {
  DEFAULT_APP_SETTINGS,
  type AIUsageRecord,
  type AppSettings,
  type AppUser,
  type BanStatus,
  type ContactInfo,
  type ContactType,
  type FoundItem,
  type ItemCategory,
  type ItemStatus,
  type LostItem,
  type NfcFoundReport,
  type NfcFoundReportStatus,
  type NfcTag,
  type NfcTagStatus,
  type UserRole,
} from "@/lib/types";
import type { Database } from "@/lib/database.types";
import { createFoundItemSchema, createLostItemSchema } from "@/lib/validations/items";

type SupabaseConstraint<T> = (query: T) => T;

type DbRow = Record<string, unknown>;

export const COLLECTIONS = {
  LOST_ITEMS: "lost_items",
  FOUND_ITEMS: "found_items",
  USERS: "accounts",
  SETTINGS: "app_settings",
  AI_USAGE: "ai_usage",
  ERROR_LOGS: "error_logs",
  NFC_TAGS: "nfc_tags",
  NFC_FOUND_REPORTS: "nfc_found_reports",
} as const;

const APP_SETTINGS_DOC_ID = "default";

const SETTINGS_KEYS = new Set([
  "ogTitle", "ogDescription", "aiRateLimitEnabled", "aiRateLimitPerMinute", "aiRateLimitPerHour",
  "aiRateLimitMessage", "systemAiRateLimitEnabled", "systemAiRateLimitPerMinute", "systemAiRateLimitPerHour",
  "aiNerModel", "aiNerTemperature", "aiNerTopP", "aiNerMaxOutputTokens", "aiMatchingModel",
  "aiMatchingTemperature", "aiMatchingTopP", "aiMatchingMaxOutputTokens", "aiVisionModel",
  "aiVisionTemperature", "aiVisionTopP", "aiVisionMaxOutputTokens", "agentProvider",
  "agentFallbackProvider", "agentModel", "agentOpenRouterModel", "agentOpenRouterLockProvider",
  "agentOpenRouterProviderOrder", "agentOpenRouterAllowFallbacks", "agentOpenRouterProviderIgnore",
  "agentOpenRouterReasoningEffort", "agentOpenRouterProviderSort", "agentMaxSteps",
  "agentMaxOutputTokens", "agentTemperature", "agentContextMaxMessages", "agentContextMaxTokens",
  "agentContextStrategy", "agentMemoryMaxFacts", "searchSimilarityThreshold", "mapsEnabled",
  "mapTileUrl", "mapAttribution", "mapDefaultCenter", "mapDefaultZoom", "mapSchoolBoundary",
  "mapZones", "mapEnforceFoundInSchool", "notifyOnNewReport", "notifyOnStatusChange",
  "requireApproval", "foundHandoverDeadlineEnabled", "foundHandoverDeadlineMinutes",
  "autoDeleteDays", "maxImageSize", "compressionQuality", "nfcEnabled", "nfcRequireLoginToReport",
  "nfcPublicBaseUrl", "comingSoonEnabled", "comingSoonMessage", "schoolName", "logoUrl",
]);

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function timestampToDate(timestamp: Date | undefined | unknown): Date {
  return coerceToDate(timestamp);
}

function asDate(value: unknown): Date {
  return timestampToDate(value);
}

function optionalDate(value: unknown): Date | undefined {
  if (value == null || value === "") return undefined;
  const date = timestampToDate(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function watch(tables: string[], refetch: () => Promise<void>, onError?: (error: Error) => void) {
  return subscribeChanges(
    tables,
    () => {
      void refetch().catch((error: unknown) => {
        const wrapped = error instanceof Error ? error : new Error(String(error));
        if (onError) onError(wrapped);
        else console.error(wrapped);
      });
    },
    intervalForTables(tables)
  );
}

async function readJson<T>(path: string, init?: { method?: string; json?: unknown }): Promise<T> {
  return apiFetch<T>(path, init);
}

function missing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 501);
}

type Page<T> = { items?: T[]; users?: T[]; records?: T[]; logs?: T[]; nextCursor?: string | null };

async function followCursor<T>(path: string, key: "items" | "users" | "records" | "logs"): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  const joiner = path.includes("?") ? "&" : "?";
  for (let page = 0; page < 40; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const body = await readJson<Page<T>>(`${path}${joiner}${query.toString()}`);
    const chunk = body[key] ?? [];
    rows.push(...chunk);
    if (!body.nextCursor) break;
    cursor = body.nextCursor;
  }
  return rows;
}

function mapAppUserRow(row: DbRow): AppUser {
  return {
    uid: asString(row.id),
    email: asString(row.email),
    displayName: asString(row.display_name),
    photoURL: asNullableString(row.photo_url),
    role: (asString(row.role) || "user") as UserRole,
    studentId: asNullableString(row.student_id),
    firstName: asNullableString(row.first_name),
    lastName: asNullableString(row.last_name),
    nickname: asNullableString(row.nickname),
    shownName: asNullableString(row.shown_name),
    isStudentVerified:
      typeof row.is_student_verified === "boolean"
        ? row.is_student_verified
        : asString(row.role) === "admin" || !!asNullableString(row.student_id),
    authMethods: Array.isArray(row.auth_methods)
      ? (row.auth_methods as AppUser["authMethods"])
      : undefined,
    mustChangePassword: row.must_change_password === true,
    hasSeenTutorial: row.has_seen_tutorial === true,
    banStatus: (asString(row.ban_status) || "none") as BanStatus,
    banReason: asNullableString(row.ban_reason),
    bannedAt: optionalDate(row.banned_at),
    bannedBy: asNullableString(row.banned_by),
    timeoutUntil: optionalDate(row.timeout_until),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];

export function mapAccountRowToAppUser(row: AccountRow): AppUser {
  return mapAppUserRow(row as DbRow);
}

function userFromApi(row: DbRow): AppUser {
  return {
    uid: asString(row.uid ?? row.id),
    email: asString(row.email),
    displayName: asString(row.displayName ?? row.display_name),
    photoURL: asNullableString(row.photoURL ?? row.photo_url),
    role: (asString(row.role) || "user") as UserRole,
    studentId: asNullableString(row.studentId ?? row.student_id),
    firstName: asNullableString(row.firstName ?? row.first_name),
    lastName: asNullableString(row.lastName ?? row.last_name),
    nickname: asNullableString(row.nickname),
    shownName: asNullableString(row.shownName ?? row.shown_name),
    isStudentVerified: row.isStudentVerified === true || row.is_student_verified === true,
    authMethods: Array.isArray(row.authMethods)
      ? (row.authMethods as AppUser["authMethods"])
      : undefined,
    mustChangePassword: row.mustChangePassword === true || row.must_change_password === true,
    hasSeenTutorial: row.hasSeenTutorial === true || row.has_seen_tutorial === true,
    banStatus: (asString(row.banStatus ?? row.ban_status) || "none") as BanStatus,
    banReason: asNullableString(row.banReason ?? row.ban_reason),
    bannedAt: optionalDate(row.bannedAt ?? row.banned_at),
    bannedBy: asNullableString(row.bannedBy ?? row.banned_by),
    timeoutUntil: optionalDate(row.timeoutUntil ?? row.timeout_until),
    createdAt: asDate(row.createdAt ?? row.created_at),
    updatedAt: asDate(row.updatedAt ?? row.updated_at),
  };
}

function lostFromApi(row: DbRow): LostItem {
  return {
    id: asString(row.id),
    trackingCode: asString(row.trackingCode ?? row.tracking_code),
    itemName: asString(row.itemName ?? row.item_name),
    category: asString(row.category) as ItemCategory,
    description: asNullableString(row.description),
    locationLost: asString(row.locationLost ?? row.location_lost),
    locationPlaceName: asNullableString(row.locationPlaceName ?? row.location_place_name),
    locationCoords: (row.locationCoords ?? row.location_coords) as LostItem["locationCoords"],
    dateLost: asDate(row.dateLost ?? row.date_lost),
    contacts: (Array.isArray(row.contacts) ? row.contacts : []) as ContactInfo[],
    userId: asNullableString(row.userId ?? row.user_id),
    studentId: asNullableString(row.studentId ?? row.student_id),
    status: asString(row.status) as ItemStatus,
    createdAt: asDate(row.createdAt ?? row.created_at),
    updatedAt: asDate(row.updatedAt ?? row.updated_at),
    matchedFoundId: asNullableString(row.matchedFoundId ?? row.matched_found_id),
  };
}

function foundFromApi(row: DbRow): FoundItem {
  const contacts = row.finderContacts ?? row.finder_contacts;
  return {
    id: asString(row.id),
    trackingCode: asString(row.trackingCode ?? row.tracking_code),
    photoUrl: asNullableString(row.photoUrl ?? row.photo_url),
    itemName: asNullableString(row.itemName ?? row.item_name),
    category: asNullableString(row.category) as ItemCategory | undefined,
    color: typeof row.color === "string" || row.color === null ? row.color : undefined,
    brand: typeof row.brand === "string" || row.brand === null ? row.brand : undefined,
    description: asString(row.description),
    locationFound: asString(row.locationFound ?? row.location_found),
    locationPlaceName: asNullableString(row.locationPlaceName ?? row.location_place_name),
    locationCoords: (row.locationCoords ?? row.location_coords) as FoundItem["locationCoords"],
    dateFound: asDate(row.dateFound ?? row.date_found),
    dropOffLocation: asString(row.dropOffLocation ?? row.drop_off_location) as FoundItem["dropOffLocation"],
    finderContacts: (Array.isArray(contacts) ? contacts : undefined) as FoundItem["finderContacts"],
    userId: asNullableString(row.userId ?? row.user_id),
    status: asString(row.status) as ItemStatus,
    roomHandoverConfirmed: row.roomHandoverConfirmed === true || row.room_handover_confirmed === true,
    roomHandoverConfirmedAt: optionalDate(row.roomHandoverConfirmedAt ?? row.room_handover_confirmed_at),
    roomHandoverConfirmedBy: asNullableString(row.roomHandoverConfirmedBy ?? row.room_handover_confirmed_by),
    roomHandoverConfirmedByName: asNullableString(
      row.roomHandoverConfirmedByName ?? row.room_handover_confirmed_by_name
    ),
    handoverDeadlineAt: optionalDate(row.handoverDeadlineAt ?? row.handover_deadline_at),
    expiredAt: optionalDate(row.expiredAt ?? row.expired_at),
    createdAt: asDate(row.createdAt ?? row.created_at),
    updatedAt: asDate(row.updatedAt ?? row.updated_at),
    matchedLostId: asNullableString(row.matchedLostId ?? row.matched_lost_id),
  };
}

function nfcTagFromApi(row: DbRow): NfcTag {
  return {
    id: asString(row.id),
    tagUid: asNullableString(row.tagUid ?? row.tag_uid),
    ownerId: asString(row.ownerId ?? row.owner_id),
    itemName: asString(row.itemName ?? row.item_name),
    category: asString(row.category) as ItemCategory,
    description: asNullableString(row.description),
    contacts: (Array.isArray(row.contacts) ? row.contacts : []) as ContactInfo[],
    status: asString(row.status) as NfcTagStatus,
    readOnlyLocked: row.readOnlyLocked === true || row.read_only_locked === true,
    lostItemId: asNullableString(row.lostItemId ?? row.lost_item_id),
    lastFoundReportId: asNullableString(row.lastFoundReportId ?? row.last_found_report_id),
    ndefWrittenAt: optionalDate(row.ndefWrittenAt ?? row.ndef_written_at),
    registeredAt: asDate(row.registeredAt ?? row.registered_at),
    updatedAt: asDate(row.updatedAt ?? row.updated_at),
  };
}

function nfcReportFromApi(row: DbRow): NfcFoundReport {
  const contacts = row.finderContacts ?? row.finder_contacts;
  return {
    id: asString(row.id),
    tagId: asString(row.tagId ?? row.tag_id),
    ownerId: asString(row.ownerId ?? row.owner_id),
    finderUserId: asString(row.finderUserId ?? row.finder_user_id),
    finderMessage: asString(row.finderMessage ?? row.finder_message),
    locationFound: asNullableString(row.locationFound ?? row.location_found),
    locationCoords: (row.locationCoords ?? row.location_coords) as NfcFoundReport["locationCoords"],
    finderContacts: (Array.isArray(contacts) ? contacts : undefined) as NfcFoundReport["finderContacts"],
    status: asString(row.status) as NfcFoundReportStatus,
    createdAt: asDate(row.createdAt ?? row.created_at),
  };
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  return undefined;
}

function normalizeAppSettingsBlob(settingsBlob: DbRow): AppSettings {
  const base = { ...DEFAULT_APP_SETTINGS, ...settingsBlob } as AppSettings;
  const mapCenter =
    normalizeGeoPoint(settingsBlob.mapDefaultCenter) ||
    normalizeGeoPoint(settingsBlob.map_default_center) ||
    DEFAULT_APP_SETTINGS.mapDefaultCenter;
  const updatedAt = settingsBlob.updatedAt ?? settingsBlob.updated_at;
  const updatedBy = settingsBlob.updatedBy ?? settingsBlob.updated_by;
  return normalizeAgentSettings({
    ...base,
    mapDefaultCenter: mapCenter,
    mapSchoolBoundary: normalizeGeoPolygon(
      settingsBlob.mapSchoolBoundary ?? settingsBlob.map_school_boundary
    ),
    mapZones: normalizeMapZones(settingsBlob.mapZones ?? settingsBlob.map_zones ?? base.mapZones),
    agentOpenRouterProviderOrder:
      normalizeStringList(settingsBlob.agentOpenRouterProviderOrder) ?? base.agentOpenRouterProviderOrder,
    agentOpenRouterProviderIgnore:
      normalizeStringList(settingsBlob.agentOpenRouterProviderIgnore) ?? base.agentOpenRouterProviderIgnore,
    updatedAt: updatedAt ? timestampToDate(updatedAt) : undefined,
    updatedBy: typeof updatedBy === "string" ? updatedBy : undefined,
  });
}

export function coerceAppSettings(
  settingsBlob: Record<string, unknown> | null | undefined
): AppSettings {
  return normalizeAppSettingsBlob(settingsBlob ?? {});
}

function withoutMatched(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  delete next.matchedFoundId;
  delete next.matchedLostId;
  delete next.matched_found_id;
  delete next.matched_lost_id;
  return next;
}

function iso(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

export async function createOrUpdateUser(userData: {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}) {
  const updated = await readJson<{ user: DbRow }>("/api/users/me", {
    method: "PATCH",
    json: stripUndefined({
      displayName: userData.displayName,
      photoURL: userData.photoURL,
    }),
  });
  const user = userFromApi(updated.user);
  if (user.uid !== userData.uid) {
    const other = await getUser(userData.uid);
    if (other) return other;
  }
  return user;
}

export async function getUser(uid: string): Promise<AppUser | null> {
  try {
    const body = await readJson<{ user: DbRow }>(`/api/users/${encodeURIComponent(uid)}`);
    return body.user ? userFromApi(body.user) : null;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

export async function updateUserRole(uid: string, role: UserRole) {
  await readJson(`/api/admin/users/${encodeURIComponent(uid)}/role`, {
    method: "PATCH",
    json: { role },
  });
}

export async function getAllUsers(): Promise<AppUser[]> {
  const rows = await followCursor<DbRow>("/api/admin/users", "users");
  return rows.map((row) => userFromApi(row));
}

export function subscribeToUser(
  uid: string,
  callback: (user: AppUser | null) => void,
  onError?: (error: Error) => void
) {
  return watch([COLLECTIONS.USERS], async () => {
    callback(await getUser(uid));
  }, onError);
}

export async function updateUserTutorialSeen(uid: string) {
  void uid;
  await readJson("/api/users/me", {
    method: "PATCH",
    json: { hasSeenTutorial: true },
  });
}

export async function banUser(uid: string, reason: string, bannedBy: string): Promise<void> {
  void bannedBy;
  await readJson(`/api/admin/users/${encodeURIComponent(uid)}/ban`, {
    method: "POST",
    json: { reason },
  });
}

export async function unbanUser(uid: string): Promise<void> {
  await readJson(`/api/admin/users/${encodeURIComponent(uid)}/unban`, {
    method: "POST",
    json: {},
  });
}

export async function timeoutUser(
  uid: string,
  durationMinutes: number,
  reason: string,
  bannedBy: string
): Promise<void> {
  void bannedBy;
  await readJson(`/api/admin/users/${encodeURIComponent(uid)}/timeout`, {
    method: "POST",
    json: { reason, durationMinutes },
  });
}

export function isUserBanned(user: AppUser): boolean {
  if (!user.banStatus || user.banStatus === "none") return false;
  if (user.banStatus === "banned") return true;
  if (user.banStatus === "timeout" && user.timeoutUntil) {
    return new Date() < new Date(user.timeoutUntil);
  }
  return false;
}

export function getTimeoutRemaining(user: AppUser): number {
  if (user.banStatus !== "timeout" || !user.timeoutUntil) return 0;
  const remaining = new Date(user.timeoutUntil).getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / (1000 * 60)));
}

export async function getAppSettings(): Promise<AppSettings> {
  const result = await getAppSettingsWithMeta();
  return result.settings;
}

export type AppSettingsLoadResult = {
  settings: AppSettings;
  loadError?: string;
};

export async function getAppSettingsWithMeta(): Promise<AppSettingsLoadResult> {
  try {
    const body = await readJson<{ settings?: DbRow; loadError?: boolean }>("/api/settings");
    const settings = coerceAppSettings(body.settings ?? {});
    if (body.loadError) return { settings, loadError: "load_error" };
    return { settings };
  } catch (error) {
    console.error("Error fetching app settings:", error);
    return {
      settings: DEFAULT_APP_SETTINGS,
      loadError: error instanceof Error ? error.message : "load_error",
    };
  }
}

export async function updateAppSettings(settings: Partial<AppSettings>, updatedBy: string): Promise<void> {
  void updatedBy;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!SETTINGS_KEYS.has(key) || value === undefined) continue;
    patch[key] = iso(value);
  }
  if (Object.keys(patch).length === 0) return;
  await readJson("/api/admin/settings", { method: "PATCH", json: patch });
}

export function subscribeToAppSettings(callback: (settings: AppSettings) => void) {
  return watch(
    [COLLECTIONS.SETTINGS],
    async () => {
      callback(await getAppSettings());
    },
    () => callback(DEFAULT_APP_SETTINGS)
  );
}

export async function addLostItem(data: Omit<LostItem, "id" | "createdAt" | "updatedAt">) {
  const validated = createLostItemSchema.parse(data);
  const studentId = (data as { studentId?: string }).studentId;
  const created = await readJson<{ id: string }>("/api/lost-items", {
    method: "POST",
    json: withoutMatched(
      stripUndefined({
        trackingCode: validated.trackingCode,
        itemName: validated.itemName,
        category: validated.category,
        description: validated.description,
        locationLost: validated.locationLost,
        locationPlaceName: validated.locationPlaceName,
        locationCoords: validated.locationCoords,
        dateLost: iso(validated.dateLost),
        contacts: validated.contacts,
        userId: validated.userId,
        studentId,
        status: validated.status,
      })
    ),
  });
  return created.id;
}

export async function getLostItem(id: string) {
  try {
    const body = await readJson<{ item: DbRow }>(`/api/lost-items/${encodeURIComponent(id)}`);
    return body.item ? lostFromApi(body.item) : null;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

export async function getLostItemByTrackingCode(trackingCode: string) {
  try {
    const body = await readJson<{ item: DbRow }>(
      `/api/lost-items/by-code/${encodeURIComponent(trackingCode.toUpperCase())}`
    );
    return body.item ? lostFromApi(body.item) : null;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

export async function getLostItems(constraints: SupabaseConstraint<unknown>[] = []) {
  void constraints;
  const rows = await followCursor<DbRow>("/api/lost-items", "items");
  return rows.map((row) => lostFromApi(row));
}

export async function getLostItemsByStudentId(studentId: string) {
  const rows = await followCursor<DbRow>(
    `/api/lost-items?studentId=${encodeURIComponent(studentId)}`,
    "items"
  );
  return rows.map((row) => lostFromApi(row));
}

export async function getLostItemsByUserId(userId: string) {
  const rows = await followCursor<DbRow>(
    `/api/lost-items?userId=${encodeURIComponent(userId)}`,
    "items"
  );
  return rows.map((row) => lostFromApi(row));
}

export function subscribeToLostItemsByUserId(userId: string, callback: (items: LostItem[]) => void) {
  return watch([COLLECTIONS.LOST_ITEMS], async () => {
    callback(await getLostItemsByUserId(userId));
  });
}

export function subscribeToFoundItemsByUserId(userId: string, callback: (items: FoundItem[]) => void) {
  return watch([COLLECTIONS.FOUND_ITEMS], async () => {
    const rows = await followCursor<DbRow>(
      `/api/found-items?userId=${encodeURIComponent(userId)}`,
      "items"
    );
    callback(rows.map((row) => foundFromApi(row)));
  });
}

export async function getLatestLostItems(count = 5) {
  const body = await readJson<{ items: DbRow[] }>(`/api/lost-items/latest?limit=${count}`);
  return (body.items ?? []).map((row) => lostFromApi(row));
}

export async function updateLostItem(id: string, data: Partial<LostItem>) {
  await readJson(`/api/lost-items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    json: withoutMatched(
      stripUndefined({
        trackingCode: data.trackingCode,
        itemName: data.itemName,
        category: data.category,
        description: data.description,
        locationLost: data.locationLost,
        locationPlaceName: data.locationPlaceName,
        locationCoords: data.locationCoords,
        dateLost: data.dateLost ? iso(data.dateLost) : undefined,
        contacts: data.contacts,
        userId: data.userId,
        status: data.status,
      })
    ),
  });
}

export async function deleteLostItem(id: string) {
  await readJson(`/api/lost-items/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function addFoundItem(data: Omit<FoundItem, "id" | "createdAt" | "updatedAt">) {
  const validated = createFoundItemSchema.parse(data);
  const created = await readJson<{ id: string }>("/api/found-items", {
    method: "POST",
    json: withoutMatched(
      stripUndefined({
        trackingCode: validated.trackingCode,
        photoUrl: validated.photoUrl,
        itemName: validated.itemName,
        category: validated.category,
        color: validated.color,
        brand: validated.brand,
        description: validated.description,
        locationFound: validated.locationFound,
        locationPlaceName: validated.locationPlaceName,
        locationCoords: validated.locationCoords,
        dateFound: iso(validated.dateFound),
        dropOffLocation: validated.dropOffLocation,
        finderContacts: validated.finderContacts,
        userId: validated.userId,
        status: validated.status,
      })
    ),
  });
  return created.id;
}

export async function getFoundItem(id: string) {
  try {
    const body = await readJson<{ item: DbRow }>(`/api/found-items/${encodeURIComponent(id)}`);
    return body.item ? foundFromApi(body.item) : null;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

export async function getFoundItems(constraints: SupabaseConstraint<unknown>[] = []) {
  void constraints;
  const rows = await followCursor<DbRow>("/api/found-items", "items");
  return rows.map((row) => foundFromApi(row));
}

export async function getLatestFoundItems(count = 5) {
  const body = await readJson<{ items: DbRow[] }>(`/api/found-items/latest?limit=${count}`);
  return (body.items ?? []).map((row) => foundFromApi(row));
}

export async function updateFoundItem(id: string, data: Partial<FoundItem>) {
  await readJson(`/api/found-items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    json: withoutMatched(
      stripUndefined({
        trackingCode: data.trackingCode,
        photoUrl: data.photoUrl,
        itemName: data.itemName,
        category: data.category,
        color: data.color,
        brand: data.brand,
        description: data.description,
        locationFound: data.locationFound,
        locationPlaceName: data.locationPlaceName,
        locationCoords: data.locationCoords,
        dateFound: data.dateFound ? iso(data.dateFound) : undefined,
        dropOffLocation: data.dropOffLocation,
        finderContacts: data.finderContacts,
        userId: data.userId,
        status: data.status,
        roomHandoverConfirmed: data.roomHandoverConfirmed,
        roomHandoverConfirmedAt: data.roomHandoverConfirmedAt ? iso(data.roomHandoverConfirmedAt) : undefined,
        roomHandoverConfirmedBy: data.roomHandoverConfirmedBy,
        roomHandoverConfirmedByName: data.roomHandoverConfirmedByName,
        handoverDeadlineAt: data.handoverDeadlineAt ? iso(data.handoverDeadlineAt) : undefined,
        expiredAt: data.expiredAt ? iso(data.expiredAt) : undefined,
      })
    ),
  });
}

export async function confirmFoundItemRoomHandover(
  id: string,
  confirmedBy: { uid: string; displayName?: string; email?: string }
): Promise<void> {
  void confirmedBy;
  await readJson(`/api/found-items/${encodeURIComponent(id)}/handover`, { method: "POST" });
}

export async function deleteFoundItem(id: string) {
  await readJson(`/api/found-items/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getStats() {
  return readJson<{ searching: number; found: number; claimed: number; pendingRoomConfirm: number }>(
    "/api/stats"
  );
}

export function subscribeToLostItems(callback: (items: LostItem[]) => void) {
  return watch([COLLECTIONS.LOST_ITEMS], async () => {
    callback(await getLostItems());
  });
}

export function subscribeToFoundItems(callback: (items: FoundItem[]) => void) {
  if (typeof window !== "undefined") {
    void import("@/lib/found-handover-client").then(({ triggerFoundHandoverExpirySweep }) =>
      triggerFoundHandoverExpirySweep()
    );
  }
  return watch([COLLECTIONS.FOUND_ITEMS], async () => {
    callback(await getFoundItems());
  });
}

export interface CategoryConfig {
  id: string;
  value: string;
  label: string;
  icon: string;
  order: number;
}

export interface LocationConfig {
  id: string;
  value: string;
  label: string;
  order: number;
}

export interface ContactTypeConfig {
  id: string;
  value: ContactType | string;
  label: string;
  icon: string;
  placeholder: string;
  order: number;
}

const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { id: "wallet", value: "wallet", label: "กระเป๋าสตางค์", icon: "💰", order: 1 },
  { id: "phone", value: "phone", label: "โทรศัพท์", icon: "📱", order: 2 },
  { id: "keys", value: "keys", label: "กุญแจ", icon: "🔑", order: 3 },
  { id: "bag", value: "bag", label: "กระเป๋า", icon: "👜", order: 4 },
  { id: "electronics", value: "electronics", label: "อิเล็กทรอนิกส์", icon: "💻", order: 5 },
  { id: "documents", value: "documents", label: "เอกสาร", icon: "📄", order: 6 },
  { id: "clothing", value: "clothing", label: "เสื้อผ้า", icon: "👕", order: 7 },
  { id: "accessories", value: "accessories", label: "เครื่องประดับ", icon: "💍", order: 8 },
  { id: "other", value: "other", label: "อื่นๆ", icon: "📦", order: 9 },
];

const DEFAULT_LOCATIONS: LocationConfig[] = [
  { id: "personnel_office", value: "personnel_office", label: "ห้องบุคคล (ห้องปกครอง)", order: 1 },
  { id: "admin_office", value: "admin_office", label: "ห้องธุรการ", order: 2 },
  { id: "canteen", value: "canteen", label: "โรงอาหาร", order: 3 },
  { id: "library", value: "library", label: "ห้องสมุด", order: 4 },
  { id: "security", value: "security", label: "ห้องรปภ.", order: 5 },
  { id: "other", value: "other", label: "อื่นๆ", order: 6 },
];

const DEFAULT_CONTACT_TYPES: ContactTypeConfig[] = [
  { id: "phone", value: "phone", label: "เบอร์โทรศัพท์", icon: "📞", placeholder: "0812345678", order: 1 },
  { id: "line", value: "line", label: "LINE ID", icon: "💬", placeholder: "@lineid", order: 2 },
  { id: "instagram", value: "instagram", label: "Instagram", icon: "📷", placeholder: "@username", order: 3 },
  { id: "facebook", value: "facebook", label: "Facebook", icon: "📘", placeholder: "ชื่อ Facebook", order: 4 },
  { id: "email", value: "email", label: "Email", icon: "📧", placeholder: "email@example.com", order: 5 },
];

function catalogOrder(row: DbRow): number {
  return asNumber(row.order ?? row.sort_order);
}

export async function getCategories(): Promise<CategoryConfig[]> {
  try {
    const body = await readJson<{ categories?: DbRow[] }>("/api/categories");
    const rows = body.categories ?? [];
    if (rows.length === 0) return DEFAULT_CATEGORIES;
    return rows.map((row) => ({
      id: asString(row.id),
      value: asString(row.value),
      label: asString(row.label),
      icon: asString(row.icon) || "📦",
      order: catalogOrder(row),
    }));
  } catch (error) {
    console.error("Error fetching categories:", error);
    return DEFAULT_CATEGORIES;
  }
}

export async function getLocations(): Promise<LocationConfig[]> {
  try {
    const body = await readJson<{ locations?: DbRow[] }>("/api/locations");
    const rows = body.locations ?? [];
    if (rows.length > 0) {
      return rows.map((row) => ({
        id: asString(row.id),
        value: asString(row.value),
        label: asString(row.label),
        order: catalogOrder(row),
      }));
    }
    const legacy = await readJson<{ dropOffLocations?: DbRow[] }>("/api/drop-off-locations");
    const dropOff = legacy.dropOffLocations ?? [];
    if (dropOff.length === 0) return DEFAULT_LOCATIONS;
    return dropOff.map((row) => ({
      id: asString(row.id),
      value: asString(row.value),
      label: asString(row.label),
      order: catalogOrder(row),
    }));
  } catch (error) {
    console.error("Error fetching locations:", error);
    return DEFAULT_LOCATIONS;
  }
}

export async function getContactTypes(): Promise<ContactTypeConfig[]> {
  try {
    const body = await readJson<{ contactTypes?: DbRow[] }>("/api/contact-types");
    const rows = body.contactTypes ?? [];
    if (rows.length === 0) return DEFAULT_CONTACT_TYPES;
    return rows.map((row) => ({
      id: asString(row.id),
      value: asString(row.value),
      label: asString(row.label),
      icon: asString(row.icon) || "📞",
      placeholder: asString(row.placeholder),
      order: catalogOrder(row),
    }));
  } catch (error) {
    console.error("Error fetching contact types:", error);
    return DEFAULT_CONTACT_TYPES;
  }
}

export function subscribeToCategories(callback: (categories: CategoryConfig[]) => void) {
  return watch(["categories"], async () => callback(await getCategories()), () => callback(DEFAULT_CATEGORIES));
}

export function subscribeToLocations(callback: (locations: LocationConfig[]) => void) {
  return watch(["locations"], async () => callback(await getLocations()), () => callback(DEFAULT_LOCATIONS));
}

export function subscribeToContactTypes(callback: (contactTypes: ContactTypeConfig[]) => void) {
  return watch(
    ["contact_types"],
    async () => callback(await getContactTypes()),
    () => callback(DEFAULT_CONTACT_TYPES)
  );
}

export interface AIRateLimitResult {
  allowed: boolean;
  remainingMinute: number;
  remainingHour: number;
  resetMinute: Date;
  resetHour: Date;
  message?: string;
}

async function loadAiRecords(): Promise<AIUsageRecord[]> {
  try {
    const rows = await followCursor<DbRow>("/api/admin/ai-usage", "records");
    return rows.map((row) => ({
      id: asString(row.id),
      userId: asString(row.userId),
      endpoint: asString(row.endpoint),
      timestamp: asDate(row.createdAt),
    }));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return [];
    throw error;
  }
}

export function subscribeToAIUsage(callback: (records: AIUsageRecord[]) => void) {
  return watch(
    [COLLECTIONS.AI_USAGE],
    async () => callback(await loadAiRecords()),
    () => callback([])
  );
}

export async function getAIUsageStats(): Promise<{
  total: number;
  today: number;
  thisWeek: number;
  byEndpoint: Record<string, number>;
  byUser: Record<string, number>;
}> {
  const records = await loadAiRecords();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let today = 0;
  let thisWeek = 0;
  const byEndpoint: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  for (const record of records) {
    if (record.timestamp >= weekAgo) {
      thisWeek += 1;
      byEndpoint[record.endpoint] = (byEndpoint[record.endpoint] ?? 0) + 1;
      byUser[record.userId] = (byUser[record.userId] ?? 0) + 1;
    }
    if (record.timestamp >= todayStart) today += 1;
  }
  return { total: thisWeek, today, thisWeek, byEndpoint, byUser };
}

export async function recordAIUsage(userId: string, endpoint = "ner"): Promise<void> {
  await readJson("/api/ai-usage", { method: "POST", json: { userId, endpoint } });
}

export async function checkAIRateLimit(userId: string, settings: AppSettings): Promise<AIRateLimitResult> {
  if (!settings.aiRateLimitEnabled) {
    return {
      allowed: true,
      remainingMinute: Number.POSITIVE_INFINITY,
      remainingHour: Number.POSITIVE_INFINITY,
      resetMinute: new Date(),
      resetHour: new Date(),
    };
  }
  const records = (await loadAiRecords()).filter((record) => record.userId === userId);
  const now = Date.now();
  const minute = records.filter((record) => now - record.timestamp.getTime() < 60_000);
  const hour = records.filter((record) => now - record.timestamp.getTime() < 3_600_000);
  const limitPerMinute = settings.aiRateLimitPerMinute || 5;
  const limitPerHour = settings.aiRateLimitPerHour || 30;
  const remainingMinute = Math.max(0, limitPerMinute - minute.length);
  const remainingHour = Math.max(0, limitPerHour - hour.length);
  const oldestMinute = minute.reduce<number | null>(
    (min, record) => (min === null || record.timestamp.getTime() < min ? record.timestamp.getTime() : min),
    null
  );
  const oldestHour = hour.reduce<number | null>(
    (min, record) => (min === null || record.timestamp.getTime() < min ? record.timestamp.getTime() : min),
    null
  );
  const allowed = remainingMinute > 0 && remainingHour > 0;
  return {
    allowed,
    remainingMinute,
    remainingHour,
    resetMinute: new Date((oldestMinute ?? now) + 60_000),
    resetHour: new Date((oldestHour ?? now) + 3_600_000),
    message: allowed ? undefined : settings.aiRateLimitMessage,
  };
}

export async function cleanupOldAIUsage(): Promise<number> {
  // Cron deletes ai_usage. The matrix does not let a signed-in user delete rows.
  return 0;
}

async function nfcList<T>(path: string, map: (row: DbRow) => T): Promise<T[]> {
  try {
    const body = await readJson<{ items?: DbRow[] }>(path);
    return (body.items ?? []).map(map);
  } catch (error) {
    if (missing(error) || (error instanceof ApiError && error.status === 404)) return [];
    throw error;
  }
}

export async function getNfcTagById(tagId: string): Promise<NfcTag | null> {
  try {
    const body = await readJson<{ tag?: DbRow }>(`/api/nfc/tags/${encodeURIComponent(tagId.toUpperCase())}`);
    return body.tag ? nfcTagFromApi(body.tag) : null;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

export async function getNfcTagsByOwnerId(ownerId: string): Promise<NfcTag[]> {
  return nfcList(`/api/nfc/tags?ownerId=${encodeURIComponent(ownerId)}`, nfcTagFromApi);
}

export function subscribeToNfcTagsByOwnerId(ownerId: string, callback: (tags: NfcTag[]) => void): () => void {
  return watch([COLLECTIONS.NFC_TAGS], async () => {
    callback(await getNfcTagsByOwnerId(ownerId));
  });
}

export async function updateNfcTag(
  tagId: string,
  data: Partial<Omit<NfcTag, "id" | "registeredAt" | "ownerId" | "ndefWrittenAt">> & {
    ndefWrittenAt?: Date | null;
  }
): Promise<void> {
  await readJson(`/api/nfc/tags/${encodeURIComponent(tagId.toUpperCase())}`, {
    method: "PATCH",
    json: stripUndefined({
      tagUid: data.tagUid,
      itemName: data.itemName,
      category: data.category,
      description: data.description,
      contacts: data.contacts,
      status: data.status,
      readOnlyLocked: data.readOnlyLocked,
      lostItemId: data.lostItemId,
      lastFoundReportId: data.lastFoundReportId,
      ndefWrittenAt: data.ndefWrittenAt === null ? null : data.ndefWrittenAt ? iso(data.ndefWrittenAt) : undefined,
    }),
  });
}

export async function createNfcFoundReport(data: Omit<NfcFoundReport, "id" | "createdAt">): Promise<string> {
  const created = await readJson<{ id: string }>("/api/nfc/found-reports", {
    method: "POST",
    json: {
      tagId: data.tagId,
      ownerId: data.ownerId,
      finderUserId: data.finderUserId,
      finderMessage: data.finderMessage,
      locationFound: data.locationFound,
      locationCoords: data.locationCoords,
      finderContacts: data.finderContacts,
      status: data.status,
    },
  });
  return created.id;
}

export async function getNfcFoundReportsByTagId(tagId: string): Promise<NfcFoundReport[]> {
  return nfcList(`/api/nfc/found-reports?tagId=${encodeURIComponent(tagId)}`, nfcReportFromApi);
}

export function subscribeToNfcFoundReportsByOwnerId(
  ownerId: string,
  callback: (reports: NfcFoundReport[]) => void
): () => void {
  return watch([COLLECTIONS.NFC_FOUND_REPORTS], async () => {
    callback(await nfcList(`/api/nfc/found-reports?ownerId=${encodeURIComponent(ownerId)}`, nfcReportFromApi));
  });
}

export async function updateNfcFoundReport(
  reportId: string,
  data: { status?: NfcFoundReportStatus }
): Promise<void> {
  await readJson(`/api/nfc/found-reports/${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    json: { status: data.status },
  });
}

export async function getAllNfcTags(limitCount = 200): Promise<NfcTag[]> {
  const rows = await nfcList(`/api/nfc/tags?limit=${limitCount}`, nfcTagFromApi);
  return rows.slice(0, limitCount);
}

void APP_SETTINGS_DOC_ID;
