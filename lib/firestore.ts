import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  type DocumentData,
  type QueryConstraint,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { coerceToDate, normalizeGeoPoint, normalizeGeoPolygon } from './utils';
import { stripUndefined } from './strip-undefined';
import type { LostItem, FoundItem, ItemStatus, AppUser, UserRole, BanStatus, AppSettings, ErrorLog, ErrorSeverity, ErrorSource, AIUsageRecord, NfcTag, NfcTagStatus, NfcFoundReport, NfcFoundReportStatus } from './types';
import { DEFAULT_APP_SETTINGS } from './types';

function mapAppSettingsFromFirestore(data: DocumentData): AppSettings {
  const mapCenter = normalizeGeoPoint(data.mapDefaultCenter) || DEFAULT_APP_SETTINGS.mapDefaultCenter;

  return {
    ogTitle: data.ogTitle || DEFAULT_APP_SETTINGS.ogTitle,
    ogDescription: data.ogDescription || DEFAULT_APP_SETTINGS.ogDescription,
    ogImage: data.ogImage || DEFAULT_APP_SETTINGS.ogImage,
    aiRateLimitEnabled: data.aiRateLimitEnabled ?? DEFAULT_APP_SETTINGS.aiRateLimitEnabled,
    aiRateLimitPerMinute: data.aiRateLimitPerMinute ?? DEFAULT_APP_SETTINGS.aiRateLimitPerMinute,
    aiRateLimitPerHour: data.aiRateLimitPerHour ?? DEFAULT_APP_SETTINGS.aiRateLimitPerHour,
    aiRateLimitMessage: data.aiRateLimitMessage ?? DEFAULT_APP_SETTINGS.aiRateLimitMessage,
    systemAiRateLimitEnabled: data.systemAiRateLimitEnabled ?? DEFAULT_APP_SETTINGS.systemAiRateLimitEnabled,
    systemAiRateLimitPerMinute: data.systemAiRateLimitPerMinute ?? DEFAULT_APP_SETTINGS.systemAiRateLimitPerMinute,
    systemAiRateLimitPerHour: data.systemAiRateLimitPerHour ?? DEFAULT_APP_SETTINGS.systemAiRateLimitPerHour,
    aiNerModel: data.aiNerModel || DEFAULT_APP_SETTINGS.aiNerModel,
    aiNerTemperature: data.aiNerTemperature ?? DEFAULT_APP_SETTINGS.aiNerTemperature,
    aiNerTopP: data.aiNerTopP ?? DEFAULT_APP_SETTINGS.aiNerTopP,
    aiNerMaxOutputTokens: data.aiNerMaxOutputTokens ?? DEFAULT_APP_SETTINGS.aiNerMaxOutputTokens,
    aiMatchingModel: data.aiMatchingModel || DEFAULT_APP_SETTINGS.aiMatchingModel,
    aiMatchingTemperature: data.aiMatchingTemperature ?? DEFAULT_APP_SETTINGS.aiMatchingTemperature,
    aiMatchingTopP: data.aiMatchingTopP ?? DEFAULT_APP_SETTINGS.aiMatchingTopP,
    aiMatchingMaxOutputTokens: data.aiMatchingMaxOutputTokens ?? DEFAULT_APP_SETTINGS.aiMatchingMaxOutputTokens,
    aiVisionModel: data.aiVisionModel || DEFAULT_APP_SETTINGS.aiVisionModel,
    aiVisionTemperature: data.aiVisionTemperature ?? DEFAULT_APP_SETTINGS.aiVisionTemperature,
    aiVisionTopP: data.aiVisionTopP ?? DEFAULT_APP_SETTINGS.aiVisionTopP,
    aiVisionMaxOutputTokens: data.aiVisionMaxOutputTokens ?? DEFAULT_APP_SETTINGS.aiVisionMaxOutputTokens,
    mapsEnabled: data.mapsEnabled ?? DEFAULT_APP_SETTINGS.mapsEnabled,
    mapTileUrl: data.mapTileUrl || DEFAULT_APP_SETTINGS.mapTileUrl,
    mapAttribution: data.mapAttribution || DEFAULT_APP_SETTINGS.mapAttribution,
    mapDefaultCenter: mapCenter,
    mapDefaultZoom: data.mapDefaultZoom ?? DEFAULT_APP_SETTINGS.mapDefaultZoom,
    mapSchoolBoundary: normalizeGeoPolygon(data.mapSchoolBoundary),
    mapEnforceFoundInSchool: data.mapEnforceFoundInSchool ?? DEFAULT_APP_SETTINGS.mapEnforceFoundInSchool,
    notifyOnNewReport: data.notifyOnNewReport ?? DEFAULT_APP_SETTINGS.notifyOnNewReport,
    notifyOnStatusChange: data.notifyOnStatusChange ?? DEFAULT_APP_SETTINGS.notifyOnStatusChange,
    requireApproval: data.requireApproval ?? DEFAULT_APP_SETTINGS.requireApproval,
    foundHandoverDeadlineEnabled:
      data.foundHandoverDeadlineEnabled ?? DEFAULT_APP_SETTINGS.foundHandoverDeadlineEnabled,
    foundHandoverDeadlineMinutes:
      data.foundHandoverDeadlineMinutes ?? DEFAULT_APP_SETTINGS.foundHandoverDeadlineMinutes,
    autoDeleteDays: data.autoDeleteDays ?? DEFAULT_APP_SETTINGS.autoDeleteDays,
    maxImageSize: data.maxImageSize ?? DEFAULT_APP_SETTINGS.maxImageSize,
    compressionQuality: data.compressionQuality ?? DEFAULT_APP_SETTINGS.compressionQuality,
    nfcEnabled: data.nfcEnabled ?? DEFAULT_APP_SETTINGS.nfcEnabled,
    nfcPublicBaseUrl: data.nfcPublicBaseUrl || DEFAULT_APP_SETTINGS.nfcPublicBaseUrl,
    nfcRequireLoginToReport: data.nfcRequireLoginToReport ?? DEFAULT_APP_SETTINGS.nfcRequireLoginToReport,
    updatedAt: timestampToDate(data.updatedAt),
    updatedBy: data.updatedBy,
  };
}

