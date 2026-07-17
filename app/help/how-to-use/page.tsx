import type { Metadata } from "next";
import Link from "next/link";
import { HowToUseGuide } from "@/components/help/how-to-use-guide";
import { getHelpPageWithSections } from "@/lib/help/data";
import { focusRing } from "@/components/landing/landing-tokens";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getHelpPageWithSections("how-to-use");
  return {
    title: page?.title ?? "คู่มือการใช้งาน Found-U",
    description:
      page?.description ??
      "วิธีแจ้งของหาย ของเจอ ติดตามสถานะ ใช้แท็ก NFC และผู้ช่วย AI",
  };
}

export default async function HowToUseHelpPage() {
  const page = await getHelpPageWithSections("how-to-use");

  if (!page) {
    return (
      <div className="space-y-4 rounded-2xl border border-border-light bg-bg-primary p-6">
        <h1 className="text-2xl font-semibold text-text-primary">คู่มือการใช้งาน</h1>
        <p className="text-text-secondary">
          ยังโหลดเนื้อหาคู่มือไม่ได้ โปรดรัน migration ของฐานข้อมูลแล้วลองใหม่
        </p>
        <Link
          href="/"
          className={cn(
            "inline-flex min-h-11 items-center rounded-full bg-line-green-cta px-5 text-white",
            focusRing
          )}
        >
          กลับหน้าแรก
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium text-line-green-link">ภาคผนวก ข</p>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
          {page.title}
        </h1>
      </div>
      <HowToUseGuide intro={page.intro} sections={page.sections} />
    </div>
  );
}
