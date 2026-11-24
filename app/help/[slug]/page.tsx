"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArticleContent } from "@/components/blog/article-content";
import { HelpGuide } from "@/components/help/help-guide";
import { getHelpContent } from "@/lib/help/data";
import { segmentAfter } from "@/lib/dynamic-segment";

type Content = Awaited<ReturnType<typeof getHelpContent>>;

export default function HelpSlugPage() {
  const pathname = usePathname();
  const slug = segmentAfter(pathname, "/help");
  const [content, setContent] = useState<Content | undefined>(undefined);

  useEffect(() => {
    if (!slug) {
      setContent(null);
      return;
    }
    let cancelled = false;
    getHelpContent(slug)
      .then((row) => {
        if (!cancelled) setContent(row);
      })
      .catch(() => {
        if (!cancelled) setContent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (content === undefined) {
    return <div className="h-64 animate-pulse rounded-2xl border border-border-light bg-bg-primary" />;
  }

  if (!content) {
    return (
      <div className="rounded-2xl border border-border-light bg-bg-primary p-6 text-text-secondary">
        ไม่พบหน้าคู่มือ
      </div>
    );
  }

  if (content.kind === "article") {
    const { article } = content;
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
            {article.title}
          </h1>
          {article.excerpt ? (
            <p className="max-w-[65ch] text-pretty text-base leading-relaxed text-text-secondary">
              {article.excerpt}
            </p>
          ) : null}
        </div>
        <ArticleContent doc={article.content_json} />
      </div>
    );
  }

  const { page } = content;
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
          {page.title}
        </h1>
      </div>
      <HelpGuide intro={page.intro} sections={page.sections} />
    </div>
  );
}
