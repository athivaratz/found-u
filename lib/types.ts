// Types สำหรับระบบ BD2Fondue

// User Role
export type UserRole = 'user' | 'admin';

// Beta Tester Status
export type BetaStatus = 'none' | 'pending' | 'approved' | 'rejected';

// App Settings (สำหรับ Admin ตั้งค่า)
export interface AppSettings {
  // Beta/Restrict Mode
  restrictModeEnabled: boolean; // เปิด/ปิด ระบบ Restrict (Testing)
  betaRequestsEnabled: boolean; // เปิด/ปิด ให้ขอสิทธิ์ได้
  betaClosedMessage: string; // ข้อความเมื่อปิดรับสมัคร
  
  // OG Tags
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;

  // AI Rate Limit Settings (Per User)
  aiRateLimitEnabled?: boolean; // เปิด/ปิดระบบ rate limit
  aiRateLimitPerMinute?: number; // จำนวนครั้งต่อนาที per user
  aiRateLimitPerHour?: number; // จำนวนครั้งต่อชั่วโมง per user
  aiRateLimitMessage?: string; // ข้อความเมื่อถูก limit

  // System-wide AI Rate Limit (ทั้งระบบรวมกัน)
  systemAiRateLimitEnabled?: boolean; // เปิด/ปิด rate limit ระดับระบบ
  systemAiRateLimitPerMinute?: number; // จำนวนครั้งต่อนาทีของทั้งระบบ
  systemAiRateLimitPerHour?: number; // จำนวนครั้งต่อชั่วโมงของทั้งระบบ

  // AI Model Settings
  aiNerModel?: string; // โมเดลสำหรับ NER
  aiNerTemperature?: number;
  aiNerTopP?: number;
  aiNerMaxOutputTokens?: number;
  aiMatchingModel?: string; // โมเดลสำหรับ Matching
  aiMatchingTemperature?: number;
  aiMatchingTopP?: number;
  aiMatchingMaxOutputTokens?: number;

  // AI Vision Model Settings
  aiVisionModel?: string; // โมเดลสำหรับ Vision
  aiVisionTemperature?: number;
  aiVisionTopP?: number;
  aiVisionMaxOutputTokens?: number;

  // Map & Geofence Settings
  mapsEnabled?: boolean;
  mapTileUrl?: string;
  mapAttribution?: string;
  mapDefaultCenter?: GeoPoint;
  mapDefaultZoom?: number;
  mapSchoolBoundary?: GeoPoint[]; // Polygon points
  mapEnforceFoundInSchool?: boolean;

  // Notification settings
  notifyOnNewReport?: boolean;
  notifyOnStatusChange?: boolean;
  requireApproval?: boolean;

  // Storage settings
  autoDeleteDays?: number; // 0 = ไม่ลบอัตโนมัติ
  maxImageSize?: number; // MB สูงสุดก่อนอัปโหลด
  compressionQuality?: number; // 0.1–1 สำหรับบีบอัดรูป

  // NFC Tag settings
  nfcEnabled?: boolean;
  nfcPublicBaseUrl?: string;
  nfcRequireLoginToReport?: boolean;

  // Other settings
  updatedAt?: Date;
  updatedBy?: string;
}

// Default settings
export const DEFAULT_APP_SETTINGS: AppSettings = {
  restrictModeEnabled: true,
  betaRequestsEnabled: true,
  betaClosedMessage: "ขออภัย รอบนี้ปิดรับสมัครแล้ว กรุณารอรอบถัดไป",
  ogTitle: "BD2Fondue | ระบบแจ้งของหาย-ของเจอ",
  ogDescription: "ระบบแจ้งของหายและของเจอสำหรับโรงเรียน โดยนร.บด.๒ - แจ้งง่าย ติดตามสะดวก",
  aiRateLimitEnabled: true,
  aiRateLimitPerMinute: 5,
  aiRateLimitPerHour: 30,
  aiRateLimitMessage: "คุณใช้งาน AI บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  systemAiRateLimitEnabled: true,
  systemAiRateLimitPerMinute: 20,
  systemAiRateLimitPerHour: 100,
  aiNerModel: "gemini-1.5-flash",
  aiNerTemperature: 0.1,
  aiNerTopP: 0.8,
  aiNerMaxOutputTokens: 256,
  aiMatchingModel: "gemini-1.5-flash",
  aiMatchingTemperature: 0.1,
  aiMatchingTopP: 0.8,
  aiMatchingMaxOutputTokens: 200,
  aiVisionModel: "gemini-1.5-flash",
  aiVisionTemperature: 0.1,
  aiVisionTopP: 0.8,
  aiVisionMaxOutputTokens: 256,
  mapsEnabled: true,
  mapTileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  mapAttribution: "© OpenStreetMap contributors",
  mapDefaultCenter: { lat: 13.7563, lng: 100.5018 },
  mapDefaultZoom: 17,
  mapSchoolBoundary: [],
  mapEnforceFoundInSchool: true,
  notifyOnNewReport: true,
  notifyOnStatusChange: true,
  requireApproval: false,
  autoDeleteDays: 30,
  maxImageSize: 5,
  compressionQuality: 0.8,
  nfcEnabled: true,
  nfcRequireLoginToReport: true,
};

