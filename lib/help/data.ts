import { getPublishedArticleBySlug } from "@/lib/blog/data";
import type { Article } from "@/lib/blog/types";
import type { HelpPage, HelpPageWithSections, HelpSection } from "@/lib/help/types";
import { phpGet } from "@/lib/php-origin";

type HelpPayload = {
  page?: HelpPage;
  sections?: HelpSection[];
};

export async function getHelpPageWithSections(slug: string): Promise<HelpPageWithSections | null> {
  const body = await phpGet<HelpPayload>(`/api/help/${encodeURIComponent(slug)}`);
  if (!body?.page) return null;
  return { ...body.page, sections: body.sections ?? [] };
}

export async function getHelpContent(
  slug: string
): Promise<
  | { kind: "legacy"; page: HelpPageWithSections }
  | { kind: "article"; article: Article }
  | null
> {
  const article = await getPublishedArticleBySlug(slug, "help");
  if (article) return { kind: "article", article };

  const legacy = await getHelpPageWithSections(slug);
  if (legacy) return { kind: "legacy", page: legacy };

  return null;
}

export async function listHelpPages(): Promise<HelpPage[]> {
  const [legacyBody, articleBody] = await Promise.all([
    phpGet<{ pages?: HelpPage[] }>("/api/admin/help-pages"),
    phpGet<{ articles?: Array<Record<string, unknown>> }>("/api/articles?section=help"),
  ]);
  const legacy = legacyBody?.pages ?? [];
  const legacySlugs = new Set(legacy.map((page) => page.slug));
  const fromArticles: HelpPage[] = (articleBody?.articles ?? [])
    .filter((row) => !legacySlugs.has(String(row.slug ?? "")))
    .map((row) => ({
      slug: String(row.slug ?? ""),
      title: String(row.title ?? ""),
      description: row.excerpt == null ? null : String(row.excerpt),
      intro: null,
      updated_at: String(row.updated_at ?? new Date().toISOString()),
    }));
  if (legacy.length > 0 || fromArticles.length > 0) {
    return [...legacy, ...fromArticles];
  }
  const published = articleBody?.articles ?? [];
  return published.map((row) => ({
    slug: String(row.slug ?? ""),
    title: String(row.title ?? ""),
    description: row.excerpt == null ? null : String(row.excerpt),
    intro: null,
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  }));
}
