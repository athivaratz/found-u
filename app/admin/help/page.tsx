"use client";

import Link from "next/link";
import { BookOpen, ChevronRight, ExternalLink } from "lucide-react";
import { HELP_SLUGS } from "@/lib/help/types";

const PAGE_META: Record<
  (typeof HELP_SLUGS)[number],
  { title: string; description: string; publicPath: string }
> = {
  "how-to-use": {
    title: "คู่มือการใช้งาน",
    description: "แก้ไขขั้นตอนสำหรับนักเรียนและแอดมิน",
    publicPath: "/help/how-to-use",
  },
  "new-school": {
    title: "ติดตั้งโรงเรียนใหม่",
    description: "แก้ไขขั้นตอน Deploy และ Setup Wizard",
    publicPath: "/help/new-school",
  },
};

export default function AdminHelpIndexPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-[#06C755]" />
          หน้าช่วยเหลือ
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          แก้ไขเนื้อหาคู่มือสาธารณะที่แสดงใน /help โดยไม่ต้องแก้โค้ด
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {HELP_SLUGS.map((slug) => {
          const meta = PAGE_META[slug];
          return (
            <div
              key={slug}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4"
            >
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  {meta.title}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {meta.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/help/${slug}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#06C755] text-white text-sm font-medium hover:bg-[#05b34d]"
                >
                  แก้ไข
                  <ChevronRight className="w-4 h-4" />
                </Link>
                <Link
                  href={meta.publicPath}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  เปิดหน้าสาธารณะ
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