// AI Rate Limit Usage Record
export interface AIUsageRecord {
  id: string;
  userId: string;
  timestamp: Date;
  endpoint: string; // 'ner' | 'match' etc.
}

// User Ban Status
export type BanStatus = 'none' | 'banned' | 'timeout';

// User ในระบบ
export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  betaStatus: BetaStatus; // สถานะ Beta Tester
  betaRequestedAt?: Date; // วันที่ขอสิทธิ์
  betaApprovedAt?: Date; // วันที่ได้รับอนุมัติ
  hasSeenTutorial?: boolean; // เคยดู Tutorial แล้วหรือยัง
  // Ban/Timeout fields
  banStatus?: BanStatus; // สถานะการแบน
  banReason?: string; // เหตุผลการแบน
  bannedAt?: Date; // วันที่ถูกแบน
  bannedBy?: string; // Admin ที่แบน
  timeoutUntil?: Date; // Timeout จนถึงวันที่
  createdAt: Date;
  updatedAt: Date;
}

// Error Log สำหรับเก็บ Errors ในระบบ
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorSource = 'client' | 'server' | 'api' | 'firebase' | 'unknown';

export interface ErrorLog {
  id: string;
  message: string;
  stack?: string;
  severity: ErrorSeverity;
  source: ErrorSource;
  url?: string;
  userId?: string;
  userEmail?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  resolved?: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  createdAt: Date;
}

// ช่องทางการติดต่อ
export type ContactType = 'phone' | 'line' | 'instagram' | 'facebook' | 'email';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export type LocationSource = 'gps' | 'map' | 'manual';

export interface LocationCoords extends GeoPoint {
  accuracy?: number;
  source?: LocationSource;
}

export interface ContactInfo {
  type: ContactType;
  value: string;
}

export const CONTACT_TYPES: { value: ContactType; label: string; icon: string; placeholder: string }[] = [
  { value: 'phone', label: 'เบอร์โทรศัพท์', icon: '📞', placeholder: '0812345678' },
  { value: 'line', label: 'LINE ID', icon: '💬', placeholder: '@lineid' },
  { value: 'instagram', label: 'Instagram', icon: '📷', placeholder: '@username' },
  { value: 'facebook', label: 'Facebook', icon: '📘', placeholder: 'ชื่อ Facebook' },
  { value: 'email', label: 'Email', icon: '📧', placeholder: 'email@example.com' },
];

// ประเภทของที่หาย
export type ItemCategory =
  | "wallet"      // กระเป๋าสตางค์
  | "phone"       // โทรศัพท์
  | "keys"        // กุญแจ
  | "bag"         // กระเป๋า
  | "electronics" // อุปกรณ์อิเล็กทรอนิกส์
  | "documents"   // เอกสาร
  | "clothing"    // เสื้อผ้า
  | "accessories" // เครื่องประดับ
  | "other";      // อื่นๆ

// สถานะของรายการ
export type ItemStatus =
  | "searching"   // กำลังตามหา
  | "found"       // เจอแล้ว
  | "claimed"     // รับคืนแล้ว
  | "expired";    // หมดอายุ

// สถานที่รับคืน
export type DropOffLocation =
  | "admin_office"  // ห้องธุรการ
  | "canteen"       // โรงอาหาร
  | "library"       // ห้องสมุด
  | "security"      // ห้องรปภ.
  | "other";        // อื่นๆ

// NFC Tag status
export type NfcTagStatus = "active" | "lost" | "returned" | "disabled";

export interface NfcTag {
  id: string;
  tagUid?: string;
  ownerId: string;
  itemName: string;
  category: ItemCategory;
  description?: string;
  contacts: ContactInfo[];
  status: NfcTagStatus;
  readOnlyLocked: boolean;
  lostItemId?: string;
  lastFoundReportId?: string;
  registeredAt: Date;
  updatedAt: Date;
}

export type NfcFoundReportStatus = "pending" | "viewed" | "resolved";

