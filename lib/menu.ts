import { Search, Camera, Clock, Package, Radio } from "lucide-react";

export const menuItems = [
  {
    href: "/",
    icon: Package,
    title: "หน้าแรก",
    subtitle: "Home",
    color: "bg-bg-secondary",
    iconColor: "text-text-secondary",
  },
  {
    href: "/lost",
    icon: Search,
    title: "แจ้งของหาย",
    subtitle: "I Lost Something",
    color: "bg-status-error-light",
    iconColor: "text-status-error",
  },
  {
    href: "/found",
    icon: Camera,
    title: "แจ้งเจอของ",
    subtitle: "I Found Something",
    color: "bg-line-green-light",
    iconColor: "text-line-green",
  },
  {
    href: "/nfc",
    icon: Radio,
    title: "NFC Tag",
    subtitle: "Register & Scan",
    color: "bg-purple-50 dark:bg-purple-900/20",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  {
    href: "/tracking",
    icon: Clock,
    title: "ติดตามสถานะ",
    subtitle: "Track Status",
    color: "bg-status-info-light",
    iconColor: "text-status-info",
  },
];
