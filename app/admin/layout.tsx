"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "next-themes";
import {
  Package,
  Home,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  Loader2,
  ChevronRight,
  UserCog,
  Shield,
} from "lucide-react";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { adminNavGroups, isAdminNavActive } from "@/lib/admin-nav";
import { UserAvatar } from "@/components/user/user-avatar";
import { getUserShownName } from "@/lib/user-display";
import { cn } from "@/lib/utils";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, appUser, loading: authLoading, isAdmin, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else if (!isAdmin) {
        router.push("/home");
      }
    }
  }, [user, authLoading, isAdmin, router]);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#06C755] mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">กำลังตรวจสอบสิทธิ์...</p>
        </div>
      </div>
    );
  }

  // Not authorized
  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            ไม่มีสิทธิ์เข้าถึง
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            คุณไม่มีสิทธิ์เข้าถึงหน้า Admin
          </p>
          <Link
            href="/home"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#06C755] text-white rounded-full font-medium hover:bg-[#05b34d] transition-colors"
          >
            <Home className="w-5 h-5" />
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Menu className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="font-bold text-gray-900 dark:text-white">Admin Panel</h1>
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="w-5 h-5 text-yellow-500" />
            ) : (
              <Moon className="w-5 h-5 text-gray-600" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="overlay-modal lg:hidden fixed inset-0 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-full w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-50 transform transition-transform duration-300",
          "lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#06C755] flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-gray-900 dark:text-white">Admin Panel</h1>
                <p className="text-xs text-gray-500">Found-U</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 pb-4 space-y-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
          {adminNavGroups.map((group) => {
            const groupActive = group.items.some((item) =>
              isAdminNavActive(pathname, item.href)
            );
            return (
              <CollapsibleSection
                key={group.id}
                title={group.label}
                defaultOpen={group.defaultOpen ?? groupActive}
                storageKey={`admin-nav-${group.id}`}
                className="border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30"
                headerClassName="py-2.5 text-sm"
              >
                <div className="space-y-0.5 pt-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = isAdminNavActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group",
                          isActive
                            ? "bg-[#e8f8ef] text-[#06C755] dark:bg-[#06C755]/20"
                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm block truncate">{item.label}</span>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                            {item.description}
                          </p>
                        </div>
                        <ChevronRight
                          className={cn(
                            "w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
                            isActive && "opacity-100"
                          )}
                        />
                      </Link>
                    );
                  })}
                </div>
              </CollapsibleSection>
            );
          })}

          <div className="py-4 border-t border-gray-200 dark:border-gray-700 mt-4">
            <Link
              href="/home"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            >
              <Home className="w-5 h-5" />
              <span>กลับหน้าหลัก</span>
            </Link>
          </div>
        </nav>

        {/* Theme Toggle */}
        <div className="absolute bottom-24 left-0 right-0 px-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
            <span className="text-sm text-gray-600 dark:text-gray-400">โหมดมืด</span>
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="p-2 rounded-lg bg-white dark:bg-gray-600 shadow-sm hover:shadow transition-shadow"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="w-4 h-4 text-yellow-500" />
              ) : (
                <Moon className="w-4 h-4 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {/* User Info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-2">
          <Link
            href="/settings"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <UserCog className="w-4 h-4" />
            <span>ตั้งค่าบัญชี</span>
          </Link>
          <div className="flex items-center gap-3">
            <UserAvatar user={user} appUser={appUser} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {getUserShownName(appUser, user)}
              </p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="ออกจากระบบ"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-72 pt-16 lg:pt-0 min-h-screen">
        {children}
      </main>
    </div>
  );
}
