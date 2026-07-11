"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Camera, Clock } from "lucide-react";
import { useAppMode } from "@/contexts/app-mode-context";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/home", icon: Home, label: "หน้าแรก" },
  { href: "/lost", icon: Search, label: "แจ้งของหาย" },
  { href: "/found", icon: Camera, label: "แจ้งเจอของ" },
  { href: "/tracking", icon: Clock, label: "ติดตาม" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { setMode } = useAppMode();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 safe-bottom md:hidden bg-bg-primary border-t border-border-light"
      style={{ height: "var(--bottom-nav-height)" }}
      aria-label="เมนูหลัก"
    >
      <div className="flex h-full items-stretch justify-around px-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMode("classic", { navigate: false })}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2 min-h-[var(--bottom-nav-height)]",
                "rounded-xl transition-colors duration-200",
                isActive ? "text-line-green" : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center p-2 rounded-full transition-colors",
                  isActive && "bg-line-green-light"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
              </span>
              <span className={cn("text-xs font-medium leading-none", isActive && "text-line-green")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
