import type { LucideIcon } from "lucide-react";
import {
  Package,
  Settings,
  BarChart3,
  FileText,
  Shield,
  Tags,
  Sparkles,
  Bot,
  Users,
  UserX,
  AlertTriangle,
  Radio,
  MapPin,
} from "lucide-react";

export type AdminNavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  defaultOpen?: boolean;
  items: AdminNavItem[];
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    id: "overview",
    label: "ภาพรวม",
    defaultOpen: true,
    items: [
      { href: "/admin", icon: BarChart3, label: "ภาพรวม", description: "สถิติและข้อมูลทั่วไป" },
    ],
  },
  {
    id: "records",
    label: "รายการและผู้ใช้",
    defaultOpen: true,
    items: [
      { href: "/admin/items", icon: Package, label: "จัดการรายการ", description: "ของหาย/ของเจอ" },
      { href: "/admin/students", icon: Users, label: "นักเรียน", description: "CSV และ whitelist" },
      { href: "/admin/users", icon: UserX, label: "จัดการผู้ใช้", description: "Ban/Timeout" },
      { href: "/admin/matching", icon: Sparkles, label: "Matching", description: "จับคู่ของหาย-ของเจอ" },
    ],
  },
  {
    id: "content",
    label: "เนื้อหาและอุปกรณ์",
    items: [
      { href: "/admin/nfc", icon: Radio, label: "NFC Tags", description: "จัดการแท็ก NFC" },
      { href: "/admin/categories", icon: Tags, label: "หมวดหมู่", description: "เพิ่ม/ลบหมวดหมู่" },
      { href: "/admin/moderation", icon: Shield, label: "Moderation", description: "ตรวจสอบและอนุมัติ" },
    ],
  },
  {
    id: "system",
    label: "ระบบ",
    items: [
      { href: "/admin/logs", icon: FileText, label: "Logs", description: "ประวัติการใช้งาน" },
      { href: "/admin/error-logs", icon: AlertTriangle, label: "Error Logs", description: "Errors ในระบบ" },
      { href: "/admin/ai", icon: Bot, label: "AI", description: "โมเดลและการทดสอบ" },
      { href: "/admin/maps", icon: MapPin, label: "แผนที่และ GPS", description: "ขอบเขตและแผนที่" },
      { href: "/admin/settings", icon: Settings, label: "ตั้งค่าระบบ", description: "System Settings" },
    ],
  },
];

export function isAdminNavActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
