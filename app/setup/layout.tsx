import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ตั้งค่าระบบ | Found-U",
  robots: { index: false, follow: false },
};

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen text-text-primary">{children}</div>;
}
