"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Package,
  ChevronRight,
  Moon,
  Sun,
  LogIn,
  LogOut,
  User,
  Settings,
} from "lucide-react";
import BottomNav from "@/components/layout/bottom-nav";
import Sidebar from "@/components/layout/sidebar";
import { ModeSwitcher } from "@/components/agent/mode-switcher";
import { useAuth } from "@/contexts/auth-context";
import { getUserShownName } from "@/lib/user-display";
import { UserAvatar } from "@/components/user/user-avatar";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll";
import { cn } from "@/lib/utils";
import { AUTH_ROUTES } from "@/lib/auth-routes";
import { menuItems } from "@/lib/menu";
import { DashboardListSkeleton } from "@/components/layout/app-shell-skeleton";
import {
  shellMobileOnly,
  shellSidebarInset,
} from "@/components/layout/shell-layout";

const HomeDashboardSection = dynamic(
  () =>
    import("@/components/home/home-dashboard-section").then(
      (mod) => mod.HomeDashboardSection
    ),
  {
    loading: () => (
      <section className="mt-8 min-h-[16rem]" aria-busy="true">
        <DashboardListSkeleton rows={3} />
      </section>
    ),
  }
);

function UserNameSlot({
  user,
  welcomeName,
}: {
  user: ReturnType<typeof useAuth>["user"];
  welcomeName: string;
}) {
  if (!user) return null;

  return (
    <span className="inline-block min-w-[4ch]">
      {`, ${welcomeName}`}
    </span>
  );
}

function HomeQuickMenu({ className }: { className?: string }) {
  // Always single column — this menu is mobile-only; a 2-col grid on
  // misreported viewports (≥640px CSS) is what makes phones look "squeezed".
  return (
    <nav
      className={cn("grid grid-cols-1 gap-3 w-full max-w-full", className)}
      aria-label="เมนูด่วน"
    >
      {menuItems
        .filter((m) => m.href !== "/home")
        .map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group block w-full rounded-xl min-h-14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/35 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
            >
              <div className="bg-bg-card rounded-xl p-4 border border-border-light group-hover:border-border-medium transition-colors duration-200 motion-safe:group-active:scale-[0.99]">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                      item.color
                    )}
                  >
                    <Icon className={cn("w-6 h-6", item.iconColor)} aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium leading-[1.4] text-text-primary text-balance">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-[1.5] text-text-secondary line-clamp-1">
                      {item.subtitle}
                    </p>
                  </div>
                  <ChevronRight
                    className="w-5 h-5 text-text-tertiary shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
                    aria-hidden
                  />
                </div>
              </div>
            </Link>
          );
        })}
    </nav>
  );
}