// Collection names
export const COLLECTIONS = {
  LOST_ITEMS: 'lostItems',
  FOUND_ITEMS: 'foundItems',
  USERS: 'users',
  SETTINGS: 'settings',
  AI_USAGE: 'aiUsage', // สำหรับ rate limit tracking
  ERROR_LOGS: 'errorLogs', // สำหรับเก็บ errors
  NFC_TAGS: 'nfcTags',
  NFC_FOUND_REPORTS: 'nfcFoundReports',
} as const;

// Settings document ID
const APP_SETTINGS_DOC_ID = 'appSettings';

// ========================================
// Users
// ========================================

export async function createOrUpdateUser(userData: {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}) {
  const userRef = doc(db, COLLECTIONS.USERS, userData.uid);
  const userDoc = await getDoc(userRef);
  
  if (userDoc.exists()) {
    // อัปเดต user ที่มีอยู่แล้ว
    await updateDoc(userRef, {
      email: userData.email,
      displayName: userData.displayName,
      photoURL: userData.photoURL,
      updatedAt: serverTimestamp(),
    });
    // อ่านข้อมูลใหม่หลังจากอัปเดต
    const updatedDoc = await getDoc(userRef);
    const data = updatedDoc.data();
    return {
      uid: userData.uid,
      email: data?.email || userData.email,
      displayName: data?.displayName || userData.displayName,
      photoURL: data?.photoURL,
      role: data?.role || 'user' as UserRole,
      hasSeenTutorial: data?.hasSeenTutorial || false,
      banStatus: data?.banStatus || 'none' as BanStatus,
      banReason: data?.banReason,
      bannedAt: timestampToDate(data?.bannedAt),
      bannedBy: data?.bannedBy,
      timeoutUntil: timestampToDate(data?.timeoutUntil),
      createdAt: timestampToDate(data?.createdAt),
      updatedAt: timestampToDate(data?.updatedAt),
    } as AppUser;
  } else {
    // สร้าง user ใหม่
    const newUser = {
      ...userData,
      role: 'user' as UserRole, // default role
      banStatus: 'none' as BanStatus, // default ban status
      hasSeenTutorial: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    // ใช้ setDoc โดยไม่ merge เพื่อให้แน่ใจว่า field ครบตามที่ Rules ต้องการ
    await setDoc(userRef, newUser);
    // อ่านข้อมูลใหม่หลังจากสร้าง
    const createdDoc = await getDoc(userRef);
    const data = createdDoc.data();
    return {
      uid: userData.uid,
      email: data?.email || userData.email,
      displayName: data?.displayName || userData.displayName,
      photoURL: data?.photoURL,
      role: data?.role || 'user' as UserRole,
      hasSeenTutorial: data?.hasSeenTutorial || false,
      banStatus: data?.banStatus || 'none' as BanStatus,
      banReason: data?.banReason,
      bannedAt: timestampToDate(data?.bannedAt),
      bannedBy: data?.bannedBy,
      timeoutUntil: timestampToDate(data?.timeoutUntil),
      createdAt: timestampToDate(data?.createdAt),
      updatedAt: timestampToDate(data?.updatedAt),
    } as AppUser;
  }
}

export async function getUser(uid: string): Promise<AppUser | null> {
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  const userDoc = await getDoc(userRef);
  if (userDoc.exists()) {
    return mapAppUserFromFirestore(userDoc.id, userDoc.data());
  }
  return null;
}

export async function updateUserRole(uid: string, role: UserRole) {
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  await updateDoc(userRef, {
    role,
    updatedAt: serverTimestamp(),
  });
}

export async function getAllUsers(): Promise<AppUser[]> {
  const q = query(collection(db, COLLECTIONS.USERS), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      email: data.email,
      displayName: data.displayName,
      photoURL: data.photoURL,
      role: data.role,
      hasSeenTutorial: data.hasSeenTutorial || false,
      banStatus: data.banStatus || 'none',
      banReason: data.banReason,
      bannedAt: timestampToDate(data.bannedAt),
      bannedBy: data.bannedBy,
      timeoutUntil: timestampToDate(data.timeoutUntil),
      createdAt: timestampToDate(data.createdAt),
      updatedAt: timestampToDate(data.updatedAt),
    } as AppUser;
  });
}

