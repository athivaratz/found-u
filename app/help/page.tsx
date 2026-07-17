import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { listHelpPages } from "@/lib/help/data";
import { focusRing } from "@/components/landing/landing-tokens";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ช่วยเหลือ — Found-U",
  description: "คู่มือการใช้งานและขั้นตอนติดตั้ง Found-U สำหรับโรงเรียน",
};

export default async function HelpIndexPage() {
  const pages = await listHelpPages();

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

      {pages.length === 0 ? (
        <div className="rounded-2xl border border-border-light bg-bg-primary p-6 text-text-secondary">
          ยังไม่มีหน้าคู่มือในฐานข้อมูล
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {pages.map((page) => (
            <li key={page.slug}>
              <Link
                href={`/help/${page.slug}`}
                className={cn(
                  "group flex h-full flex-col gap-4 rounded-2xl border border-border-light bg-bg-primary p-5 transition-colors hover:border-line-green-cta/40 md:p-6",
                  focusRing
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-line-green-light text-line-green-link">
                    <BookOpen className="h-5 w-5" aria-hidden />
                  </span>
                  <ChevronRight
                    className="h-5 w-5 text-text-secondary transition-transform group-hover:translate-x-0.5 group-hover:text-line-green-link"
                    aria-hidden
                  />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-text-primary">
                    {page.title}
                  </h2>
                  {page.description ? (
                    <p className="text-pretty text-sm leading-relaxed text-text-secondary">
                      {page.description}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