export default function Home() {
  const { user, appUser, loading: authLoading, isAdmin, logout, appSettings } =
    useAuth();
  const welcomeName = getUserShownName(appUser, user);
  const { resolvedTheme, setTheme } = useTheme();
  const themeMounted = useMounted();
  const isDarkTheme = themeMounted && resolvedTheme === "dark";

  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuButtonRef = useRef<HTMLButtonElement>(null);
  const userMenuPanelRef = useRef<HTMLDivElement>(null);
  const [userMenuPos, setUserMenuPos] = useState({ top: 0, left: 0 });

  useFocusTrap(userMenuPanelRef, { active: showUserMenu });
  useLockBodyScroll(showUserMenu);

  useEffect(() => {
    if (!showUserMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowUserMenu(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showUserMenu]);

  useEffect(() => {
    if (!showUserMenu) return;
    const MENU_WIDTH = 176; // 11rem — compact popover
    const GUTTER = 12;
    const updatePos = () => {
      const el = userMenuButtonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const left = Math.min(
        Math.max(GUTTER, rect.right - MENU_WIDTH),
        vw - MENU_WIDTH - GUTTER
      );
      setUserMenuPos({
        top: rect.bottom + 8,
        left,
      });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [showUserMenu]);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "สวัสดีตอนเช้า" : hour < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";

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
      setShowUserMenu(false);
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const dashboardProps = {
    userId: user?.uid,
    authLoading,
    nfcEnabled: appSettings.nfcEnabled !== false,
    onSignIn: handleSignIn,
  };

  return (
    <div
      className={cn(
        "bg-bg-primary transition-colors w-full max-w-full overflow-x-clip",
        "min-h-dvh flex flex-col",
        "shell-desktop:min-h-screen shell-desktop:flex-row"
      )}
    >
      <Sidebar />

      <div
        className={cn(
          "flex flex-1 flex-col min-w-0 w-full max-w-full main-with-bottom-nav",
          shellSidebarInset
        )}
      >
        <header
          className={cn(
            shellMobileOnly,
            "relative z-20 bg-line-green text-white safe-top shrink-0 w-full"
          )}
        >
          <div className="px-4 sm:px-5 pt-4 pb-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-white" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-white/90 text-sm leading-snug">{greeting}</p>
                  <h1 className="text-white text-lg font-semibold min-h-[1.5rem] truncate text-balance leading-tight">
                    {authLoading && !user ? (
                      <span
                        className="inline-block h-5 w-28 rounded bg-white/20 animate-pulse align-middle"
                        aria-hidden
                      />
                    ) : user ? (
                      welcomeName
                    ) : (
                      "Found-U"
                    )}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setTheme(isDarkTheme ? "light" : "dark")}
                  className="flex items-center justify-center min-w-11 min-h-11 rounded-full bg-white/20 hover:bg-white/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  aria-label={isDarkTheme ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
                >
                  {themeMounted ? (
                    isDarkTheme ? (
                      <Sun className="w-5 h-5 text-white" aria-hidden />
                    ) : (
                      <Moon className="w-5 h-5 text-white" aria-hidden />
                    )
                  ) : (
                    <span className="block w-5 h-5" aria-hidden />
                  )}
                </button>

                {authLoading && !user ? (
                  <div
                    className="w-11 h-11 rounded-full bg-white/20 animate-pulse shrink-0"
                    aria-hidden
                  />
                ) : user ? (
                  <button
                    ref={userMenuButtonRef}
                    type="button"
                    onClick={() => setShowUserMenu((open) => !open)}
                    className="flex items-center justify-center w-11 h-11 rounded-full overflow-hidden border-2 border-white/30 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    aria-label="เมนูผู้ใช้"
                    aria-expanded={showUserMenu}
                    aria-haspopup="menu"
                    aria-controls={showUserMenu ? "home-user-menu" : undefined}
                  >
                    <UserAvatar
                      user={user}
                      appUser={appUser}
                      size={40}
                      className="w-full h-full rounded-full object-cover"
                      iconClassName="w-5 h-5 text-white"
                      fallbackClassName="w-full h-full bg-white/20 text-white"
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSignIn}
                    className="flex items-center justify-center gap-2 min-h-11 px-4 rounded-full bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    <LogIn className="w-4 h-4" aria-hidden />
                    <span className="hidden sm:inline">เข้าสู่ระบบ</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-center">
              <ModeSwitcher variant="compact" tone="on-accent" />
            </div>
          </div>
        </header>

        {themeMounted &&
          showUserMenu &&
          createPortal(
            <>
              <button
                type="button"
                tabIndex={-1}
                className="overlay-modal fixed inset-0 cursor-default bg-black/40"
                onClick={() => setShowUserMenu(false)}
                aria-label="ปิดเมนูผู้ใช้"
              />
              <div
                id="home-user-menu"
                ref={userMenuPanelRef}
                role="menu"
                aria-label="เมนูผู้ใช้"
                className="overlay-modal-top fixed w-44 bg-bg-card text-text-primary rounded-xl shadow-card border border-border-light overflow-hidden animate-fade-in"
                style={{
                  top: userMenuPos.top,
                  left: userMenuPos.left,
                  width: "11rem",
                  maxWidth: "11rem",
                }}
              >
                <div className="px-3 py-2.5 border-b border-border-light">
                  <p className="text-sm font-medium leading-[1.4] text-text-primary truncate">
                    {getUserShownName(appUser, user)}
                  </p>
                </div>
                <Link
                  role="menuitem"
                  href="/settings"
                  className="flex items-center gap-2.5 px-3 min-h-11 py-2.5 text-sm text-text-primary hover:bg-bg-secondary focus-visible:outline-none focus-visible:bg-bg-secondary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-line-green/30"
                  onClick={() => setShowUserMenu(false)}
                >
                  <Settings className="w-4 h-4 shrink-0" aria-hidden />
                  <span>ตั้งค่า</span>
                </Link>
                {isAdmin ? (
                  <Link
                    role="menuitem"
                    href="/admin"
                    className="flex items-center gap-2.5 px-3 min-h-11 py-2.5 text-sm text-text-primary hover:bg-bg-secondary focus-visible:outline-none focus-visible:bg-bg-secondary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-line-green/30"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <User className="w-4 h-4 shrink-0" aria-hidden />
                    <span>Admin Panel</span>
                  </Link>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 min-h-11 py-2.5 text-sm text-status-error hover:bg-status-error-light focus-visible:outline-none focus-visible:bg-status-error-light focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-status-error/35"
                >
                  <LogOut className="w-4 h-4 shrink-0" aria-hidden />
                  <span>ออกจากระบบ</span>
                </button>
              </div>
            </>,
            document.body
          )}

        <header className="hidden shell-desktop:block bg-bg-card border-b border-border-light sticky top-0 z-20">
          <div className="px-8 xl:px-12 py-6">
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <p className="text-sm text-text-secondary mb-1">ยินดีต้อนรับ</p>
                <h1 className="text-2xl font-semibold text-text-primary min-h-[2rem] text-balance leading-tight">
                  {authLoading && !user ? (
                    <span
                      className="inline-block h-7 w-48 max-w-full rounded bg-bg-tertiary animate-pulse align-middle"
                      aria-hidden
                    />
                  ) : (
                    <>
                      {greeting}
                      <UserNameSlot user={user} welcomeName={welcomeName} />
                    </>
                  )}
                </h1>
              </div>
            </div>
          </div>
        </header>

        <main className="relative z-[1] flex-1 min-w-0 w-full max-w-full overflow-x-clip bg-bg-secondary px-4 pt-5 pb-6 rounded-t-2xl -mt-3 sm:px-5 shell-desktop:mt-0 shell-desktop:rounded-none shell-desktop:px-8 shell-desktop:pt-8 shell-desktop:pb-8 xl:px-12 xl:pb-12">
          <HomeQuickMenu className={cn("mb-6", shellMobileOnly)} />

          <HomeDashboardSection
            {...dashboardProps}
            className="mt-0 w-full max-w-full"
          />
        </main>

        <BottomNav />
      </div>
    </div>
  );
}
