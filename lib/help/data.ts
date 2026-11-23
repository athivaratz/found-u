import { apiFetch } from "@/lib/api-client";
import { getPublishedArticleBySlug } from "@/lib/blog/data";
import type { Article } from "@/lib/blog/types";
import type { HelpPage, HelpPageWithSections, HelpSection } from "@/lib/help/types";

type HelpPayload = {
  page?: HelpPage;
  sections?: HelpSection[];
};

export async function getHelpPageWithSections(slug: string): Promise<HelpPageWithSections | null> {
  try {
    const body = await apiFetch<HelpPayload>(`/api/help/${encodeURIComponent(slug)}`);
    if (!body.page) return null;
    return { ...body.page, sections: body.sections ?? [] };
  } catch {
    return null;
  }
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
  let legacy: HelpPage[] = [];
  try {
    const legacyBody = await apiFetch<{ pages?: HelpPage[] }>("/api/admin/help-pages");
    legacy = legacyBody.pages ?? [];
  } catch {
    legacy = [];
  }
  let articles: Array<Record<string, unknown>> = [];
  try {
    const articleBody = await apiFetch<{ articles?: Array<Record<string, unknown>> }>(
      "/api/articles?section=help"
    );
    articles = articleBody.articles ?? [];
  } catch {
    articles = [];
  }
  const legacySlugs = new Set(legacy.map((page) => page.slug));
  const fromArticles: HelpPage[] = articles
    .filter((row) => !legacySlugs.has(String(row.slug ?? "")))
    .map((row) => ({
      slug: String(row.slug ?? ""),
      title: String(row.title ?? ""),
      description: row.excerpt == null ? null : String(row.excerpt),
      intro: null,
      updated_at: String(row.updated_at ?? new Date().toISOString()),
    }));
  return [...legacy, ...fromArticles];
}
