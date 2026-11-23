import { mapArticle } from "@/lib/blog/map";
import type { Article, ArticleSection } from "@/lib/blog/types";
import { phpGet } from "@/lib/php-origin";

export { mapArticle } from "@/lib/blog/map";

export async function listPublishedArticles(options?: {
  section?: ArticleSection;
  tag?: string;
}): Promise<Article[]> {
  const query = new URLSearchParams();
  if (options?.section) query.set("section", options.section);
  if (options?.tag) query.set("tag", options.tag);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const body = await phpGet<{ articles?: Record<string, unknown>[] }>(`/api/articles${suffix}`);
  return (body?.articles ?? []).map((row) => mapArticle(row));
}

export async function getPublishedArticleBySlug(
  slug: string,
  section?: ArticleSection
): Promise<Article | null> {
  const query = section ? `?section=${encodeURIComponent(section)}` : "";
  const body = await phpGet<{ article?: Record<string, unknown> }>(
    `/api/articles/${encodeURIComponent(slug)}${query}`
  );
  return body?.article ? mapArticle(body.article) : null;
}

// Drafts need the admin cookie. Static export cannot forward it, so this
// stays empty until P11 decides how preview works.
export async function getArticleById(id: string): Promise<Article | null> {
  void id;
  return null;
}
