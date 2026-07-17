import type { Metadata } from "next";
import Link from "next/link";
import { GuideSection } from "@/components/help/guide-section";
import { GuideFaq } from "@/components/help/guide-faq";
import { getHelpPageWithSections } from "@/lib/help/data";
import { focusRing } from "@/components/landing/landing-tokens";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getHelpPageWithSections("new-school");
  return {
    title: page?.title ?? "นำ Found-U ไปใช้ในโรงเรียนของคุณ",
    description:
      page?.description ??
      "ขั้นตอนติดตั้ง Found-U ให้โรงเรียนใหม่ผ่าน Vercel และ Supabase",
  };
}

export default async function NewSchoolHelpPage() {
  const page = await getHelpPageWithSections("new-school");

  if (!page) {
    return (
      <div className="space-y-4 rounded-2xl border border-border-light bg-bg-primary p-6">
        <h1 className="text-2xl font-semibold text-text-primary">ติดตั้งโรงเรียนใหม่</h1>
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

  const steps = page.sections.filter(
    (section) => section.section_type === "step" || section.section_type === "note"
  );
  const faqs = page.sections.filter((section) => section.section_type === "faq");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium text-line-green-link">ภาคผนวก ก</p>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
          {page.title}
        </h1>
        {page.intro ? (
          <p className="max-w-[65ch] text-pretty text-base leading-relaxed text-text-secondary">
            {page.intro}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        {steps.map((section, index) => (
          <GuideSection
            key={section.id}
            title={section.title}
            body={section.body}
            imageUrl={section.image_url}
            stepNumber={section.section_type === "step" ? index + 1 : undefined}
          />
        ))}
      </div>

      <GuideFaq sections={faqs} />

      <p className="text-sm text-text-secondary">
        ดูคู่มือการใช้งานรายวันได้ที่{" "}
        <Link
          href="/help/how-to-use"
          className={cn(
            "font-medium text-line-green-link hover:underline",
            focusRing
          )}
        >
          วิธีใช้งาน Found-U
        </Link>
      </p>
    </div>
  );
}