function mapAppUserFromFirestore(uid: string, data: DocumentData): AppUser {
  return {
    uid,
    email: data.email,
    displayName: data.displayName,
    photoURL: data.photoURL,
    role: data.role,
    studentId: data.studentId,
    firstName: data.firstName,
    lastName: data.lastName,
    nickname: data.nickname,
    shownName: data.shownName,
    isStudentVerified:
      data.isStudentVerified ?? (data.role === "admin" || !!data.studentId),
    authMethods: Array.isArray(data.authMethods) ? data.authMethods : undefined,
    mustChangePassword: data.mustChangePassword,
    hasSeenTutorial: data.hasSeenTutorial || false,
    banStatus: data.banStatus || "none",
    banReason: data.banReason,
    bannedAt: timestampToDate(data.bannedAt),
    bannedBy: data.bannedBy,
    timeoutUntil: timestampToDate(data.timeoutUntil),
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
  } as AppUser;
}

export function subscribeToUser(
  uid: string,
  callback: (user: AppUser | null) => void,
  onError?: (error: Error) => void
) {
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  return onSnapshot(
    userRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(mapAppUserFromFirestore(snapshot.id, snapshot.data()));
      } else {
        callback(null);
      }
    },
    (error) => {
      onError?.(error);
    }
  );
}

// ========================================
// Tutorial
// ========================================

export async function updateUserTutorialSeen(uid: string) {
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  await updateDoc(userRef, {
    hasSeenTutorial: true,
    updatedAt: serverTimestamp(),
  });
}

// ========================================
// User Ban/Timeout Management
// ========================================

/**
 * แบนผู้ใช้ถาวร
 */
export async function banUser(uid: string, reason: string, bannedBy: string): Promise<void> {
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  await updateDoc(userRef, {
    banStatus: 'banned' as BanStatus,
    banReason: reason,
    bannedAt: serverTimestamp(),
    bannedBy,
    timeoutUntil: null, // Clear any existing timeout
    updatedAt: serverTimestamp(),
  });
}

/**
 * ปลดแบนผู้ใช้
 */
