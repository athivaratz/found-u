import type { Metadata, Viewport } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { AppShell } from "@/components/providers/app-shell";
import { AndroidViewportGuard } from "@/components/layout/android-viewport-guard";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// The title in this file is the shell. Blog and help pages get their own
// tags from meta.php, which reads APP_URL at request time.
export const metadata: Metadata = {
  title: "foundu.forum",
  description: "ระบบแจ้งของหาย-ของเจอ",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
  themeColor: "#06C755",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={`${kanit.variable} antialiased font-sans`} suppressHydrationWarning>
        <ErrorBoundary>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="theme"
          >
            <AppShell>
              <AndroidViewportGuard />
              {children}
            </AppShell>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
