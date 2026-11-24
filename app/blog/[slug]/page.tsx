"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArticleContent } from "@/components/blog/article-content";
import { getPublishedArticleBySlug } from "@/lib/blog/data";
import type { Article } from "@/lib/blog/types";
import { segmentAfter } from "@/lib/dynamic-segment";
import { focusRing } from "@/components/landing/landing-tokens";
import { cn } from "@/lib/utils";

export default function BlogArticlePage() {
  const pathname = usePathname();
  const slug = segmentAfter(pathname, "/blog");
  const [article, setArticle] = useState<Article | null | undefined>(undefined);

  useEffect(() => {
    if (!slug) {
      setArticle(null);
      return;
    }
    let cancelled = false;
    getPublishedArticleBySlug(slug, "blog")
      .then((row) => {
        if (!cancelled) setArticle(row);
      })
      .catch(() => {
        if (!cancelled) setArticle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (article === undefined) {
    return <div className="h-64 animate-pulse rounded-2xl border border-border-light bg-bg-primary" />;
  }

  if (!article) {
    return (
      <div className="rounded-2xl border border-border-light bg-bg-primary p-6 text-text-secondary">
        ไม่พบบทความ
      </div>
    );
  }

  return (
    <article className="space-y-8">
      <header className="space-y-4">
        <Link
          href="/blog"
          className={cn(
            "inline-flex text-sm text-text-secondary hover:text-line-green-link",
            focusRing
          )}
        >
          ← บทความทั้งหมด
        </Link>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-text-primary md:text-4xl">
          {article.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
          {article.author_name ? <span>{article.author_name}</span> : null}
          {article.published_at ? (
            <time dateTime={article.published_at}>
              {new Date(article.published_at).toLocaleDateString("th-TH", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          ) : null}
          {article.tags.map((tag) => (
            <Link
              key={tag}
              href={`/blog?tag=${encodeURIComponent(tag)}`}
              className={cn(
                "rounded-full bg-line-green-light px-2.5 py-0.5 text-xs font-medium text-line-green-link",
                focusRing
              )}
            >
              #{tag}
            </Link>
          ))}
        </div>
        {article.excerpt ? (
          <p className="max-w-[65ch] text-pretty text-lg leading-relaxed text-text-secondary">
            {article.excerpt}
          </p>
        ) : null}
      </header>

      {article.cover_image_url ? (
        <div className="relative aspect-[2/1] overflow-hidden rounded-2xl border border-border-light bg-bg-primary">
          <Image
            src={article.cover_image_url}
            alt=""
            fill
            className="object-cover"
            priority
            unoptimized
          />
        </div>
      ) : null}

      <ArticleContent doc={article.content_json} />
    </article>
  );
}