export async function unbanUser(uid: string): Promise<void> {
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  await updateDoc(userRef, {
    banStatus: 'none' as BanStatus,
    banReason: null,
    bannedAt: null,
    bannedBy: null,
    timeoutUntil: null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Timeout ผู้ใช้ชั่วคราว
 * @param durationMinutes - ระยะเวลา timeout เป็นนาที
 */
export async function timeoutUser(
  uid: string, 
  durationMinutes: number, 
  reason: string, 
  bannedBy: string
): Promise<void> {
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  const timeoutUntil = new Date();
  timeoutUntil.setMinutes(timeoutUntil.getMinutes() + durationMinutes);
  
  await updateDoc(userRef, {
    banStatus: 'timeout' as BanStatus,
    banReason: reason,
    bannedAt: serverTimestamp(),
    bannedBy,
    timeoutUntil: Timestamp.fromDate(timeoutUntil),
    updatedAt: serverTimestamp(),
  });
}

/**
 * ตรวจสอบว่า user ถูกแบนหรือ timeout อยู่หรือไม่
 * @returns true ถ้าผู้ใช้ถูกแบน หรือ timeout ยังไม่หมด
 */
export function isUserBanned(user: AppUser): boolean {
  if (!user.banStatus || user.banStatus === 'none') {
    return false;
  }
  
  if (user.banStatus === 'banned') {
    return true;
  }
  
  // Check timeout
  if (user.banStatus === 'timeout' && user.timeoutUntil) {
    return new Date() < new Date(user.timeoutUntil);
  }
  
  return false;
}

/**
 * Get remaining timeout duration in minutes
 */
export function getTimeoutRemaining(user: AppUser): number {
  if (user.banStatus !== 'timeout' || !user.timeoutUntil) {
    return 0;
  }
  
  const remaining = new Date(user.timeoutUntil).getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / (1000 * 60)));
}

// ========================================
// App Settings
// ========================================

export async function getAppSettings(): Promise<AppSettings> {
  const settingsRef = doc(db, COLLECTIONS.SETTINGS, APP_SETTINGS_DOC_ID);
  const settingsDoc = await getDoc(settingsRef);
  
  if (settingsDoc.exists()) {
    return mapAppSettingsFromFirestore(settingsDoc.data());
  }
  
  // Return default settings if not exists
  return DEFAULT_APP_SETTINGS;
}

export async function updateAppSettings(settings: Partial<AppSettings>, updatedBy: string): Promise<void> {
  const settingsRef = doc(db, COLLECTIONS.SETTINGS, APP_SETTINGS_DOC_ID);
  const { updatedAt: _omitUpdatedAt, updatedBy: _omitUpdatedBy, ...payload } = settings;

  const data: Record<string, unknown> = {
    ...payload,
    updatedAt: serverTimestamp(),
    updatedBy,
  };

  // Always persist boundary as a real array (avoids Firestore map conversion)
  if (payload.mapSchoolBoundary !== undefined) {
    data.mapSchoolBoundary = normalizeGeoPolygon(payload.mapSchoolBoundary);
  }

  await setDoc(settingsRef, data, { merge: true });
}

export function subscribeToAppSettings(callback: (settings: AppSettings) => void) {
  const settingsRef = doc(db, COLLECTIONS.SETTINGS, APP_SETTINGS_DOC_ID);
  return onSnapshot(settingsRef, (doc) => {
    if (doc.exists()) {
      callback(mapAppSettingsFromFirestore(doc.data()));
    } else {
      callback(DEFAULT_APP_SETTINGS);
    }
  });
}

// ========================================
// Lost Items
// ========================================

export async function addLostItem(data: Omit<LostItem, 'id' | 'createdAt' | 'updatedAt'>) {
  const docRef = await addDoc(
    collection(db, COLLECTIONS.LOST_ITEMS),
    stripUndefined({
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  return docRef.id;
}

export async function getLostItem(id: string) {
  const docRef = doc(db, COLLECTIONS.LOST_ITEMS, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      trackingCode: data.trackingCode,
      itemName: data.itemName,
      category: data.category,
      description: data.description,
      locationLost: data.locationLost,
      locationPlaceName: data.locationPlaceName,
      locationCoords: data.locationCoords,
      dateLost: timestampToDate(data.dateLost),
      contacts: data.contacts,
      userId: data.userId,
      status: data.status,
      createdAt: timestampToDate(data.createdAt),
      updatedAt: timestampToDate(data.updatedAt),
      matchedFoundId: data.matchedFoundId,
    } as LostItem;
  }
  return null;
}

export async function getLostItemByTrackingCode(trackingCode: string) {
  const q = query(
    collection(db, COLLECTIONS.LOST_ITEMS),
    where('trackingCode', '==', trackingCode.toUpperCase())
  );
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    const doc = querySnapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      trackingCode: data.trackingCode,
      itemName: data.itemName,
      category: data.category,
      description: data.description,
      locationLost: data.locationLost,
      locationPlaceName: data.locationPlaceName,
      locationCoords: data.locationCoords,
      dateLost: timestampToDate(data.dateLost),
      contacts: data.contacts,
      userId: data.userId,
      status: data.status,
      createdAt: timestampToDate(data.createdAt),
      updatedAt: timestampToDate(data.updatedAt),
      matchedFoundId: data.matchedFoundId,
    } as LostItem;
  }
  return null;
}

export async function getLostItems(constraints: QueryConstraint[] = []) {
  const q = query(
    collection(db, COLLECTIONS.LOST_ITEMS),
    orderBy('createdAt', 'desc'),
    ...constraints
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      trackingCode: data.trackingCode,
      itemName: data.itemName,
      category: data.category,
      description: data.description,
      locationLost: data.locationLost,
      locationPlaceName: data.locationPlaceName,
      locationCoords: data.locationCoords,
      dateLost: timestampToDate(data.dateLost),
      contacts: data.contacts,
      userId: data.userId,
      status: data.status,
      createdAt: timestampToDate(data.createdAt),
      updatedAt: timestampToDate(data.updatedAt),
      matchedFoundId: data.matchedFoundId,
    } as LostItem;
  });
}

export async function getLostItemsByStudentId(studentId: string) {
  const q = query(
    collection(db, COLLECTIONS.LOST_ITEMS),
    where('studentId', '==', studentId),
    orderBy('createdAt', 'desc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      trackingCode: data.trackingCode,
      itemName: data.itemName,
      category: data.category,
      description: data.description,
      locationLost: data.locationLost,
      locationPlaceName: data.locationPlaceName,
      locationCoords: data.locationCoords,
      dateLost: timestampToDate(data.dateLost),
      contacts: data.contacts,
      userId: data.userId,
      status: data.status,
      createdAt: timestampToDate(data.createdAt),
      updatedAt: timestampToDate(data.updatedAt),
      matchedFoundId: data.matchedFoundId,
    } as LostItem;
  });
}

export async function getLostItemsByUserId(userId: string) {
  const q = query(
    collection(db, COLLECTIONS.LOST_ITEMS),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      trackingCode: data.trackingCode,
      itemName: data.itemName,
      category: data.category,
      description: data.description,
      locationLost: data.locationLost,
      locationPlaceName: data.locationPlaceName,
      locationCoords: data.locationCoords,
      dateLost: timestampToDate(data.dateLost),
      contacts: data.contacts,
      userId: data.userId,
      status: data.status,
      createdAt: timestampToDate(data.createdAt),
      updatedAt: timestampToDate(data.updatedAt),
      matchedFoundId: data.matchedFoundId,
    } as LostItem;
  });
}

export function subscribeToLostItemsByUserId(userId: string, callback: (items: LostItem[]) => void) {
  const q = query(
    collection(db, COLLECTIONS.LOST_ITEMS),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        trackingCode: data.trackingCode,
        itemName: data.itemName,
        category: data.category,
        description: data.description,
        locationLost: data.locationLost,
        locationPlaceName: data.locationPlaceName,
        locationCoords: data.locationCoords,
        dateLost: timestampToDate(data.dateLost),
        contacts: data.contacts,
        userId: data.userId,
        status: data.status,
        createdAt: timestampToDate(data.createdAt),
        updatedAt: timestampToDate(data.updatedAt),
        matchedFoundId: data.matchedFoundId,
      } as LostItem;
    });
    callback(items);
  });
}

