"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { segmentAfter } from "@/lib/dynamic-segment";

export default function NfcTagDeepLinkPage() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const tagId = segmentAfter(pathname, "/nfc/t").toUpperCase().trim();
    if (tagId) {
      router.replace(`/nfc/found?tag=${encodeURIComponent(tagId)}`);
    } else {
      router.replace("/nfc");
    }
  }, [pathname, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-[#06C755]" />
      <p className="text-sm text-gray-500">กำลังเปิดแท็ก NFC...</p>
    </div>
  );
}
