import { createClient } from "@/lib/supabase/server";
import {
  findMatchesForFoundItem,
  findMatchesForLostItem,
  getMatchConfidence,
} from "@/lib/matching";
import {
  mapFoundItemRow,
  mapLostItemRow,
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
import { ITEM_CATEGORIES } from "@/lib/agent/ner-field-hints";
import { formatReportValidationError } from "@/lib/agent/report-validation-errors";

function normalizeCategory(category: string): ItemCategory {
  const lower = category.trim().toLowerCase();
  if (ITEM_CATEGORIES.includes(lower as ItemCategory)) {
    return lower as ItemCategory;
  }
  return "other";
}

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
}): Promise<
  | {
      ok: true;
      item: Awaited<ReturnType<typeof mapLostItemRow>>;
      matches: Array<{
        score: number;
        confidence: string;
        scorePercentage: number;
        reasons: string[];
        lostItem: Awaited<ReturnType<typeof mapLostItemRow>>;
        foundItem: Awaited<ReturnType<typeof mapFoundItemRow>>;
      }>;
    }
  | { ok: false; message: string; missingFields?: string[] }
> {
  const supabase = await createClient();
  const trackingCode = generateTrackingCode("lost");
  const validated = createLostItemSchema.safeParse({
    trackingCode,
    itemName: params.itemName.trim(),
    category: normalizeCategory(params.category),
    description: params.description?.trim() || params.itemName.trim(),
    locationLost: params.locationLost.trim(),
    locationPlaceName: params.locationLost.trim(),
    dateLost: parseItemDate(params.dateLost || params.time),
    contacts: buildContacts(params.contacts, params.contact, params.contactType),
    userId: params.userId,
    status: "searching",
  });

  if (!validated.success) {
    const { message, missingFields } = formatReportValidationError(validated.error);
    return { ok: false, message, missingFields };
  }

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from("lost_items")
    .insert(
      stripUndefined({
        tracking_code: validated.data.trackingCode,
        item_name: validated.data.itemName,
        category: validated.data.category,
        description: validated.data.description,
        location_lost: validated.data.locationLost,
        location_place_name: validated.data.locationPlaceName,
        location_coords: validated.data.locationCoords,
        date_lost: toIso(validated.data.dateLost),
        contacts: validated.data.contacts,
        user_id: validated.data.userId,
        status: validated.data.status,
        matched_found_id: validated.data.matchedFoundId,
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
    ok: true,
    item,
    matches: matches.map((match) => ({
      score: match.score,
      confidence: getMatchConfidence(match.score),
      scorePercentage: Math.round(match.score * 100),
      reasons: match.reasons,
      lostItem: match.lostItem,
      foundItem: match.foundItem,
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
): Promise<
  | {
      ok: true;
      item: Awaited<ReturnType<typeof mapFoundItemRow>>;
      matches: Array<{
        score: number;
        confidence: string;
        scorePercentage: number;
        reasons: string[];
        lostItem: Awaited<ReturnType<typeof mapLostItemRow>>;
        foundItem: Awaited<ReturnType<typeof mapFoundItemRow>>;
      }>;
    }
  | { ok: false; message: string; missingFields?: string[] }
> {
  const supabase = await createClient();
  const trackingCode = generateTrackingCode("found");
  const handoverDeadlineAt = computeHandoverDeadlineFromNow(settings);
  const dropOff =
    (params.dropOffLocation as DropOffLocation | undefined) ||
    DEFAULT_FOUND_DROP_OFF_LOCATION;

  const validated = createFoundItemSchema.safeParse({
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
      ? { category: normalizeCategory(params.category) }
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

  if (!validated.success) {
    const { message, missingFields } = formatReportValidationError(validated.error);
    return { ok: false, message, missingFields };
  }

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from("found_items")
    .insert(
      stripUndefined({
        tracking_code: validated.data.trackingCode,
        photo_url: validated.data.photoUrl,
        item_name: validated.data.itemName,
        category: validated.data.category,
        color: validated.data.color,
        brand: validated.data.brand,
        description: validated.data.description,
        location_found: validated.data.locationFound,
        location_place_name: validated.data.locationPlaceName,
        location_coords: validated.data.locationCoords,
        date_found: toIso(validated.data.dateFound),
        drop_off_location: validated.data.dropOffLocation,
        finder_contacts: validated.data.finderContacts,
        user_id: validated.data.userId,
        status: validated.data.status,
        room_handover_confirmed: validated.data.roomHandoverConfirmed,
        handover_deadline_at: validated.data.handoverDeadlineAt
          ? toIso(validated.data.handoverDeadlineAt)
          : undefined,
        matched_lost_id: validated.data.matchedLostId,
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
    ok: true,
    item,
    matches: matches.map((match) => ({
      score: match.score,
      confidence: getMatchConfidence(match.score),
      scorePercentage: Math.round(match.score * 100),
      reasons: match.reasons,
      lostItem: match.lostItem,
      foundItem: match.foundItem,
    })),
  };
}
