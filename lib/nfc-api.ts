import { auth } from "@/lib/auth";
import type { ContactInfo, ItemCategory, NfcTagStatus } from "@/lib/types";

async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error("not_authenticated");
  const token = await user.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function registerNfcTagApi(input: {
  itemName: string;
  category: ItemCategory;
  description?: string;
  contacts: ContactInfo[];
  tagUid?: string;
  readOnlyLocked: boolean;
}): Promise<{ tagId: string; tagUrl: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/nfc/register", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "register_failed");
  }
  return data;
}

export interface NfcResolveResult {
  tag: {
    tagId: string;
    itemName: string;
    category: ItemCategory;
    description?: string;
    status: string;
    isLost: boolean;
  };
  isOwner: boolean;
}

export async function resolveNfcTagApi(tagId: string): Promise<NfcResolveResult> {
  const headers = await getAuthHeaders().catch(() => ({}));
  const res = await fetch(`/api/nfc/resolve?tag=${encodeURIComponent(tagId)}`, {
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "resolve_failed");
  }
  return data;
}

export async function submitNfcFoundReportApi(input: {
  tagId: string;
  finderMessage: string;
  locationFound?: string;
  locationCoords?: { lat: number; lng: number; accuracy?: number; source?: string };
  finderContacts?: ContactInfo[];
}): Promise<{ reportId: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/nfc/found", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "submit_failed");
  }
  return data;
}

export async function updateNfcTagStatusApi(
  tagId: string,
  status: NfcTagStatus,
  lostItemId?: string
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/nfc/tags/${encodeURIComponent(tagId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status, lostItemId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "update_failed");
  }
}
