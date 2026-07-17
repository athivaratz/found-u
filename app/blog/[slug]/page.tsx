import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleContent } from "@/components/blog/article-content";
import { getPublishedArticleBySlug } from "@/lib/blog/data";
import { focusRing } from "@/components/landing/landing-tokens";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug, "blog");
  if (!article) return { title: "ไม่พบบทความ" };

  return {
    title: article.title,
    description: article.excerpt ?? undefined,
    openGraph: {
      title: article.title,
      description: article.excerpt ?? undefined,
      type: "article",
      publishedTime: article.published_at ?? undefined,
      authors: article.author_name ? [article.author_name] : undefined,
      tags: article.tags,
      images: article.cover_image_url
        ? [{ url: article.cover_image_url }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.excerpt ?? undefined,
      images: article.cover_image_url ? [article.cover_image_url] : undefined,
    },
  };
}

export default async function BlogArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug, "blog");
  if (!article) notFound();

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
            unoptimized={article.cover_image_url.startsWith("http")}
          />
        </div>
      ) : null}

      <ArticleContent doc={article.content_json} />
    </article>
  );
}
