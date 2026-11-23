"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArticleContent } from "@/components/blog/article-content";
import { apiFetch } from "@/lib/api-client";
import { mapArticle } from "@/lib/blog/map";
import type { Article } from "@/lib/blog/types";
import { segmentAfter } from "@/lib/dynamic-segment";
import { focusRing, shell } from "@/components/landing/landing-tokens";
import { cn } from "@/lib/utils";

export default function AdminBlogPreviewPage() {
  const pathname = usePathname();
  const id = segmentAfter(pathname, "/admin/blog");
  const [article, setArticle] = useState<Article | null | undefined>(undefined);

  useEffect(() => {
    if (!id || id === "legacy") {
      setArticle(null);
      return;
    }
    let cancelled = false;
    apiFetch<{ article?: Record<string, unknown> }>(`/api/admin/articles/${encodeURIComponent(id)}`)
      .then((body) => {
        if (!cancelled) setArticle(body.article ? mapArticle(body.article) : null);
      })
      .catch(() => {
        if (!cancelled) setArticle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (article === undefined) {
    return <div className="min-h-screen bg-bg-secondary" />;
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-bg-secondary p-8 text-text-secondary">
        ไม่พบบทความ
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-secondary text-text-primary">
      <div className="border-b border-border-light bg-amber-50 dark:bg-amber-950/40 px-4 py-3">
        <div className={cn(shell, "flex flex-wrap items-center justify-between gap-2 text-sm")}>
          <p className="text-amber-800 dark:text-amber-200">
            โหมดตัวอย่างแอดมิน
            {article.status === "draft" ? " · ฉบับร่าง (ยังไม่เผยแพร่)" : " · เผยแพร่แล้ว"}
          </p>
          <div className="flex gap-3">
            <Link
              href={`/admin/blog/${id}`}
              className={cn("font-medium text-line-green-link hover:underline", focusRing)}
            >
              กลับไปแก้ไข
            </Link>
            <Link
              href="/admin/blog"
              className={cn("text-text-secondary hover:underline", focusRing)}
            >
              รายการบทความ
            </Link>
          </div>
        </div>
      </div>

      <main className={cn(shell, "py-8 md:py-12 space-y-6")}>
        <header className="space-y-3">
          <p className="text-sm text-line-green-link">
            จะแสดงที่ /{article.section}/{article.slug}
          </p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            {article.title}
          </h1>
          {article.excerpt ? (
            <p className="max-w-[65ch] text-pretty text-lg leading-relaxed text-text-secondary">
              {article.excerpt}
            </p>
          ) : null}
        </header>
        <ArticleContent doc={article.content_json} />
      </main>
    </div>
  );
}
