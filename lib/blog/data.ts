import { apiFetch } from "@/lib/api-client";
import { mapArticle } from "@/lib/blog/map";
import type { Article, ArticleSection } from "@/lib/blog/types";

export { mapArticle } from "@/lib/blog/map";

export async function listPublishedArticles(options?: {
  section?: ArticleSection;
  tag?: string;
}): Promise<Article[]> {
  const query = new URLSearchParams();
  if (options?.section) query.set("section", options.section);
  if (options?.tag) query.set("tag", options.tag);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const body = await apiFetch<{ articles?: Record<string, unknown>[] }>(`/api/articles${suffix}`);
  return (body.articles ?? []).map((row) => mapArticle(row));
}

export async function getPublishedArticleBySlug(
  slug: string,
  section?: ArticleSection
): Promise<Article | null> {
  const query = section ? `?section=${encodeURIComponent(section)}` : "";
  try {
    const body = await apiFetch<{ article?: Record<string, unknown> }>(
      `/api/articles/${encodeURIComponent(slug)}${query}`
    );
    return body.article ? mapArticle(body.article) : null;
  } catch {
    return null;
  }
}

// The static export cannot send the admin cookie at build time, and the
// preview page loads the draft in the browser instead.
export async function getArticleById(id: string): Promise<Article | null> {
  void id;
  return null;
}
