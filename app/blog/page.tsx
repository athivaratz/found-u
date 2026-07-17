import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listPublishedArticles } from "@/lib/blog/data";
import { focusRing } from "@/components/landing/landing-tokens";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "บทความ — Found-U",
  description: "บทความ คู่มือ และอัปเดตจากทีม Found-U",
};

type PageProps = {
  searchParams: Promise<{ tag?: string }>;
};

export default async function BlogIndexPage({ searchParams }: PageProps) {
  const { tag } = await searchParams;
  const articles = await listPublishedArticles({
    section: "blog",
    tag: tag?.trim() || undefined,
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
          บทความ
        </h1>
        <p className="max-w-[65ch] text-pretty text-base leading-relaxed text-text-secondary">
          คู่มือ อัปเดต และเรื่องราวจาก Found-U
          {tag ? (
            <>
              {" "}
              · กรองแท็ก{" "}
              <span className="font-medium text-line-green-link">#{tag}</span>
              {" · "}
              <Link
                href="/blog"
                className={cn("underline hover:text-line-green-link", focusRing)}
              >
                ล้างตัวกรอง
              </Link>
            </>
          ) : null}
        </p>
      </div>

      {articles.length === 0 ? (
        <div className="rounded-2xl border border-border-light bg-bg-primary p-6 text-text-secondary">
          ยังไม่มีบทความที่เผยแพร่
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {articles.map((article) => (
            <li key={article.id}>
              <Link
                href={`/blog/${article.slug}`}
                className={cn(
                  "group flex h-full flex-col overflow-hidden rounded-2xl border border-border-light bg-bg-primary transition-colors hover:border-line-green-cta/40",
                  focusRing
                )}
              >
                {article.cover_image_url ? (
                  <div className="relative aspect-[16/9] bg-bg-secondary">
                    <Image
                      src={article.cover_image_url}
                      alt=""
                      fill
                      className="object-cover"
                      unoptimized={article.cover_image_url.startsWith("http")}
                    />
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <h2 className="text-lg font-semibold text-text-primary group-hover:text-line-green-link">
                    {article.title}
                  </h2>
                  {article.excerpt ? (
                    <p className="line-clamp-3 text-sm leading-relaxed text-text-secondary">
                      {article.excerpt}
                    </p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs text-text-secondary">
                    {article.author_name ? <span>{article.author_name}</span> : null}
                    {article.published_at ? (
                      <span>
                        {new Date(article.published_at).toLocaleDateString("th-TH", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    ) : null}
                    {article.tags.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-line-green-light px-2 py-0.5 text-line-green-link"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
