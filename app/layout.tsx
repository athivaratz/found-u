import type { Metadata, Viewport } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { DataProvider } from "@/contexts/DataContext";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import AuthGuard from "@/components/auth/auth-guard";
import { getDefaultAppUrl } from "@/lib/app-domains";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import { BfcacheRestoreHandler } from "@/components/bfcache-restore-handler";

// โหลดฟอนต์ Kanit สำหรับภาษาไทย
const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const defaultTitle = DEFAULT_APP_SETTINGS.ogTitle || "foundu.forum";
const defaultDescription =
  DEFAULT_APP_SETTINGS.ogDescription || "ระบบแจ้งของหาย-ของเจอ";

// Static metadata keeps the document cacheable for bfcache (no cookies()/no-store on HTML).
export const metadata: Metadata = {
  title: defaultTitle,
  description: defaultDescription,
  keywords: ["lost and found", "ของหาย", "แจ้งของหาย", "โรงเรียน"],
  authors: [{ name: "scfondue" }],
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/logo.png",
  },
  metadataBase: new URL(getDefaultAppUrl()),
  openGraph: {
    title: defaultTitle,
    description: defaultDescription,
    type: "website",
    siteName: "foundu.forum",
    locale: "th_TH",
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#06C755",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {process.env.NEXT_PUBLIC_SUPABASE_URL ? (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        ) : null}
        <link rel="dns-prefetch" href="https://api.supabase.com" />
      </head>
      <body className={`${kanit.variable} antialiased font-sans`} suppressHydrationWarning>
        <ErrorBoundary>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="theme"
          >
            <AuthProvider>
              <BfcacheRestoreHandler />
              <DataProvider>
                <AuthGuard>
                  {/* 
                    Responsive layout wrapper
                    - Mobile: max-w-md centered
                    - Desktop: Full width for better experience
                  */}
                  <div className="min-h-screen bg-bg-secondary transition-colors">
                    <div className="w-full min-h-screen bg-bg-primary transition-colors">
                      {children}
                    </div>
                  </div>
                </AuthGuard>
              </DataProvider>
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
