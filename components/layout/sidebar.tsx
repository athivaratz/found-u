"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import { Settings, Shield, LogOut, Sun, Moon, LogIn } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { menuItems } from "@/lib/menu";
import { getUserShownName } from "@/lib/user-display";
import { UserAvatar } from "@/components/user/user-avatar";
import { cn } from "@/lib/utils";
import { AUTH_ROUTES } from "@/lib/auth-routes";
import { ModeSwitcher } from "@/components/agent/mode-switcher";
import { shellSidebarWidth } from "@/components/layout/shell-layout";

export default function Sidebar() {
  const pathname = usePathname();
  const { user, appUser, loading: authLoading, isAdmin, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const themeMounted = useMounted();
  const isDarkTheme = themeMounted && resolvedTheme === "dark";

  const handleSignIn = async () => {
    try {
      window.location.assign(AUTH_ROUTES.hub);
    } catch (error) {
      console.error("Error signing in:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  return (
    <aside
      className={cn(
        shellSidebarWidth,
        "bg-bg-card border-r border-border-light fixed left-0 top-0 h-screen overflow-y-auto",
        "hidden md:flex flex-col z-50"
      )}
    >
      <div className="flex flex-col gap-5 p-6 border-b border-border-light">
        <Link href="/home" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Found-U"
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
          />
          <div>
            <h1 className="text-lg font-bold text-text-primary">Found-U</h1>
            <p className="text-xs text-text-secondary">Lost & Found</p>
          </div>
        </Link>

        <div className="flex justify-center">
          <ModeSwitcher variant="compact" />
        </div>

        <div className="bg-bg-secondary rounded-xl p-3 min-h-16 flex items-center">
          {authLoading && !user ? (
            <div className="flex items-center gap-3 w-full" aria-hidden>
              <div className="h-10 w-10 rounded-full bg-bg-tertiary animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-28 rounded bg-bg-tertiary animate-pulse" />
                <div className="h-3 w-36 rounded bg-bg-tertiary animate-pulse" />
              </div>
            </div>
          ) : user ? (
            <div className="flex items-center gap-3 w-full min-w-0">
              <UserAvatar user={user} appUser={appUser} />
              <p className="font-medium text-text-primary text-sm truncate">
                {getUserShownName(appUser, user)}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              className="w-full px-4 py-2.5 bg-line-green hover:bg-line-green-hover text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              เข้าสู่ระบบ
            </button>
          )}
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-2 p-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "px-4 py-3 rounded-lg transition-colors cursor-pointer group",
                  isActive ? "bg-line-green/10" : "bg-bg-secondary hover:bg-bg-tertiary"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      "w-5 h-5 shrink-0 transition-colors",
                      isActive
                        ? "text-line-green"
                        : "text-text-secondary group-hover:text-line-green"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "font-medium text-sm transition-colors",
                        isActive ? "text-line-green" : "text-text-primary"
                      )}
                    >
                      {item.title}
                    </p>
                    <p className="text-xs text-text-secondary">{item.subtitle}</p>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 p-4 border-t border-border-light">
        {user ? (
          <Link href="/settings">
            <div className="px-4 py-2.5 rounded-lg bg-bg-secondary hover:bg-bg-tertiary text-text-primary text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer">
              <Settings className="w-4 h-4 shrink-0" />
              ตั้งค่า
            </div>
          </Link>
        ) : null}
        {isAdmin ? (
          <Link href="/admin">
            <div className="px-4 py-2.5 rounded-lg bg-bg-secondary hover:bg-bg-tertiary text-text-primary text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer">
              <Shield className="w-4 h-4 shrink-0" />
              Admin Panel
            </div>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => setTheme(isDarkTheme ? "light" : "dark")}
          className="w-full px-4 py-2.5 rounded-lg bg-bg-secondary hover:bg-bg-tertiary text-text-primary text-sm font-medium flex items-center gap-2 transition-colors"
          aria-label="สลับโหมดสว่าง/มืด"
        >
          {themeMounted ? (
            isDarkTheme ? (
              <>
                <Sun className="w-4 h-4 shrink-0" />
                Light Mode
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 shrink-0" />
                Dark Mode
              </>
            )
          ) : (
            <>
              <span className="w-4 h-4 shrink-0" aria-hidden />
              โหมดสี
            </>
          )}
        </button>
        {user ? (
          <button
            type="button"
            onClick={handleLogout}
            className="w-full px-4 py-2.5 rounded-lg bg-status-error-light hover:bg-status-error/10 text-status-error text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            ออกจากระบบ
          </button>
        ) : null}
      </div>
    </aside>
  );
}