function mapFoundItemDoc(docSnap: { id: string; data: () => DocumentData }): FoundItem {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    trackingCode: data.trackingCode,
    photoUrl: data.photoUrl,
    itemName: data.itemName,
    category: data.category,
    color: data.color ?? null,
    brand: data.brand ?? null,
    description: data.description,
    locationFound: data.locationFound,
    locationPlaceName: data.locationPlaceName,
    locationCoords: data.locationCoords,
    dateFound: timestampToDate(data.dateFound),
    dropOffLocation: data.dropOffLocation,
    finderContacts: data.finderContacts,
    userId: data.userId,
    status: data.status,
    roomHandoverConfirmed: data.roomHandoverConfirmed === true,
    roomHandoverConfirmedAt: data.roomHandoverConfirmedAt
      ? timestampToDate(data.roomHandoverConfirmedAt)
      : undefined,
    roomHandoverConfirmedBy: data.roomHandoverConfirmedBy,
    roomHandoverConfirmedByName: data.roomHandoverConfirmedByName,
    handoverDeadlineAt: data.handoverDeadlineAt
      ? timestampToDate(data.handoverDeadlineAt)
      : undefined,
    expiredAt: data.expiredAt ? timestampToDate(data.expiredAt) : undefined,
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
    matchedLostId: data.matchedLostId,
  } as FoundItem;
}

export function subscribeToFoundItemsByUserId(
  userId: string,
  callback: (items: FoundItem[]) => void
) {
  const q = query(
    collection(db, COLLECTIONS.FOUND_ITEMS),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => mapFoundItemDoc(d)));
  });
}

export async function getLatestLostItems(count: number = 5) {
  const q = query(
    collection(db, COLLECTIONS.LOST_ITEMS),
    where('status', '==', 'searching'),
    orderBy('createdAt', 'desc'),
    limit(count)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      trackingCode: data.trackingCode,
      itemName: data.itemName,
      category: data.category,
      description: data.description,
      locationLost: data.locationLost,
      locationPlaceName: data.locationPlaceName,
      locationCoords: data.locationCoords,
      dateLost: timestampToDate(data.dateLost),
      contacts: data.contacts,
      userId: data.userId,
      status: data.status,
      createdAt: timestampToDate(data.createdAt),
      updatedAt: timestampToDate(data.updatedAt),
      matchedFoundId: data.matchedFoundId,
    } as LostItem;
  });
}

export async function updateLostItem(id: string, data: Partial<LostItem>) {
  const docRef = doc(db, COLLECTIONS.LOST_ITEMS, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteLostItem(id: string) {
  const docRef = doc(db, COLLECTIONS.LOST_ITEMS, id);
  await deleteDoc(docRef);
}

// ========================================
// Found Items
// ========================================

export async function addFoundItem(data: Omit<FoundItem, 'id' | 'createdAt' | 'updatedAt'>) {
  const docRef = await addDoc(
    collection(db, COLLECTIONS.FOUND_ITEMS),
    stripUndefined({
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  return docRef.id;
}

export async function getFoundItem(id: string) {
  const docRef = doc(db, COLLECTIONS.FOUND_ITEMS, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return mapFoundItemDoc(docSnap);
  }
  return null;
}

export async function getFoundItems(constraints: QueryConstraint[] = []) {
  const q = query(
    collection(db, COLLECTIONS.FOUND_ITEMS),
    orderBy('createdAt', 'desc'),
    ...constraints
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => mapFoundItemDoc(doc));
}

export async function getLatestFoundItems(count: number = 5) {
  const q = query(
    collection(db, COLLECTIONS.FOUND_ITEMS),
    where('status', 'in', ['found', 'claimed']),
    orderBy('createdAt', 'desc'),
    limit(count)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => mapFoundItemDoc(doc));
}

export async function updateFoundItem(id: string, data: Partial<FoundItem>) {
  const docRef = doc(db, COLLECTIONS.FOUND_ITEMS, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/** แอดมินยืนยันว่าของถึงห้องบุคคลแล้ว */
export async function confirmFoundItemRoomHandover(
  id: string,
  confirmedBy: { uid: string; displayName?: string; email?: string }
): Promise<void> {
  const docRef = doc(db, COLLECTIONS.FOUND_ITEMS, id);
  await updateDoc(docRef, {
    status: "found",
    roomHandoverConfirmed: true,
    roomHandoverConfirmedAt: serverTimestamp(),
    roomHandoverConfirmedBy: confirmedBy.uid,
    roomHandoverConfirmedByName:
      confirmedBy.displayName?.trim() || confirmedBy.email?.trim() || confirmedBy.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteFoundItem(id: string) {
  const docRef = doc(db, COLLECTIONS.FOUND_ITEMS, id);
  await deleteDoc(docRef);
}

// ========================================
// Statistics
// ========================================

export async function getStats() {
  const [lostSnapshot, foundSnapshot] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.LOST_ITEMS)),
    getDocs(collection(db, COLLECTIONS.FOUND_ITEMS)),
  ]);

  let searching = 0;
  let found = 0;
  let claimed = 0;

  lostSnapshot.docs.forEach((doc) => {
    const status = doc.data().status as ItemStatus;
    if (status === 'searching') searching++;
    else if (status === 'found') found++;
    else if (status === 'claimed') claimed++;
  });

  let pendingRoomConfirm = 0;

  foundSnapshot.docs.forEach((doc) => {
    const status = doc.data().status as ItemStatus;
    if (status === 'pending_room_confirm') pendingRoomConfirm++;
    else if (status === 'found') found++;
    else if (status === 'claimed') claimed++;
  });

  return { searching, found, claimed, pendingRoomConfirm };
}

// ========================================
// Real-time listeners
// ========================================

export function subscribeToLostItems(callback: (items: LostItem[]) => void) {
  const q = query(
    collection(db, COLLECTIONS.LOST_ITEMS),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        trackingCode: data.trackingCode,
        itemName: data.itemName,
        category: data.category,
        description: data.description,
        locationLost: data.locationLost,
        locationPlaceName: data.locationPlaceName,
        locationCoords: data.locationCoords,
        dateLost: timestampToDate(data.dateLost),
        contacts: data.contacts,
        userId: data.userId,
        status: data.status,
        createdAt: timestampToDate(data.createdAt),
        updatedAt: timestampToDate(data.updatedAt),
        matchedFoundId: data.matchedFoundId,
      } as LostItem;
    });
    callback(items);
  });
}

export function subscribeToFoundItems(callback: (items: FoundItem[]) => void) {
  const q = query(
    collection(db, COLLECTIONS.FOUND_ITEMS),
    orderBy('createdAt', 'desc')
  );

  if (typeof window !== "undefined") {
    void import("@/lib/found-handover-client").then(({ triggerFoundHandoverExpirySweep }) =>
      triggerFoundHandoverExpirySweep()
    );
  }
  
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((doc) => mapFoundItemDoc(doc)));
  });
}

