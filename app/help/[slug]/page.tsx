import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleContent } from "@/components/blog/article-content";
import { HelpGuide } from "@/components/help/help-guide";
import { getHelpContent } from "@/lib/help/data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const content = await getHelpContent(slug);
  if (!content) return { title: "ไม่พบหน้าคู่มือ" };

  if (content.kind === "legacy") {
    return {
      title: content.page.title,
      description: content.page.description ?? undefined,
    };
  }

  return {
    title: content.article.title,
    description: content.article.excerpt ?? undefined,
  };
}

export default async function HelpSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const content = await getHelpContent(slug);

  if (!content) notFound();

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
