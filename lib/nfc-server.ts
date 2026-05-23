import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import type { AppSettings, ContactInfo, ItemCategory, NfcTagStatus } from "@/lib/types";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import { generateNfcTagId } from "@/lib/utils";

export interface AuthUser {
  uid: string;
  email?: string;
}

export async function verifyAuthRequest(request: NextRequest): Promise<AuthUser | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

export async function getAppSettingsAdmin(): Promise<AppSettings> {
  const docSnap = await adminDb.collection("settings").doc("appSettings").get();
  if (!docSnap.exists) return DEFAULT_APP_SETTINGS;
  return { ...DEFAULT_APP_SETTINGS, ...docSnap.data() } as AppSettings;
}

export async function isAdminUser(uid: string): Promise<boolean> {
  const userDoc = await adminDb.collection("users").doc(uid).get();
  return userDoc.exists && userDoc.data()?.role === "admin";
}

export function normalizeTagId(tagId: string): string {
  return tagId.trim().toUpperCase();
}

export function buildTagPublicUrl(tagId: string, settings?: AppSettings): string {
  const base = settings?.nfcPublicBaseUrl?.replace(/\/$/, "") || "";
  if (base) return `${base}/nfc/t/${normalizeTagId(tagId)}`;
  return `/nfc/t/${normalizeTagId(tagId)}`;
}

export async function checkNfcFoundRateLimit(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const snapshot = await adminDb
    .collection("aiUsage")
    .where("userId", "==", userId)
    .where("timestamp", ">=", Timestamp.fromDate(oneHourAgo))
    .get();

  const nfcCount = snapshot.docs.filter((d) => d.data().endpoint === "nfc-found").length;
  const limit = 20;
  if (nfcCount >= limit) {
    return {
      allowed: false,
      message: "คุณส่งรายงานพบของบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
    };
  }

  await adminDb.collection("aiUsage").add({
    userId,
    endpoint: "nfc-found",
    timestamp: FieldValue.serverTimestamp(),
  });

  return { allowed: true };
}

export interface RegisterNfcTagInput {
  itemName: string;
  category: ItemCategory;
  description?: string;
  contacts: ContactInfo[];
  tagUid?: string;
  readOnlyLocked: boolean;
}

