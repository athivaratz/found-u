import { apiFetch } from "@/lib/api-client";
import type { ContactInfo, ItemCategory, NfcFoundReport, NfcTag, NfcTagStatus } from "@/lib/types";

export async function registerNfcTagApi(input: {
  itemName: string;
  category: ItemCategory;
  description?: string;
  contacts: ContactInfo[];
  tagUid?: string;
  readOnlyLocked: boolean;
}): Promise<{ tagId: string; tagUrl: string }> {
  return apiFetch("/api/nfc/register", { method: "POST", json: input });
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
  return apiFetch(`/api/nfc/resolve?tag=${encodeURIComponent(tagId)}`);
}

export async function submitNfcFoundReportApi(input: {
  tagId: string;
  finderMessage: string;
  locationFound?: string;
  locationCoords?: { lat: number; lng: number; accuracy?: number; source?: string };
  finderContacts?: ContactInfo[];
}): Promise<{ reportId: string }> {
  return apiFetch("/api/nfc/found", { method: "POST", json: input });
}

export async function updateNfcTagApi(
  tagId: string,
  patch: {
    status?: NfcTagStatus;
    lostItemId?: string;
    itemName?: string;
    description?: string;
    category?: ItemCategory;
    contacts?: ContactInfo[];
    ndefWritten?: boolean;
  }
): Promise<void> {
  await apiFetch(`/api/nfc/tags/${encodeURIComponent(tagId)}`, { method: "PATCH", json: patch });
}

export async function updateNfcTagStatusApi(
  tagId: string,
  status: NfcTagStatus,
  lostItemId?: string
): Promise<void> {
  await updateNfcTagApi(tagId, { status, lostItemId });
}

function parseNfcTag(
  raw: NfcTag & { registeredAt: string; updatedAt: string; ndefWrittenAt?: string | null }
): NfcTag {
  return {
    ...raw,
    registeredAt: new Date(raw.registeredAt),
    updatedAt: new Date(raw.updatedAt),
    ndefWrittenAt: raw.ndefWrittenAt ? new Date(raw.ndefWrittenAt) : undefined,
  };
}

function parseNfcFoundReport(raw: NfcFoundReport & { createdAt: string }): NfcFoundReport {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
  };
}

export async function fetchMyNfcDashboardApi(): Promise<{
  tags: NfcTag[];
  reports: NfcFoundReport[];
}> {
  const data = await apiFetch<{ tags?: Array<NfcTag & { registeredAt: string; updatedAt: string; ndefWrittenAt?: string | null }>; reports?: Array<NfcFoundReport & { createdAt: string }> }>(
    "/api/nfc/my-tags"
  );
  return {
    tags: (data.tags || []).map(parseNfcTag),
    reports: (data.reports || []).map(parseNfcFoundReport),
  };
}

export async function updateNfcReportStatusApi(
  reportId: string,
  status: "viewed" | "resolved"
): Promise<void> {
  await apiFetch(`/api/nfc/reports/${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    json: { status },
  });
}
