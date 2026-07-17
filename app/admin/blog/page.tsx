"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  ExternalLink,
  Loader2,
  Newspaper,
  Plus,
  Search,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { EMPTY_DOC, slugifyTitle, type ArticleSection } from "@/lib/blog/types";
import { mapArticle } from "@/lib/blog/map";
import type { Article } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

type SectionFilter = "all" | ArticleSection;

type LegacyHelpPage = {
  slug: string;
  title: string;
  description: string | null;
};

function AdminBlogListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSection = (searchParams.get("section") as SectionFilter) || "all";
  const supabase = useMemo(() => createClient(), []);
  const { showAlert, dialog } = useAppDialog();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [legacyHelp, setLegacyHelp] = useState<LegacyHelpPage[]>([]);
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>(
    initialSection === "blog" || initialSection === "help" ? initialSection : "all"
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: articleRows, error: articleError }, { data: helpRows, error: helpError }] =
        await Promise.all([
          supabase.from("articles").select("*").order("updated_at", { ascending: false }),
          supabase
            .from("help_pages")
            .select("slug, title, description")
            .order("slug", { ascending: true }),
        ]);
      if (articleError) throw articleError;
      if (helpError) throw helpError;
      setArticles(
        (articleRows ?? []).map((row) => mapArticle(row as Record<string, unknown>))
      );
      setLegacyHelp(
        (helpRows ?? []).map((row) => ({
          slug: String(row.slug),
          title: String(row.title ?? ""),
          description: row.description == null ? null : String(row.description),
        }))
      );
    } catch (error) {
      console.error(error);
      await showAlert({
        title: "โหลดไม่สำเร็จ",
        message: "ไม่สามารถโหลดรายการเนื้อหาได้",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showAlert, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const next = searchParams.get("section");
    if (next === "blog" || next === "help" || next === "all") {
      setSectionFilter(next === "all" ? "all" : next);
    }
  }, [searchParams]);

  const setFilter = (value: SectionFilter) => {
    setSectionFilter(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("section");
    else params.set("section", value);
    const qs = params.toString();
    router.replace(qs ? `/admin/blog?${qs}` : "/admin/blog");
  };

  const filteredArticles = articles.filter((a) => {
    if (sectionFilter !== "all" && a.section !== sectionFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      a.title.toLowerCase().includes(q) ||
      a.slug.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const filteredLegacy =
    sectionFilter === "blog"
      ? []
      : legacyHelp.filter((page) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return (
            page.title.toLowerCase().includes(q) ||
            page.slug.toLowerCase().includes(q) ||
            (page.description ?? "").toLowerCase().includes(q)
          );
        });

  const createDraft = async (section: ArticleSection = "blog") => {
    setCreating(true);
    try {
      const title = section === "help" ? "คู่มือใหม่" : "บทความใหม่";
      const baseSlug = slugifyTitle(title);
      const slug = `${baseSlug}-${Date.now().toString(36)}`;
      const { data, error } = await supabase
        .from("articles")
        .insert({
          title,
          slug,
          section,
          status: "draft",
          content_json: EMPTY_DOC,
        })
        .select("id")
        .single();
      if (error) throw error;
      router.push(`/admin/blog/${data.id}`);
    } catch (error) {
      await showAlert({
        title: "สร้างไม่สำเร็จ",
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
        variant: "error",
      });
      setCreating(false);
    }
  };

  const filters: { id: SectionFilter; label: string }[] = [
    { id: "all", label: "ทั้งหมด" },
    { id: "blog", label: "/blog" },
    { id: "help", label: "/help" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Newspaper className="w-7 h-7 text-[#06C755]" />
            บทความและคู่มือ
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            เขียนด้วย rich text แล้วเผยแพร่ที่ /blog หรือ /help — รวมถึงแก้ไขคู่มือเดิม
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void createDraft("help")}
            disabled={creating}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-medium disabled:opacity-50"
          >
            <BookOpen className="w-4 h-4" />
            สร้างคู่มือ /help
          </button>
          <button
            type="button"
            onClick={() => void createDraft("blog")}
            disabled={creating}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#06C755] text-white text-sm font-medium hover:bg-[#05b34d] disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            สร้างบทความ
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium",
              sectionFilter === f.id
                ? "bg-[#06C755] text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อ slug หรือแท็ก…"
          className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 pl-10 pr-4 py-3"
        />
      </div>

      {loading ? (
        <div className="min-h-[20vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#06C755]" />
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              บทความ (Rich editor)
            </h2>
            {filteredArticles.length === 0 ? (
              <p className="text-sm text-gray-500">ยังไม่มีบทความในตัวกรองนี้</p>
            ) : (
              <div className="space-y-3">
                {filteredArticles.map((article) => {
                  const publicPath =
                    article.section === "help"
                      ? `/help/${article.slug}`
                      : `/blog/${article.slug}`;
                  return (
                    <div
                      key={article.id}
                      className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span
                            className={`px-2 py-0.5 rounded-full ${
                              article.status === "published"
                                ? "bg-[#e8f8ef] text-[#06C755]"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                            }`}
                          >
                            {article.status === "published"
                              ? "เผยแพร่แล้ว"
                              : "ฉบับร่าง"}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">
                            /{article.section}
                          </span>
                        </div>
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                          {article.title}
                        </h3>
                        <p className="text-xs text-gray-500 font-mono">
                          {article.slug}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/blog/${article.id}`}
                          className="px-4 py-2 rounded-full bg-[#06C755] text-white text-sm font-medium"
                        >
                          แก้ไข
                        </Link>
                        {article.status === "published" ? (
                          <Link
                            href={publicPath}
                            target="_blank"
                            className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-700 text-sm"
                          >
                            เปิด
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        ) : (
                          <Link
                            href={`/admin/blog/${article.id}/preview`}
                            className="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-700 text-sm"
                          >
                            ตัวอย่าง
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {filteredLegacy.length > 0 ? (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  คู่มือเดิม (Help CMS)
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  หน้าคู่มือแบบ section เก่า — แนะนำสร้างใหม่ด้วย rich editor แล้วเลือกปลายทาง /help
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredLegacy.map((page) => (
                  <div
                    key={page.slug}
                    className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 space-y-3"
                  >
                    <div>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">
                        legacy /help
                      </span>
                      <h3 className="mt-2 font-semibold text-gray-900 dark:text-white">
                        {page.title}
                      </h3>
                      {page.description ? (
                        <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                          {page.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/blog/legacy/${page.slug}`}
                        className="px-4 py-2 rounded-full bg-[#06C755] text-white text-sm font-medium"
                      >
                        แก้ไข
                      </Link>
                      <Link
                        href={`/help/${page.slug}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-700 text-sm"
                      >
                        เปิด
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
      {dialog}
    </div>
  );
}

export default function AdminBlogListPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          กำลังโหลด...
        </div>
      }
    >
      <AdminBlogListContent />
    </Suspense>
  );
}