export async function registerNfcTagAdmin(
  ownerId: string,
  input: RegisterNfcTagInput
): Promise<{ tagId: string; tagUrl: string }> {
  if (input.tagUid) {
    const existing = await adminDb
      .collection("nfcTags")
      .where("tagUid", "==", input.tagUid)
      .limit(1)
      .get();
    if (!existing.empty) {
      throw new Error("tag_uid_already_registered");
    }
  }

  const settings = await getAppSettingsAdmin();
  if (settings.nfcEnabled === false) {
    throw new Error("nfc_disabled");
  }

  let tagId = generateNfcTagId();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existingDoc = await adminDb.collection("nfcTags").doc(tagId).get();
    if (!existingDoc.exists) break;
    tagId = generateNfcTagId();
  }

  const tagUrl = buildTagPublicUrl(tagId, settings);

  await adminDb.collection("nfcTags").doc(tagId).set({
    ownerId,
    itemName: input.itemName.trim(),
    category: input.category,
    description: input.description?.trim() || "",
    contacts: input.contacts,
    status: "active" as NfcTagStatus,
    readOnlyLocked: input.readOnlyLocked,
    ...(input.tagUid ? { tagUid: input.tagUid } : {}),
    registeredAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { tagId, tagUrl };
}

export interface NfcTagPublicInfo {
  tagId: string;
  itemName: string;
  category: ItemCategory;
  description?: string;
  status: NfcTagStatus;
  isLost: boolean;
  ownerId: string;
}

export async function resolveNfcTagPublic(tagId: string): Promise<NfcTagPublicInfo | null> {
  const normalized = normalizeTagId(tagId);
  const docSnap = await adminDb.collection("nfcTags").doc(normalized).get();
  if (!docSnap.exists) return null;

  const data = docSnap.data()!;
  if (data.status === "disabled") return null;

  return {
    tagId: docSnap.id,
    itemName: data.itemName,
    category: data.category,
    description: data.description,
    status: data.status,
    isLost: data.status === "lost",
    ownerId: data.ownerId,
  };
}

export interface CreateNfcFoundReportInput {
  tagId: string;
  finderUserId: string;
  finderMessage: string;
  locationFound?: string;
  locationCoords?: { lat: number; lng: number; accuracy?: number; source?: string };
  finderContacts?: ContactInfo[];
}

export async function createNfcFoundReportAdmin(input: CreateNfcFoundReportInput): Promise<string> {
  const normalized = normalizeTagId(input.tagId);
  const tagDoc = await adminDb.collection("nfcTags").doc(normalized).get();
  if (!tagDoc.exists) {
    throw new Error("tag_not_found");
  }

  const tagData = tagDoc.data()!;
  if (tagData.status === "disabled") {
    throw new Error("tag_disabled");
  }
  if (tagData.ownerId === input.finderUserId) {
    throw new Error("cannot_report_own_tag");
  }

  const reportRef = await adminDb.collection("nfcFoundReports").add({
    tagId: normalized,
    ownerId: tagData.ownerId,
    finderUserId: input.finderUserId,
    finderMessage: input.finderMessage.trim(),
    ...(input.locationFound ? { locationFound: input.locationFound.trim() } : {}),
    ...(input.locationCoords ? { locationCoords: input.locationCoords } : {}),
    ...(input.finderContacts?.length ? { finderContacts: input.finderContacts } : {}),
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  await tagDoc.ref.update({
    lastFoundReportId: reportRef.id,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return reportRef.id;
}

export async function updateNfcTagStatusAdmin(
  tagId: string,
  ownerId: string,
  status: NfcTagStatus,
  lostItemId?: string
): Promise<void> {
  const normalized = normalizeTagId(tagId);
  const tagRef = adminDb.collection("nfcTags").doc(normalized);
  const tagDoc = await tagRef.get();
  if (!tagDoc.exists) throw new Error("tag_not_found");

  const data = tagDoc.data()!;
  const isOwner = data.ownerId === ownerId;
  const isAdmin = await isAdminUser(ownerId);
  if (!isOwner && !isAdmin) throw new Error("forbidden");

  await tagRef.update(
    stripUndefinedAdmin({
      status,
      ...(lostItemId ? { lostItemId } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    })
  );
}

function stripUndefinedAdmin<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}

function adminTimestampToIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
}

export async function getOwnerNfcDashboardAdmin(ownerId: string) {
  const [tagsSnap, reportsSnap] = await Promise.all([
    adminDb
      .collection("nfcTags")
      .where("ownerId", "==", ownerId)
      .orderBy("registeredAt", "desc")
      .get(),
    adminDb
      .collection("nfcFoundReports")
      .where("ownerId", "==", ownerId)
      .orderBy("createdAt", "desc")
      .get(),
  ]);

  const tags = tagsSnap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      tagUid: data.tagUid,
      ownerId: data.ownerId,
      itemName: data.itemName,
      category: data.category,
      description: data.description,
      contacts: data.contacts || [],
      status: data.status,
      readOnlyLocked: data.readOnlyLocked ?? false,
      lostItemId: data.lostItemId,
      lastFoundReportId: data.lastFoundReportId,
      registeredAt: adminTimestampToIso(data.registeredAt),
      updatedAt: adminTimestampToIso(data.updatedAt),
    };
  });

  const reports = reportsSnap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      tagId: data.tagId,
      ownerId: data.ownerId,
      finderUserId: data.finderUserId,
      finderMessage: data.finderMessage,
      locationFound: data.locationFound,
      locationCoords: data.locationCoords,
      finderContacts: data.finderContacts,
      status: data.status,
      createdAt: adminTimestampToIso(data.createdAt),
    };
  });

  return { tags, reports };
}

export async function updateNfcFoundReportStatusAdmin(
  reportId: string,
  ownerId: string,
  status: "viewed" | "resolved"
): Promise<void> {
  const reportRef = adminDb.collection("nfcFoundReports").doc(reportId);
  const reportDoc = await reportRef.get();
  if (!reportDoc.exists) throw new Error("report_not_found");

  const data = reportDoc.data()!;
  if (data.ownerId !== ownerId && !(await isAdminUser(ownerId))) {
    throw new Error("forbidden");
  }

  await reportRef.update({ status });
}
