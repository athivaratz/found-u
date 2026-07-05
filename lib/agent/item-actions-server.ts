import { createClient } from "@/lib/supabase/server";
import {
  findMatchesForFoundItem,
  findMatchesForLostItem,
  getMatchConfidence,
} from "@/lib/matching";
import {
  mapFoundItemRow,
  mapLostItemRow,
  serializeFoundItem,
  serializeLostItem,
} from "@/lib/agent/row-mappers";
import { searchItemsServer } from "@/lib/agent/item-queries-server";
import { createFoundItemSchema, createLostItemSchema } from "@/lib/validations/items";
import {
  DEFAULT_FOUND_DROP_OFF_LOCATION,
  type AppSettings,
  type ContactInfo,
  type DropOffLocation,
  type ItemCategory,
} from "@/lib/types";
import { generateTrackingCode } from "@/lib/utils";
import { computeHandoverDeadlineFromNow } from "@/lib/found-handover";

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function toIso(value: Date): string {
  return value.toISOString();
}

const CONTACT_TYPES = new Set<ContactInfo["type"]>([
  "phone",
  "line",
  "instagram",
  "facebook",
  "email",
]);

function parseItemDate(timeOrIso?: string | null): Date {
  if (timeOrIso) {
    const iso = new Date(timeOrIso);
    if (!Number.isNaN(iso.getTime())) return iso;

    const match = timeOrIso.match(/(\d{1,2})[.:](\d{2})/);
    if (match) {
      const date = new Date();
      date.setHours(parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
      return date;
    }
  }
  return new Date();
}

function buildContacts(
  contacts?: ContactInfo[],
  contact?: string | null,
  contactType?: string | null
): ContactInfo[] {
  if (contacts?.length) {
    return contacts.filter((c) => c.value.trim());
  }
  if (!contact?.trim()) return [];
  const type = CONTACT_TYPES.has(contactType as ContactInfo["type"])
    ? (contactType as ContactInfo["type"])
    : "phone";
  return [{ type, value: contact.trim() }];
}

export async function reportLostItemServer(params: {
  userId: string;
  itemName: string;
  category: string;
  description?: string;
  locationLost: string;
  dateLost?: string;
  time?: string;
  contacts?: ContactInfo[];
  contact?: string;
  contactType?: string;
}) {
  const supabase = await createClient();
  const trackingCode = generateTrackingCode("lost");
  const validated = createLostItemSchema.parse({
    trackingCode,
    itemName: params.itemName.trim(),
    category: params.category.trim(),
    description: params.description?.trim() || params.itemName.trim(),
    locationLost: params.locationLost.trim(),
    locationPlaceName: params.locationLost.trim(),
    dateLost: parseItemDate(params.dateLost || params.time),
    contacts: buildContacts(params.contacts, params.contact, params.contactType),
    userId: params.userId,
    status: "searching",
  });

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from("lost_items")
    .insert(
      stripUndefined({
        tracking_code: validated.trackingCode,
        item_name: validated.itemName,
        category: validated.category,
        description: validated.description,
        location_lost: validated.locationLost,
        location_place_name: validated.locationPlaceName,
        location_coords: validated.locationCoords,
        date_lost: toIso(validated.dateLost),
        contacts: validated.contacts,
        user_id: validated.userId,
        status: validated.status,
        matched_found_id: validated.matchedFoundId,
        created_at: now,
        updated_at: now,
      })
    )
    .select("*")
    .single();

  if (error) throw error;

  const item = mapLostItemRow(inserted as Record<string, unknown>);
  const { found } = await searchItemsServer({
    query: item.itemName || item.description || "",
    type: "found",
    limit: 10,
  });
  const matches = findMatchesForLostItem(item, found);

  return {
    item,
    matches: matches.map((match) => ({
      score: match.score,
      confidence: getMatchConfidence(match.score),
      scorePercentage: Math.round(match.score * 100),
      reasons: match.reasons,
      lostItem: serializeLostItem(match.lostItem),
      foundItem: serializeFoundItem(match.foundItem),
    })),
  };
}

export async function reportFoundItemServer(
  params: {
    userId: string;
    description: string;
    locationFound: string;
    itemName?: string;
    category?: string;
    color?: string;
    brand?: string;
    dateFound?: string;
    time?: string;
    dropOffLocation?: string;
    finderContacts?: ContactInfo[];
    contact?: string;
    contactType?: string;
  },
  settings?: AppSettings
) {
  const supabase = await createClient();
  const trackingCode = generateTrackingCode("found");
  const handoverDeadlineAt = computeHandoverDeadlineFromNow(settings);
  const dropOff =
    (params.dropOffLocation as DropOffLocation | undefined) ||
    DEFAULT_FOUND_DROP_OFF_LOCATION;

  const validated = createFoundItemSchema.parse({
    trackingCode,
    description: params.description.trim(),
    locationFound: params.locationFound.trim(),
    locationPlaceName: params.locationFound.trim(),
    dropOffLocation: dropOff,
    dateFound: parseItemDate(params.dateFound || params.time),
    status: "pending_room_confirm",
    roomHandoverConfirmed: false,
    ...(params.itemName?.trim() ? { itemName: params.itemName.trim() } : {}),
    ...(params.category?.trim()
      ? { category: params.category.trim() as ItemCategory }
      : {}),
    ...(params.color?.trim() ? { color: params.color.trim() } : {}),
    ...(params.brand?.trim() ? { brand: params.brand.trim() } : {}),
    ...(handoverDeadlineAt ? { handoverDeadlineAt } : {}),
    finderContacts: buildContacts(
      params.finderContacts,
      params.contact,
      params.contactType
    ),
    userId: params.userId,
  });

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from("found_items")
    .insert(
      stripUndefined({
        tracking_code: validated.trackingCode,
        photo_url: validated.photoUrl,
        item_name: validated.itemName,
        category: validated.category,
        color: validated.color,
        brand: validated.brand,
        description: validated.description,
        location_found: validated.locationFound,
        location_place_name: validated.locationPlaceName,
        location_coords: validated.locationCoords,
        date_found: toIso(validated.dateFound),
        drop_off_location: validated.dropOffLocation,
        finder_contacts: validated.finderContacts,
        user_id: validated.userId,
        status: validated.status,
        room_handover_confirmed: validated.roomHandoverConfirmed,
        handover_deadline_at: validated.handoverDeadlineAt
          ? toIso(validated.handoverDeadlineAt)
          : undefined,
        matched_lost_id: validated.matchedLostId,
        created_at: now,
        updated_at: now,
      })
    )
    .select("*")
    .single();

  if (error) throw error;

  const item = mapFoundItemRow(inserted as Record<string, unknown>);
  const { lost } = await searchItemsServer({
    query: item.itemName || item.description || "",
    type: "lost",
    limit: 10,
  });
  const matches = findMatchesForFoundItem(item, lost);

  return {
    item,
    matches: matches.map((match) => ({
      score: match.score,
      confidence: getMatchConfidence(match.score),
      scorePercentage: Math.round(match.score * 100),
      reasons: match.reasons,
      lostItem: serializeLostItem(match.lostItem),
      foundItem: serializeFoundItem(match.foundItem),
    })),
  };
}