// Helper to convert Firestore Timestamp to Date
export function timestampToDate(timestamp: Timestamp | Date | undefined | unknown): Date {
  return coerceToDate(timestamp);
}

// ========================================
// Config Data (Categories, Locations, ContactTypes)
// ========================================

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
  value: string;
  label: string;
  icon: string;
  placeholder: string;
  order: number;
}

// Default fallbacks
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

// Get Categories from Firestore (one-time fetch)
export async function getCategories(): Promise<CategoryConfig[]> {
  try {
    const q = query(collection(db, "categories"), orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return DEFAULT_CATEGORIES;
    }
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      value: doc.data().value,
      label: doc.data().label,
      icon: doc.data().icon,
      order: doc.data().order,
    }));
  } catch (error) {
    console.error("Error fetching categories:", error);
    return DEFAULT_CATEGORIES;
  }
}

// Get Locations from Firestore (one-time fetch)
export async function getLocations(): Promise<LocationConfig[]> {
  try {
    const q = query(collection(db, "locations"), orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      // Try legacy dropOffLocations
      const legacyQ = query(collection(db, "dropOffLocations"), orderBy("order", "asc"));
      const legacySnapshot = await getDocs(legacyQ);
      if (legacySnapshot.empty) {
        return DEFAULT_LOCATIONS;
      }
      return legacySnapshot.docs.map((doc) => ({
        id: doc.id,
        value: doc.data().value,
        label: doc.data().label,
        order: doc.data().order,
      }));
    }
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      value: doc.data().value,
      label: doc.data().label,
      order: doc.data().order,
    }));
  } catch (error) {
    console.error("Error fetching locations:", error);
    return DEFAULT_LOCATIONS;
  }
}

// Get Contact Types from Firestore (one-time fetch)
export async function getContactTypes(): Promise<ContactTypeConfig[]> {
  try {
    const q = query(collection(db, "contactTypes"), orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return DEFAULT_CONTACT_TYPES;
    }
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      value: doc.data().value,
      label: doc.data().label,
      icon: doc.data().icon,
      placeholder: doc.data().placeholder,
      order: doc.data().order,
    }));
  } catch (error) {
    console.error("Error fetching contact types:", error);
    return DEFAULT_CONTACT_TYPES;
  }
}

// Subscribe to Categories (real-time)
export function subscribeToCategories(callback: (categories: CategoryConfig[]) => void) {
  const q = query(collection(db, "categories"), orderBy("order", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        callback(DEFAULT_CATEGORIES);
      } else {
        const categories = snapshot.docs.map((doc) => ({
          id: doc.id,
          value: doc.data().value,
          label: doc.data().label,
          icon: doc.data().icon,
          order: doc.data().order,
        }));
        callback(categories);
      }
    },
    (error) => {
      console.error("Error subscribing to categories:", error);
      callback(DEFAULT_CATEGORIES);
    }
  );
}

// Subscribe to Locations (real-time)
export function subscribeToLocations(callback: (locations: LocationConfig[]) => void) {
  const q = query(collection(db, "locations"), orderBy("order", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        callback(DEFAULT_LOCATIONS);
      } else {
        const locations = snapshot.docs.map((doc) => ({
          id: doc.id,
          value: doc.data().value,
          label: doc.data().label,
          order: doc.data().order,
        }));
        callback(locations);
      }
    },
    (error) => {
      console.error("Error subscribing to locations:", error);
      callback(DEFAULT_LOCATIONS);
    }
  );
}

