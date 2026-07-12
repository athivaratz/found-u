import type { FoundItem, LostItem } from "@/lib/types";
import {
  serializeOwnerFoundItem,
  serializeOwnerLostItem,
  serializePublicFoundItem,
  serializePublicLostItem,
} from "@/lib/agent/row-mappers";

export type ItemVisibility = "owner" | "public";

export type SerializedItem = {
  type: "lost" | "found";
  id?: string;
  trackingCode?: string;
  itemName?: string | null;
  category?: string | null;
  description?: string | null;
  location?: string;
  locationPlaceName?: string | null;
  photoUrl?: string | null;
  status?: string;
  dateLost?: string;
  dateFound?: string;
  matchedFoundId?: string;
  matchedLostId?: string;
  visibility: ItemVisibility;
};

export type ViewerContext = {
  userId: string | null;
  isAdmin: boolean;
};

function isOwner(
  itemUserId: string | undefined | null,
  viewerUserId: string | null
): boolean {
  return Boolean(viewerUserId && itemUserId && itemUserId === viewerUserId);
}

export function serializeLostForViewer(
  item: LostItem,
  viewer: ViewerContext
): SerializedItem {
  if (viewer.isAdmin || isOwner(item.userId, viewer.userId)) {
    return serializeOwnerLostItem(item);
  }
  return serializePublicLostItem(item);
}

export function serializeFoundForViewer(
  item: FoundItem,
  viewer: ViewerContext
): SerializedItem {
  if (viewer.isAdmin || isOwner(item.userId, viewer.userId)) {
    return serializeOwnerFoundItem(item);
  }
  return serializePublicFoundItem(item);
}

/** Lookup by exact tracking code — user already knows the code. */
export function serializeLostForLookup(
  item: LostItem,
  viewer: ViewerContext
): SerializedItem {
  const owner = viewer.isAdmin || isOwner(item.userId, viewer.userId);
  if (owner) {
    return serializeOwnerLostItem(item);
  }
  return {
    ...serializePublicLostItem(item),
    trackingCode: item.trackingCode,
  };
}

export function logPrivacyAction(
  action: string,
  userId: string | null,
  reason: string,
  extra?: Record<string, unknown>
): void {
  console.warn("[agent/privacy]", { action, userId, reason, ...extra });
}