export interface NfcFoundReport {
  id: string;
  tagId: string;
  ownerId: string;
  finderUserId: string;
  finderMessage: string;
  locationFound?: string;
  locationCoords?: LocationCoords;
  finderContacts?: ContactInfo[];
  status: NfcFoundReportStatus;
  createdAt: Date;
}

export const NFC_TAG_STATUS_CONFIG: Record<
  NfcTagStatus,
  { label: string; color: string; bgColor: string }
> = {
  active: {
    label: "ใช้งานปกติ",
    color: "text-[#06C755] dark:text-[#4ade80]",
    bgColor: "bg-[#e8f8ef] dark:bg-[#06C755]/20",
  },
  lost: {
    label: "แจ้งของหายแล้ว",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-900/30",
  },
  returned: {
    label: "ได้รับคืนแล้ว",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/30",
  },
  disabled: {
    label: "ปิดใช้งาน",
    color: "text-red-500 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-900/30",
  },
};

// รายการของหาย
export interface LostItem {
  id: string;
  trackingCode: string;
  itemName: string;
  category: ItemCategory;
  description?: string;
  locationLost: string;
  locationPlaceName?: string;
  locationCoords?: LocationCoords;
  dateLost: Date;
  contacts: ContactInfo[]; // ช่องทางการติดต่อ
  userId?: string; // Firebase Auth UID
  status: ItemStatus;
  createdAt: Date;
  updatedAt: Date;
  matchedFoundId?: string; // ID ของ FoundItem ที่ match
}

// รายการของเจอ
export interface FoundItem {
  id: string;
  trackingCode: string;
  photoUrl?: string;
  itemName?: string;
  category?: ItemCategory;
  color?: string | null;
  brand?: string | null;
  description: string;
  locationFound: string;
  locationPlaceName?: string;
  locationCoords?: LocationCoords;
  dateFound: Date;
  dropOffLocation: DropOffLocation;
  finderContacts?: ContactInfo[]; // ช่องทางการติดต่อผู้เจอ
  userId?: string; // Firebase Auth UID
  status: ItemStatus;
  createdAt: Date;
  updatedAt: Date;
  matchedLostId?: string; // ID ของ LostItem ที่ match
}

/** Discriminate lost vs found — do not use `itemName` (found items may have it from AI). */
export function isLostItem(item: LostItem | FoundItem): item is LostItem {
  return "locationLost" in item;
}

export function isFoundItem(item: LostItem | FoundItem): item is FoundItem {
  return "locationFound" in item;
}

export function getItemDisplayName(item: LostItem | FoundItem): string {
  if (isLostItem(item)) return item.itemName;
  return item.itemName?.trim() || item.description;
}

// ข้อมูล Category สำหรับแสดงผล
export const CATEGORIES: { value: ItemCategory; label: string; icon: string }[] = [
  { value: "wallet", label: "กระเป๋าสตางค์", icon: "💰" },
  { value: "phone", label: "โทรศัพท์", icon: "📱" },
  { value: "keys", label: "กุญแจ", icon: "🔑" },
  { value: "bag", label: "กระเป๋า", icon: "👜" },
  { value: "electronics", label: "อิเล็กทรอนิกส์", icon: "💻" },
  { value: "documents", label: "เอกสาร", icon: "📄" },
  { value: "clothing", label: "เสื้อผ้า", icon: "👕" },
  { value: "accessories", label: "เครื่องประดับ", icon: "💍" },
  { value: "other", label: "อื่นๆ", icon: "📦" },
];

// ข้อมูล Drop-off Location
export const DROP_OFF_LOCATIONS: { value: DropOffLocation; label: string }[] = [
  { value: "admin_office", label: "ห้องธุรการ" },
  { value: "canteen", label: "โรงอาหาร" },
  { value: "library", label: "ห้องสมุด" },
  { value: "security", label: "ห้องรปภ." },
  { value: "other", label: "อื่นๆ" },
];

// สถานะสำหรับแสดงผล
export const STATUS_CONFIG: Record<ItemStatus, { label: string; color: string; bgColor: string }> = {
  searching: {
    label: "กำลังตามหา",
    color: "text-gray-600 dark:text-gray-300",
    bgColor: "bg-gray-100 dark:bg-gray-800"
  },
  found: {
    label: "เจอแล้ว",
    color: "text-[#06C755] dark:text-[#4ade80]",
    bgColor: "bg-[#e8f8ef] dark:bg-[#06C755]/20"
  },
  claimed: {
    label: "รับคืนแล้ว",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/30"
  },
  expired: {
    label: "หมดอายุ",
    color: "text-red-500 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-900/30"
  },
};