// Subscribe to Contact Types (real-time)
export function subscribeToContactTypes(callback: (contactTypes: ContactTypeConfig[]) => void) {
  const q = query(collection(db, "contactTypes"), orderBy("order", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        callback(DEFAULT_CONTACT_TYPES);
      } else {
        const contactTypes = snapshot.docs.map((doc) => ({
          id: doc.id,
          value: doc.data().value,
          label: doc.data().label,
          icon: doc.data().icon,
          placeholder: doc.data().placeholder,
          order: doc.data().order,
        }));
        callback(contactTypes);
      }
    },
    (error) => {
      console.error("Error subscribing to contact types:", error);
      callback(DEFAULT_CONTACT_TYPES);
    }
  );
}

// ========================================
// AI Rate Limiting
// ========================================

export interface AIRateLimitResult {
  allowed: boolean;
  remainingMinute: number;
  remainingHour: number;
  resetMinute: Date;
  resetHour: Date;
  message?: string;
}

// Subscribe to AI usage records (for admin dashboard)
export function subscribeToAIUsage(callback: (records: AIUsageRecord[]) => void) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const q = query(
    collection(db, COLLECTIONS.AI_USAGE),
    where('timestamp', '>=', Timestamp.fromDate(thirtyDaysAgo)),
    orderBy('timestamp', 'desc'),
    limit(1000)
  );
  
  return onSnapshot(q, (snapshot) => {
    const records = snapshot.docs.map((doc) => ({
      id: doc.id,
      userId: doc.data().userId,
      endpoint: doc.data().endpoint,
      timestamp: timestampToDate(doc.data().timestamp),
    })) as AIUsageRecord[];
    callback(records);
  }, (error) => {
    console.error('Error subscribing to AI usage:', error);
    callback([]);
  });
}

// Get AI usage stats (for admin)
export async function getAIUsageStats(): Promise<{
  total: number;
  today: number;
  thisWeek: number;
  byEndpoint: Record<string, number>;
  byUser: Record<string, number>;
}> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const q = query(
    collection(db, COLLECTIONS.AI_USAGE),
    where('timestamp', '>=', Timestamp.fromDate(weekAgo)),
    orderBy('timestamp', 'desc')
  );
  
  const snapshot = await getDocs(q);
  const records = snapshot.docs.map((doc) => {
    const data = doc.data() as AIUsageRecord;
    return {
      ...data,
      timestamp: timestampToDate(data.timestamp as unknown as Timestamp),
    };
  });
  
  const byEndpoint: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  let todayCount = 0;
  
  records.forEach((record) => {
    // By endpoint
    byEndpoint[record.endpoint] = (byEndpoint[record.endpoint] || 0) + 1;
    
    // By user
    byUser[record.userId] = (byUser[record.userId] || 0) + 1;
    
    // Today count
    if (record.timestamp >= todayStart) {
      todayCount++;
    }
  });
  
  return {
    total: records.length,
    today: todayCount,
    thisWeek: records.length,
    byEndpoint,
    byUser,
  };
}

// Record AI usage
export async function recordAIUsage(userId: string, endpoint: string = 'ner'): Promise<void> {
  await addDoc(collection(db, COLLECTIONS.AI_USAGE), {
    userId,
    endpoint,
    timestamp: serverTimestamp(),
  });
}

// Check rate limit for a user
export async function checkAIRateLimit(
  userId: string,
  settings: AppSettings
): Promise<AIRateLimitResult> {
  // If rate limit is disabled, allow all requests
  if (!settings.aiRateLimitEnabled) {
    return {
      allowed: true,
      remainingMinute: Infinity,
      remainingHour: Infinity,
      resetMinute: new Date(),
      resetHour: new Date(),
    };
  }

  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Get usage in the last minute
  const minuteQuery = query(
    collection(db, COLLECTIONS.AI_USAGE),
    where('userId', '==', userId),
    where('timestamp', '>=', Timestamp.fromDate(oneMinuteAgo)),
    orderBy('timestamp', 'desc')
  );

  // Get usage in the last hour
  const hourQuery = query(
    collection(db, COLLECTIONS.AI_USAGE),
    where('userId', '==', userId),
    where('timestamp', '>=', Timestamp.fromDate(oneHourAgo)),
    orderBy('timestamp', 'desc')
  );

  const [minuteSnapshot, hourSnapshot] = await Promise.all([
    getDocs(minuteQuery),
    getDocs(hourQuery),
  ]);

  const usageInMinute = minuteSnapshot.size;
  const usageInHour = hourSnapshot.size;

  const limitPerMinute = settings.aiRateLimitPerMinute || 5;
  const limitPerHour = settings.aiRateLimitPerHour || 30;

  const remainingMinute = Math.max(0, limitPerMinute - usageInMinute);
  const remainingHour = Math.max(0, limitPerHour - usageInHour);

  // Calculate reset times
  let resetMinute = new Date(now.getTime() + 60 * 1000);
  let resetHour = new Date(now.getTime() + 60 * 60 * 1000);

  // Find oldest usage to determine actual reset time
  if (minuteSnapshot.size > 0) {
    const oldestMinuteUsage = minuteSnapshot.docs[minuteSnapshot.docs.length - 1];
    const oldestTimestamp = oldestMinuteUsage.data().timestamp?.toDate();
    if (oldestTimestamp) {
      resetMinute = new Date(oldestTimestamp.getTime() + 60 * 1000);
    }
  }

  if (hourSnapshot.size > 0) {
    const oldestHourUsage = hourSnapshot.docs[hourSnapshot.docs.length - 1];
    const oldestTimestamp = oldestHourUsage.data().timestamp?.toDate();
    if (oldestTimestamp) {
      resetHour = new Date(oldestTimestamp.getTime() + 60 * 60 * 1000);
    }
  }

  const allowed = usageInMinute < limitPerMinute && usageInHour < limitPerHour;

  return {
    allowed,
    remainingMinute,
    remainingHour,
    resetMinute,
    resetHour,
    message: allowed ? undefined : settings.aiRateLimitMessage,
  };
}

