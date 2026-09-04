import type { Metadata } from "next";
import { DiscordVerificationPanel } from "./verification-panel";

export const metadata: Metadata = {
  title: "ยืนยัน Discord | Found-U",
  robots: { index: false, follow: false },
};

export default function DiscordVerifyPage() {
  return <DiscordVerificationPanel />;
}
