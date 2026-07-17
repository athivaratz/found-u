"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type HelpPageRow = {
  slug: string;
  title: string;
  description: string | null;
};

export default function AdminHelpIndexPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<HelpPageRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("help_pages")
        .select("slug, title, description")
        .order("slug", { ascending: true });
      if (error) throw error;
      setPages(
        (data ?? []).map((row) => ({
          slug: String(row.slug),
          title: String(row.title ?? ""),
          description: row.description == null ? null : String(row.description),
        }))
      );
    } catch (error) {
      console.error(error);
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

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

      {loading ? (
        <div className="min-h-[20vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#06C755]" />
        </div>
      ) : pages.length === 0 ? (
        <p className="text-sm text-gray-500">ยังไม่มีหน้าคู่มือในฐานข้อมูล</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {pages.map((page) => (
            <div
              key={page.slug}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4"
            >
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  {page.title}
                </h2>
                {page.description ? (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {page.description}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/help/${page.slug}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#06C755] text-white text-sm font-medium hover:bg-[#05b34d]"
                >
                  แก้ไข
                  <ChevronRight className="w-4 h-4" />
                </Link>
                <Link
                  href={`/help/${page.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  เปิดหน้าสาธารณะ
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