// Clean up old AI usage records (older than 2 hours)
export async function cleanupOldAIUsage(): Promise<number> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  
  const oldRecordsQuery = query(
    collection(db, COLLECTIONS.AI_USAGE),
    where('timestamp', '<', Timestamp.fromDate(twoHoursAgo)),
    limit(500) // Batch limit
  );

  const snapshot = await getDocs(oldRecordsQuery);
  
  const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
  await Promise.all(deletePromises);

  return snapshot.size;
}

// ========================================
// NFC Tags
// ========================================

function mapNfcTagFromFirestore(id: string, data: DocumentData): NfcTag {
  return {
    id,
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
    registeredAt: timestampToDate(data.registeredAt),
    updatedAt: timestampToDate(data.updatedAt),
  };
}

function mapNfcFoundReportFromFirestore(id: string, data: DocumentData): NfcFoundReport {
  return {
    id,
    tagId: data.tagId,
    ownerId: data.ownerId,
    finderUserId: data.finderUserId,
    finderMessage: data.finderMessage,
    locationFound: data.locationFound,
    locationCoords: data.locationCoords,
    finderContacts: data.finderContacts,
    status: data.status,
    createdAt: timestampToDate(data.createdAt),
  };
}

export async function getNfcTagById(tagId: string): Promise<NfcTag | null> {
  const docRef = doc(db, COLLECTIONS.NFC_TAGS, tagId.toUpperCase());
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return mapNfcTagFromFirestore(docSnap.id, docSnap.data());
}

export async function getNfcTagsByOwnerId(ownerId: string): Promise<NfcTag[]> {
  const q = query(
    collection(db, COLLECTIONS.NFC_TAGS),
    where('ownerId', '==', ownerId),
    orderBy('registeredAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => mapNfcTagFromFirestore(d.id, d.data()));
}

export function subscribeToNfcTagsByOwnerId(
  ownerId: string,
  callback: (tags: NfcTag[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTIONS.NFC_TAGS),
    where('ownerId', '==', ownerId),
    orderBy('registeredAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => mapNfcTagFromFirestore(d.id, d.data())));
  });
}

export async function updateNfcTag(
  tagId: string,
  data: Partial<Omit<NfcTag, 'id' | 'registeredAt'>>
): Promise<void> {
  const docRef = doc(db, COLLECTIONS.NFC_TAGS, tagId.toUpperCase());
  await updateDoc(docRef, stripUndefined({
    ...data,
    updatedAt: serverTimestamp(),
  }));
}

export async function createNfcFoundReport(
  data: Omit<NfcFoundReport, 'id' | 'createdAt'>
): Promise<string> {
  const docRef = await addDoc(
    collection(db, COLLECTIONS.NFC_FOUND_REPORTS),
    stripUndefined({
      ...data,
      createdAt: serverTimestamp(),
    })
  );
  return docRef.id;
}

export async function getNfcFoundReportsByTagId(tagId: string): Promise<NfcFoundReport[]> {
  const q = query(
    collection(db, COLLECTIONS.NFC_FOUND_REPORTS),
    where('tagId', '==', tagId.toUpperCase()),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => mapNfcFoundReportFromFirestore(d.id, d.data()));
}

export function subscribeToNfcFoundReportsByOwnerId(
  ownerId: string,
  callback: (reports: NfcFoundReport[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTIONS.NFC_FOUND_REPORTS),
    where('ownerId', '==', ownerId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => mapNfcFoundReportFromFirestore(d.id, d.data())));
  });
}

export async function updateNfcFoundReport(
  reportId: string,
  data: Partial<Pick<NfcFoundReport, 'status'>>
): Promise<void> {
  const docRef = doc(db, COLLECTIONS.NFC_FOUND_REPORTS, reportId);
  await updateDoc(docRef, stripUndefined(data));
}

export async function getAllNfcTags(limitCount = 200): Promise<NfcTag[]> {
  const q = query(
    collection(db, COLLECTIONS.NFC_TAGS),
    orderBy('registeredAt', 'desc'),
    limit(limitCount)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => mapNfcTagFromFirestore(d.id, d.data()));
}
