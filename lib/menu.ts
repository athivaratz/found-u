import { Search, Camera, Clock, Package, Radio } from "lucide-react";

export const menuItems = [
  {
    href: "/home",
    icon: Package,
    title: "หน้าแรก",
    subtitle: "กลับไปหน้าหลัก",
    color: "bg-bg-secondary",
    iconColor: "text-text-secondary",
  },
  {
    href: "/lost",
    icon: Search,
    title: "แจ้งของหาย",
    subtitle: "รายงานของที่หายไป",
    color: "bg-status-error-light",
    iconColor: "text-status-error",
  },
  {
    href: "/found",
    icon: Camera,
    title: "แจ้งเจอของ",
    subtitle: "รายงานของที่เก็บได้",
    color: "bg-line-green-light",
    iconColor: "text-line-green",
  },
  {
    href: "/nfc",
    icon: Radio,
    title: "สแกน NFC",
    subtitle: "ลงทะเบียนและสแกนแท็ก",
    color: "bg-status-info-light",
    iconColor: "text-status-info",
  },
  {
    href: "/tracking",
    icon: Clock,
    title: "ติดตามสถานะ",
    subtitle: "ดูรหัสติดตามของคุณ",
    color: "bg-bg-tertiary",
    iconColor: "text-text-secondary",
  },
];
