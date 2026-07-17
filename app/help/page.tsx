import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ChevronRight, School } from "lucide-react";
import { focusRing } from "@/components/landing/landing-tokens";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "ช่วยเหลือ — Found-U",
  description: "คู่มือการใช้งานและขั้นตอนติดตั้ง Found-U สำหรับโรงเรียน",
};

const GUIDES = [
  {
    href: "/help/how-to-use",
    title: "วิธีใช้งาน",
    description: "คู่มือสำหรับนักเรียนและแอดมิน — แจ้งของหาย ของเจอ ติดตามสถานะ NFC และผู้ช่วย AI",
    icon: BookOpen,
    eyebrow: "ภาคผนวก ข",
  },
  {
    href: "/help/new-school",
    title: "นำไปใช้ในโรงเรียนของคุณ",
    description: "ขั้นตอน Deploy ด้วย Vercel Setup Wizard และการตั้งค่าระบบครั้งแรก",
    icon: School,
    eyebrow: "ภาคผนวก ก",
  },
] as const;

export default function HelpIndexPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
          ศูนย์ช่วยเหลือ Found-U
        </h1>
        <p className="max-w-[65ch] text-pretty text-base leading-relaxed text-text-secondary">
          เลือกคู่มือที่ต้องการ อ่านได้โดยไม่ต้องเข้าสู่ระบบ
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {GUIDES.map((guide) => {
          const Icon = guide.icon;
          return (
            <li key={guide.href}>
              <Link
                href={guide.href}
                className={cn(
                  "group flex h-full flex-col gap-4 rounded-2xl border border-border-light bg-bg-primary p-5 transition-colors hover:border-line-green-cta/40 md:p-6",
                  focusRing
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-line-green-light text-line-green-link">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <ChevronRight
                    className="h-5 w-5 text-text-secondary transition-transform group-hover:translate-x-0.5 group-hover:text-line-green-link"
                    aria-hidden
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-line-green-link">
                    {guide.eyebrow}
                  </p>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {guide.title}
                  </h2>
                  <p className="text-pretty text-sm leading-relaxed text-text-secondary">
                    {guide.description}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
