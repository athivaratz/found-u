/**
 * Shared layout tokens for student app shells.
 * Sidebar = 288px (w-72). Desktop shell = landscape tablet+ (see shell-desktop in globals.css).
 */
export const shellSidebarWidth = "w-72";

/** Mobile / portrait tablet — bottom nav, no sidebar */
export const shellMobileOnly = "shell-desktop:hidden";

/** Desktop shell — fixed sidebar + main inset */
export const shellDesktopOnly = "hidden shell-desktop:flex";

export const shellSidebarInset = "shell-desktop:ml-72";
export const shellSidebarPadding = "shell-desktop:pl-72";

/** Desktop main column — use on shells that own page padding (StudentAppShell) */
export const shellDesktopMain = "flex-1 min-h-screen bg-bg-secondary";
export const shellDesktopPadding = "px-5 shell-desktop:px-8 xl:px-12 py-6 shell-desktop:py-8";

/** Assistant desktop column */
export const shellAssistantDesktopPadding = "px-5 py-5";
export const shellAssistantMaxWidth = "max-w-6xl";
