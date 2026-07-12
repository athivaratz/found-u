import type {
  ContactInfo,
  FoundItem,
  ItemCategory,
  ItemStatus,
  LostItem,
} from "@/lib/types";
import type { SerializedItem } from "@/lib/agent/item-privacy";

type DbRow = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function timestampToDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function mapLostItemRow(row: DbRow): LostItem {
  return {
    id: asString(row.id),
    trackingCode: asString(row.tracking_code),
    itemName: asString(row.item_name),
    category: asString(row.category) as ItemCategory,
    description: asNullableString(row.description),
    locationLost: asString(row.location_lost),
    locationPlaceName: asNullableString(row.location_place_name),
    locationCoords: row.location_coords as LostItem["locationCoords"],
    dateLost: timestampToDate(row.date_lost),
    contacts: (Array.isArray(row.contacts) ? row.contacts : []) as ContactInfo[],
    userId: asNullableString(row.user_id),
    status: asString(row.status) as ItemStatus,
    createdAt: timestampToDate(row.created_at),
    updatedAt: timestampToDate(row.updated_at),
    matchedFoundId: asNullableString(row.matched_found_id),
  };
}

export function mapFoundItemRow(row: DbRow): FoundItem {
  return {
    id: asString(row.id),
    trackingCode: asString(row.tracking_code),
    photoUrl: asNullableString(row.photo_url),
    itemName: asNullableString(row.item_name),
    category: asNullableString(row.category) as ItemCategory | undefined,
    color: typeof row.color === "string" || row.color === null ? row.color : undefined,
    brand: typeof row.brand === "string" || row.brand === null ? row.brand : undefined,
    description: asString(row.description),
    locationFound: asString(row.location_found),
    locationPlaceName: asNullableString(row.location_place_name),
    locationCoords: row.location_coords as FoundItem["locationCoords"],
    dateFound: timestampToDate(row.date_found),
    dropOffLocation: asString(row.drop_off_location) as FoundItem["dropOffLocation"],
    finderContacts: (Array.isArray(row.finder_contacts)
      ? row.finder_contacts
      : undefined) as FoundItem["finderContacts"],
    userId: asNullableString(row.user_id),
    status: asString(row.status) as ItemStatus,
    roomHandoverConfirmed: row.room_handover_confirmed === true,
    roomHandoverConfirmedAt: row.room_handover_confirmed_at
      ? timestampToDate(row.room_handover_confirmed_at)
      : undefined,
    roomHandoverConfirmedBy: asNullableString(row.room_handover_confirmed_by),
    roomHandoverConfirmedByName: asNullableString(row.room_handover_confirmed_by_name),
    handoverDeadlineAt: row.handover_deadline_at
      ? timestampToDate(row.handover_deadline_at)
      : undefined,
    expiredAt: row.expired_at ? timestampToDate(row.expired_at) : undefined,
    createdAt: timestampToDate(row.created_at),
    updatedAt: timestampToDate(row.updated_at),
    matchedLostId: asNullableString(row.matched_lost_id),
  };
}

export function serializeOwnerLostItem(item: LostItem): SerializedItem {
  return {
    type: "lost",
    visibility: "owner",
    id: item.id,
    trackingCode: item.trackingCode,
    itemName: item.itemName,
    category: item.category,
    description: item.description,
    location: item.locationLost,
    locationPlaceName: item.locationPlaceName,
    status: item.status,
    dateLost: item.dateLost.toISOString(),
    matchedFoundId: item.matchedFoundId,
  };
}

export function serializePublicLostItem(item: LostItem): SerializedItem {
  return {
    type: "lost",
    visibility: "public",
    itemName: item.itemName,
    category: item.category,
    description: item.description,
    location: item.locationLost,
    locationPlaceName: item.locationPlaceName,
    status: item.status,
    dateLost: item.dateLost.toISOString(),
  };
}

export function serializeOwnerFoundItem(item: FoundItem): SerializedItem {
  return {
    type: "found",
    visibility: "owner",
    id: item.id,
    trackingCode: item.trackingCode,
    itemName: item.itemName,
    category: item.category,
    description: item.description,
    location: item.locationFound,
    locationPlaceName: item.locationPlaceName,
    photoUrl: item.photoUrl,
    status: item.status,
    dateFound: item.dateFound.toISOString(),
    matchedLostId: item.matchedLostId,
  };
}

export function serializePublicFoundItem(item: FoundItem): SerializedItem {
  return {
    type: "found",
    visibility: "public",
    itemName: item.itemName,
    category: item.category,
    description: item.description,
    location: item.locationFound,
    locationPlaceName: item.locationPlaceName,
    photoUrl: item.photoUrl,
    status: item.status,
    dateFound: item.dateFound.toISOString(),
  };
}

/** @deprecated Use serializeOwnerLostItem — kept for owner-only report flows */
export function serializeLostItem(item: LostItem) {
  return serializeOwnerLostItem(item);
}

/** @deprecated Use serializeOwnerFoundItem — kept for owner-only report flows */
export function serializeFoundItem(item: FoundItem) {
  return serializeOwnerFoundItem(item);
}
